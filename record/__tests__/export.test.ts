import { openTestDb } from '../__testsupport__/nodeSqliteDb';
import { migrate } from '../migrate';
import { createRecordStore } from '../store';
import { exportLocalRecord as exportFromSnapshot } from '../export';
import { cleanupAbandonedExports } from '../exportTemp';
import type { RecordDb } from '../db';

async function exportLocalRecord(db: RecordDb, signal?: AbortSignal, afterSnapshot?: () => Promise<void>) {
  return exportFromSnapshot(db, signal, async (source) => {
    const { backup } = require('node:sqlite') as typeof import('node:sqlite');
    const { mkdtempSync, rmSync } = require('node:fs') as typeof import('node:fs');
    const { tmpdir } = require('node:os') as typeof import('node:os');
    const { join } = require('node:path') as typeof import('node:path');
    const dir = mkdtempSync(join(tmpdir(), 'chinotto-export-'));
    const path = join(dir, 'snapshot.db');
    await backup((source as ReturnType<typeof openTestDb>).raw, path);
    const snapshot = openTestDb(path);
    await afterSnapshot?.();
    return { db: snapshot, close: async () => { snapshot.close(); rmSync(dir, { recursive: true, force: true }); } };
  });
}

jest.mock('expo-crypto', () => ({ randomUUID: () => 'export-test' }));

jest.mock('expo-file-system', () => {
  const files = new Map<string, Uint8Array>();
  const modified = new Map<string, number>();
  const failDelete = new Set<string>();
  const paths = { document: { uri: 'memory://documents' }, cache: { uri: 'memory://cache' }, availableDiskSpace: 1024 ** 3 };
  let onRead: (() => void) | null = null;
  class Directory {
    uri: string;
    constructor(directory: { uri: string }, name: string) { this.uri = `${directory.uri}/${name}`; }
    create() {}
    list() { return [...files.keys()].filter((uri) => uri.startsWith(`${this.uri}/`) && !uri.slice(this.uri.length + 1).includes('/')).map((uri) => new File({ uri: this.uri }, uri.slice(this.uri.length + 1))); }
  }
  class File {
    uri: string;
    constructor(directory: { uri: string }, name: string) { this.uri = `${directory.uri}/${name}`; }
    get name() { return this.uri.split('/').pop()!; }
    get exists() { return files.has(this.uri); }
    get size() { return files.get(this.uri)?.length ?? null; }
    get modificationTime() { return files.has(this.uri) ? (modified.get(this.uri) ?? 1) : null; }
    create() { files.set(this.uri, new Uint8Array()); }
    delete() { if (failDelete.has(this.uri)) throw new Error('busy'); files.delete(this.uri); }
    open() {
      const uri = this.uri;
      let offset = 0;
      return {
        writeBytes(chunk: Uint8Array) {
          const old = files.get(uri) ?? new Uint8Array();
          const next = new Uint8Array(old.length + chunk.length);
          next.set(old);
          next.set(chunk, old.length);
          files.set(uri, next);
          offset += chunk.length;
        },
        readBytes(length: number) {
          onRead?.();
          const result = (files.get(uri) ?? new Uint8Array()).slice(offset, offset + length);
          offset += result.length;
          return result;
        },
        close() {},
      };
    }
  }
  return { Directory, File, Paths: paths, __files: files, __paths: paths, __failDelete: failDelete, __touch: (uri: string) => modified.set(uri, (modified.get(uri) ?? 1) + 1), __setOnRead: (fn: (() => void) | null) => { onRead = fn; } };
});

jest.mock('expo-sharing', () => ({ isAvailableAsync: async () => true, shareAsync: jest.fn() }));

const fsMock = require('expo-file-system') as {
  __files: Map<string, Uint8Array>;
  __paths: { availableDiskSpace: number };
  __setOnRead: (fn: (() => void) | null) => void;
  __touch: (uri: string) => void;
  __failDelete: Set<string>;
};
const share = require('expo-sharing') as { shareAsync: jest.Mock };

