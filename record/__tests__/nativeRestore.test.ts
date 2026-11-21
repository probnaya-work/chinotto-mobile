import { zipSync, strToU8 } from 'fflate';
import { openTestDb } from '../__testsupport__/nodeSqliteDb';
import { migrate } from '../migrate';
import { prepareNativeRestore, recoverInterruptedRestores } from '../nativeRestore';
import { Directory, File, Paths } from 'expo-file-system';
import { mkdtempSync, rmSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

jest.mock('expo-crypto', () => {
  const crypto = require('node:crypto');
  return { randomUUID: () => crypto.randomUUID(), CryptoDigestAlgorithm: { SHA256: 'SHA256' }, digestStringAsync: async (_: string, s: string) => crypto.createHash('sha256').update(s).digest('hex') };
});
jest.mock('expo-sqlite', () => ({
  openDatabaseAsync: async (name: string, _: unknown, directory: string) => ({ path: `${directory}/${name}`, closeAsync: async () => {} }),
  backupDatabaseAsync: async ({ sourceDatabase, destDatabase }: any) => { await require('node:sqlite').backup(sourceDatabase.raw, destDatabase.path); },
}));
jest.mock('expo-file-system', () => {
  const fs = require('node:fs'); const path = require('node:path');
  const uri = (root: string | { uri: string }, name?: string) => name ? path.join(typeof root === 'string' ? root : root.uri, name) : typeof root === 'string' ? root : root.uri;
  class File {
    uri: string;
    constructor(root: string | { uri: string }, name?: string) { this.uri = uri(root, name); }
    get exists() { return fs.existsSync(this.uri); }
    get size() { return fs.statSync(this.uri).size; }
    get name() { return path.basename(this.uri); }
    create() { fs.writeFileSync(this.uri, ''); }
    write(text: string) { fs.writeFileSync(this.uri, text); }
    text() { return Promise.resolve(fs.readFileSync(this.uri, 'utf8')); }
    moveSync(target: File) { fs.renameSync(this.uri, target.uri); this.uri = target.uri; }
    copy(target: File) { fs.copyFileSync(this.uri, target.uri, fs.constants.COPYFILE_EXCL); }
    delete() { fs.unlinkSync(this.uri); }
    open() {
      const fd = fs.openSync(this.uri, 'r+');
      return { offset: 0, readBytesSync(length: number) { const bytes = Buffer.alloc(length); const n = fs.readSync(fd, bytes, 0, length, this.offset); this.offset += n; return new Uint8Array(bytes.subarray(0, n)); }, writeBytesSync(bytes: Uint8Array) { fs.writeSync(fd, bytes, 0, bytes.length, this.offset); this.offset += bytes.length; }, close() { fs.closeSync(fd); } };
    }
  }
  class Directory {
    uri: string;
    constructor(root: string | { uri: string }, name?: string) { this.uri = uri(root, name); }
    get exists() { return fs.existsSync(this.uri); }
    create() { fs.mkdirSync(this.uri, { recursive: true }); }
    delete() { fs.rmSync(this.uri, { recursive: true }); }
    list() { return fs.readdirSync(this.uri, { withFileTypes: true }).map((e: any) => e.isDirectory() ? new Directory(this, e.name) : new File(this, e.name)); }
  }
  return { File, Directory, Paths: { document: { uri: '' }, cache: { uri: '' } } };
});
let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'chinotto-native-restore-'));
  (Paths.document as { uri: string }).uri = join(root, 'documents'); (Paths.cache as { uri: string }).uri = join(root, 'cache');
  new Directory(Paths.document).create(); new Directory(Paths.cache).create();
});
afterEach(() => rmSync(root, { recursive: true, force: true }));
const moment = { version: 1, id: 'voice', body: 'original voice', captured_at: '2020-01-01T00:00:00Z', capture_method: 'voice', voice_capture: { recorded_at: '2020-01-01T00:00:00Z', audio_incomplete: 1 }, audio: { path: 'chinotto-record/audio/voice.caf', bytes: 5 } };
function archive() {
  const file = new File(Paths.cache, 'selected.zip'); file.create();
  const zip = zipSync({ 'chinotto-record/record.jsonl': strToU8(JSON.stringify(moment)), 'chinotto-record/audio/voice.caf': strToU8('audio') });
  const h = file.open(); h.writeBytesSync(zip); h.close(); return file.uri;
}
it('stages without live writes, makes a recoverable SQLite copy and installs CAF once', async () => {
  const db = openTestDb(); await migrate(db);
  const prepared = await prepareNativeRestore(db, archive(), new AbortController().signal, () => true);
  expect(prepared.preview).toMatchObject({ newMoments: 1, audioFiles: 1 });
  expect(await db.getFirstAsync('SELECT COUNT(*) AS n FROM fragments')).toEqual({ n: 0 });
  await prepared.restore(); prepared.dispose();
  const voice = await db.getFirstAsync<{ audio_path: string }>('SELECT audio_path FROM voice_captures');
  expect(voice!.audio_path.endsWith('.caf')).toBe(true); expect(readFileSync(join(Paths.document.uri, voice!.audio_path), 'utf8')).toBe('audio');
  const recovery = join(Paths.document.uri, 'chinotto/recovery'); const snapshot = openTestDb(join(recovery, readdirSync(recovery).find((n) => n.endsWith('.db'))!));
  expect(await snapshot.getFirstAsync('SELECT COUNT(*) AS n FROM fragments')).toEqual({ n: 0 }); snapshot.close();
  const again = await prepareNativeRestore(db, archive(), new AbortController().signal, () => true); await again.restore(); again.dispose();
  expect(readdirSync(join(Paths.document.uri, 'chinotto/audio'))).toHaveLength(1); db.close();
});
it('rolls back on relock and recovers interrupted audio without touching committed files', async () => {
  const db = openTestDb(); await migrate(db); let allowed = true;
  const prepared = await prepareNativeRestore(db, archive(), new AbortController().signal, () => allowed); allowed = false;
  await expect(prepared.restore()).rejects.toThrow('cancelled'); prepared.dispose();
  const audio = new Directory(Paths.document, 'chinotto/audio'); audio.create();
  const orphan = new File(audio, 'restored-crash.caf'); orphan.create();
  const ordinary = new File(audio, 'capture.caf'); ordinary.create();
  const recovery = new Directory(Paths.document, 'chinotto/recovery'); recovery.create();
  const journal = new File(recovery, 'restore-crash.json'); journal.create(); journal.write(JSON.stringify(['chinotto/audio/restored-crash.caf']));
  await recoverInterruptedRestores(db); expect(orphan.exists).toBe(false); expect(ordinary.exists).toBe(true); expect(journal.exists).toBe(false); db.close();
});
it('rejects a damaged archive before touching the Record', async () => {
  const db = openTestDb(); await migrate(db); const file = new File(Paths.cache, 'damaged.zip'); file.create(); file.write('not a zip');
  await expect(prepareNativeRestore(db, file.uri, new AbortController().signal, () => true)).rejects.toThrow();
  expect(readdirSync(Paths.cache.uri).filter((n) => n.startsWith('record-import-'))).toHaveLength(0); db.close();
});
