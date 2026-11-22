import { Directory, File, Paths } from 'expo-file-system';
import { randomUUID, digestStringAsync, CryptoDigestAlgorithm } from 'expo-crypto';
import { backupDatabaseAsync, openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';
import type { RecordDb } from './db';
import { openArchiveZip } from './readArchiveZip';
import { readRecordArchive } from './archiveFormat';
import { previewRecordRestore, restoreRecord, type RestoreFiles } from './restoreRecord';
import { AUDIO_DIR, isRetainedAudioPath, hasFileSystem } from './files';

const RECOVERY = 'chinotto/recovery';
const digest = (text: string) => digestStringAsync(CryptoDigestAlgorithm.SHA256, text);
const stop = (signal: AbortSignal, allowed: () => boolean) => {
  if (signal.aborted || !allowed()) throw new Error('Restore cancelled. Your existing Record is unchanged.');
};
function directory(root: Directory, name: string) {
  const dir = new Directory(root, name);
  dir.create({ intermediates: true, idempotent: true });
  return dir;
}
/** Run before orphan recording recovery: staged, uncommitted audio is not a capture. */
export async function recoverInterruptedRestores(db: RecordDb) {
  if (!hasFileSystem()) return;
  const recovery = new Directory(Paths.document, RECOVERY);
  if (!recovery.exists) return;
  for (const entry of recovery.list()) {
    if (!(entry instanceof File) || !/^restore-[a-zA-Z0-9-]+\.json$/.test(entry.name)) continue;
    const paths: unknown = JSON.parse(await entry.text());
    if (!Array.isArray(paths) || paths.some((p) => typeof p !== 'string' || !isRetainedAudioPath(p) || !p.startsWith(`${AUDIO_DIR}/restored-`))) {
      throw new Error('An interrupted restore could not be recovered safely.');
    }
    for (const path of paths as string[]) {
      const used = await db.getFirstAsync('SELECT fragment_id FROM voice_captures WHERE audio_path = ?', path);
      const file = new File(Paths.document, path);
      if (!used && file.exists) file.delete();
    }
    entry.delete();
  }
}
export async function prepareNativeRestore(db: RecordDb, uri: string, signal: AbortSignal, allowed: () => boolean) {
  const batch = randomUUID();
  const stage = directory(Paths.cache, `record-import-${batch}`);
  const source = new File(uri);
  let reader: ReturnType<File['open']> | null = null;
  const dispose = () => { try { if (stage.exists) stage.delete(); } catch { /* Retry abandoned staging cleanup on launch. */ } };
  try {
    stop(signal, allowed);
    reader = source.open();
    const zip = await openArchiveZip({ size: source.size, read: (offset, length) => {
      stop(signal, allowed); reader!.offset = offset; return reader!.readBytesSync(length);
    } });
    if (!zip.entries.has('chinotto-record/record.jsonl')) throw new Error('This older export contains readable text only. A full Record archive is required for restoration.');
    if (zip.entries.has('chinotto-record/manifest.json')) {
      let manifest = '';
      await zip.extract('chinotto-record/manifest.json', (chunk) => {
        manifest += new TextDecoder().decode(chunk);
        if (manifest.length > 4096) throw new Error('Invalid archive manifest.');
      }, signal);
      const info = JSON.parse(manifest);
      if (info.format !== 'chinotto-record' || info.version !== 1) throw new Error('This Record archive version is not supported.');
    }
    const archive = await readRecordArchive(await zip.jsonLines('chinotto-record/record.jsonl', signal),
      zip.entries.has('chinotto-record/archived.jsonl') ? await zip.jsonLines('chinotto-record/archived.jsonl', signal) : [], digest);
    const staged = new Map<string, File>();
    for (const [i, moment] of archive.moments.entries()) {
      stop(signal, allowed);
      if (!moment.audio) continue;
      if (zip.entries.get(moment.audio.path)?.size !== moment.audio.bytes) throw new Error('A recording listed in the archive is missing or incomplete.');
      const file = new File(stage, `${i}.audio`); file.create(); const handle = file.open();
      try { await zip.extract(moment.audio.path, (bytes) => { stop(signal, allowed); handle.writeBytesSync(bytes); }, signal); }
      finally { handle.close(); }
      staged.set(String(moment.fragment.id), file);
    }
    const preview = await previewRecordRestore(db, archive, digest);
    stop(signal, allowed);
    const installed: string[] = [];
    let nextVoice = 0;
    const recovery = directory(Paths.document, RECOVERY);
    const journals: File[] = [];
    const files: RestoreFiles = {
      recovery: async (live) => {
        const name = `before-restore-${batch}.db`;
        const snapshot = await openDatabaseAsync(name, { useNewConnection: true }, recovery.uri);
        try { await backupDatabaseAsync({ sourceDatabase: live as SQLiteDatabase, destDatabase: snapshot }); }
        finally { await snapshot.closeAsync(); }
      },
      install: async (id, audio) => {
        stop(signal, allowed);
        directory(Paths.document, AUDIO_DIR);
        const path = `${AUDIO_DIR}/restored-${batch}-${nextVoice++}.${audio?.path.endsWith('.caf') ? 'caf' : 'm4a'}`;
        if (audio) {
          const target = new File(Paths.document, path);
          if (target.exists) throw new Error('The restore could not allocate an audio file.');
          installed.push(path);
          const journal = new File(recovery, `restore-${batch}-${nextVoice}.json`);
          const pending = new File(recovery, `restore-${batch}-${nextVoice}.pending`);
          pending.create(); pending.write(JSON.stringify([path])); pending.moveSync(journal);
          journals.push(journal);
          staged.get(id)!.moveSync(target);
          if (target.size !== audio.bytes) throw new Error('A recording could not be restored completely.');
        }
        return path;
      },
      rollback: async () => {
        for (const path of installed) { const file = new File(Paths.document, path); if (file.exists) file.delete(); }
        for (const journal of journals) if (journal.exists) journal.delete();
      },
      finish: async () => { for (const journal of journals) if (journal.exists) journal.delete(); },
    };
    return { preview, dispose, restore: () => restoreRecord(db, archive, preview, digest, files, signal, allowed) };
  } catch (error) { dispose(); throw error; }
  finally { reader?.close(); }
}
export type PreparedRestore = Awaited<ReturnType<typeof prepareNativeRestore>>;

export function removePickedArchive(uri: string) {
  const prefix = `${Paths.cache.uri.replace(/\/$/, '')}/DocumentPicker/`;
  if (!uri.startsWith(prefix) || uri.slice(prefix.length).includes('/')) return;
  try { const file = new File(uri); if (file.exists) file.delete(); } catch { /* The OS can evict its cache later. */ }
}
export function cleanupAbandonedRestores() {
  if (!hasFileSystem()) return;
  for (const item of Paths.cache.list()) {
    if (item instanceof Directory && /^record-import-[a-f0-9-]{36}$/.test(item.name)) item.delete();
  }
}