function unzipStored(archive: Uint8Array): Map<string, Uint8Array> {
  const view = new DataView(archive.buffer, archive.byteOffset, archive.byteLength);
  let end = archive.length - 22;
  while (end >= 0 && view.getUint32(end, true) !== 0x06054b50) end--;
  if (end < 0) throw new Error('missing ZIP directory');
  const count = view.getUint16(end + 10, true);
  let cursor = view.getUint32(end + 16, true);
  const result = new Map<string, Uint8Array>();
  for (let i = 0; i < count; i++) {
    if (view.getUint32(cursor, true) !== 0x02014b50) throw new Error('bad ZIP index');
    const size = view.getUint32(cursor + 24, true);
    const nameLength = view.getUint16(cursor + 28, true);
    const extraLength = view.getUint16(cursor + 30, true);
    const commentLength = view.getUint16(cursor + 32, true);
    const local = view.getUint32(cursor + 42, true);
    const name = new TextDecoder().decode(archive.slice(cursor + 46, cursor + 46 + nameLength));
    const dataAt = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
    result.set(name, archive.slice(dataAt, dataAt + size));
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  return result;
}

beforeEach(() => {
  fsMock.__files.clear();
  fsMock.__failDelete.clear();
  fsMock.__paths.availableDiskSpace = 1024 ** 3;
  fsMock.__setOnRead(null);
  share.shareAsync.mockReset();
  share.shareAsync.mockImplementation(async (uri: string) => {
    expect(fsMock.__files.has(uri)).toBe(true);
  });
});

it('exports chronology, history, relationships and original audio with portable filenames', async () => {
  const db = openTestDb();
  await migrate(db);
  const store = createRecordStore(db, { newId: () => 'unused' });
  const first = await store.capture({ id: 'café space', body: 'first wording', at: 1000 });
  await store.correct(first.id, 'revised wording');
  await store.continueFrom(first.id, { id: 'later', body: 'next moment', at: 2000 });
  await store.capture({ id: 'voïce space', body: '', method: 'voice', at: 3000,
    voice: { audioPath: 'chinotto/audio/voice.m4a', durationMs: 1200 } });
  fsMock.__files.set('memory://documents/chinotto/audio/voice.m4a', new Uint8Array([0, 1, 2, 255]));
  let archive: Uint8Array | undefined;
  share.shareAsync.mockImplementation(async (uri: string) => { archive = fsMock.__files.get(uri)?.slice(); });

  await exportLocalRecord(db);
  expect(fsMock.__files.has('memory://cache/chinotto-exports/chinotto-record-export-test.zip')).toBe(false);
  expect(archive).toBeDefined();
  const files = unzipStored(archive!);
  const lines = new TextDecoder().decode(files.get('chinotto-record/record.jsonl')).trim().split('\n').map((line) => JSON.parse(line));
  expect(lines.map((line) => line.id)).toEqual(['café space', 'later', 'voïce space']);
  expect(lines[0].revisions[0].body).toBe('first wording');
  expect(lines[1].continuations[0].continues_id).toBe('café space');
  expect(lines[2].audio.path).toBe('chinotto-record/audio/vo%C3%AFce%20space.m4a');
  expect(files.get('chinotto-record/audio/vo%C3%AFce%20space.m4a')).toEqual(new Uint8Array([0, 1, 2, 255]));
  expect(new TextDecoder().decode(files.get('chinotto-record/record.txt'))).toContain('revised wording');
  expect(new TextDecoder().decode(files.get('chinotto-record/README.txt'))).toContain('not a restorable Chinotto backup');
  db.close();
});

it('cancels during audio streaming and removes the partial archive', async () => {
  const db = openTestDb();
  await migrate(db);
  const store = createRecordStore(db, { newId: () => 'unused' });
  await store.capture({ id: 'voice', method: 'voice', body: '', voice: { audioPath: 'chinotto/audio/voice.m4a', durationMs: 1000 } });
  fsMock.__files.set('memory://documents/chinotto/audio/voice.m4a', new Uint8Array(700_000));
  const controller = new AbortController();
  fsMock.__setOnRead(() => controller.abort());
  await expect(exportLocalRecord(db, controller.signal)).rejects.toThrow('Export cancelled');
  expect(fsMock.__files.has('memory://cache/chinotto-exports/chinotto-record-export-test.zip')).toBe(false);
  expect(share.shareAsync).not.toHaveBeenCalled();
  db.close();
});

it('discards the archive when retained audio disappears during streaming', async () => {
  const db = openTestDb();
  await migrate(db);
  const store = createRecordStore(db, { newId: () => 'unused' });
  await store.capture({ id: 'voice', method: 'voice', body: '', voice: { audioPath: 'chinotto/audio/voice.m4a', durationMs: 1000 } });
  const path = 'memory://documents/chinotto/audio/voice.m4a';
  fsMock.__files.set(path, new Uint8Array(700_000));
  fsMock.__setOnRead(() => fsMock.__files.delete(path));
  await expect(exportLocalRecord(db)).rejects.toThrow('recording');
  expect(share.shareAsync).not.toHaveBeenCalled();
  expect(fsMock.__files.has('memory://cache/chinotto-exports/chinotto-record-export-test.zip')).toBe(false);
  db.close();
});

it('rejects a same-size audio change while streaming', async () => {
  const db = openTestDb();
  await migrate(db);
  const store = createRecordStore(db, { newId: () => 'unused' });
  await store.capture({ id: 'voice', method: 'voice', body: '', voice: { audioPath: 'chinotto/audio/voice.m4a', durationMs: 1000 } });
  const path = 'memory://documents/chinotto/audio/voice.m4a';
  fsMock.__files.set(path, new Uint8Array(700_000));
  fsMock.__setOnRead(() => fsMock.__touch(path));
  await expect(exportLocalRecord(db)).rejects.toThrow('changed');
  expect(share.shareAsync).not.toHaveBeenCalled();
  db.close();
});

it('refuses an incomplete archive when a retained recording is missing', async () => {
  const db = openTestDb();
  await migrate(db);
  const store = createRecordStore(db, { newId: () => 'unused' });
  await store.capture({ id: 'voice', method: 'voice', body: '', voice: { audioPath: 'chinotto/audio/voice.m4a', durationMs: 1000 } });
  await expect(exportLocalRecord(db)).rejects.toThrow('missing');
  expect(share.shareAsync).not.toHaveBeenCalled();
  expect(fsMock.__files.has('memory://cache/chinotto-exports/chinotto-record-export-test.zip')).toBe(false);
  db.close();
});

it('refuses to prepare a copy when measured free space is insufficient', async () => {
  const db = openTestDb();
  await migrate(db);
  const store = createRecordStore(db, { newId: () => 'unused' });
  await store.capture({ id: 'one', body: 'something to export' });
  fsMock.__paths.availableDiskSpace = 1024;
  await expect(exportLocalRecord(db)).rejects.toThrow('Not enough free space');
  expect(fsMock.__files.has('memory://cache/chinotto-exports/chinotto-record-export-test.zip')).toBe(false);
  db.close();
});

it('exports available words when a recording was already marked missing', async () => {
  const db = openTestDb();
  await migrate(db);
  const store = createRecordStore(db, { newId: () => 'unused' });
  await store.capture({ id: 'voice', method: 'voice', body: 'spoken words', voice: { audioPath: 'chinotto/audio/voice.m4a', durationMs: 1000 } });
  await store.markAudioMissing('voice');
  let archive: Uint8Array | undefined;
  share.shareAsync.mockImplementation(async (uri: string) => { archive = fsMock.__files.get(uri)?.slice(); });
  await exportLocalRecord(db);
  const line = JSON.parse(new TextDecoder().decode(unzipStored(archive!).get('chinotto-record/record.jsonl')).trim());
  expect(line.body).toBe('spoken words');
  expect(line.voice_capture.audio_missing).toBe(1);
  expect(line.audio).toBeNull();
  db.close();
});

it('keeps every representation at the snapshot state while the live Record changes', async () => {
  const db = openTestDb();
  await migrate(db);
  const store = createRecordStore(db, { newId: () => 'unused' });
  await store.capture({ id: 'first', body: 'before' });
  let archive: Uint8Array | undefined;
  share.shareAsync.mockImplementation(async (uri: string) => { archive = fsMock.__files.get(uri)?.slice(); });
  await exportLocalRecord(db, undefined, async () => {
    await store.correct('first', 'after');
    await store.capture({ id: 'second', body: 'later' });
  });
  const entries = unzipStored(archive!);
  const json = new TextDecoder().decode(entries.get('chinotto-record/record.jsonl')).trim().split('\n').map((line) => JSON.parse(line));
  const readable = new TextDecoder().decode(entries.get('chinotto-record/record.txt'));
  expect(json.map((row) => row.id)).toEqual(['first']);
  expect(json[0].body).toBe('before');
  expect(readable).toContain('before');
  expect(readable).not.toContain('after');
  db.close();
});

it('cleans abandoned exports repeatedly without touching other cache files or an active share', async () => {
  const stale = 'memory://cache/chinotto-exports/chinotto-record-stale.zip';
  const oldSnapshot = 'memory://cache/chinotto-exports/snapshot-old.db';
  const oldWal = `${oldSnapshot}-wal`;
  const unrelated = 'memory://cache/chinotto-exports/other.zip';
  fsMock.__files.set(stale, new Uint8Array([1]));
  fsMock.__files.set(oldSnapshot, new Uint8Array([1]));
  fsMock.__files.set(oldWal, new Uint8Array([1]));
  fsMock.__files.set(unrelated, new Uint8Array([2]));
  cleanupAbandonedExports();
  cleanupAbandonedExports();
  expect(fsMock.__files.has(stale)).toBe(false);
  expect(fsMock.__files.has(oldSnapshot)).toBe(false);
  expect(fsMock.__files.has(oldWal)).toBe(false);
  expect(fsMock.__files.has(unrelated)).toBe(true);

  const db = openTestDb();
  await migrate(db);
  const store = createRecordStore(db, { newId: () => 'unused' });
  await store.capture({ id: 'one', body: 'kept' });
  share.shareAsync.mockImplementation(async (uri: string) => {
    cleanupAbandonedExports();
    expect(fsMock.__files.has(uri)).toBe(true);
  });
  await exportLocalRecord(db);
  expect(fsMock.__files.has(unrelated)).toBe(true);
  db.close();
});

it('retries an abandoned export when an earlier cleanup could not remove it', () => {
  const stale = 'memory://cache/chinotto-exports/chinotto-record-busy.zip';
  fsMock.__files.set(stale, new Uint8Array([1]));
  fsMock.__failDelete.add(stale);
  expect(() => cleanupAbandonedExports()).not.toThrow();
  expect(fsMock.__files.has(stale)).toBe(true);
  fsMock.__failDelete.delete(stale);
  cleanupAbandonedExports();
  expect(fsMock.__files.has(stale)).toBe(false);
});
