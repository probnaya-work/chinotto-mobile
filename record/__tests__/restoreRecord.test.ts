import { createHash } from 'node:crypto';
import { openTestDb } from '../__testsupport__/nodeSqliteDb';
import { migrate } from '../migrate';
import { createRecordStore } from '../store';
import { readRecordArchive } from '../archiveFormat';
import { previewRecordRestore, restoreRecord, type RestoreFiles } from '../restoreRecord';
const digest = async (s: string) => createHash('sha256').update(s).digest('hex');
const moment = (id: string, body = id) => ({ version: 1, id, body, captured_at: '2020-01-01T10:00:00.000Z', capture_method: 'typed', correction_count: 0 });
function files(): RestoreFiles { return { recovery: jest.fn(async () => {}), install: jest.fn(async () => 'chinotto/audio/restored.m4a'), rollback: jest.fn(async () => {}), finish: jest.fn(async () => {}) }; }
it('restores original IDs, dates, wording history, links, source and audio atomically', async () => {
  const db = openTestDb(); await migrate(db);
  const archive = await readRecordArchive([
    { ...moment('later'), continuations: [{ continues_id: 'first', linked_at: '2021-01-01T10:00:00Z', origin: 'explicit' }] },
    { ...moment('first', 'new words'), corrected_at: '2020-02-01T10:00:00Z', correction_count: 1,
      revisions: [{ body: 'old words', superseded_at: '2020-02-01T10:00:00Z', revision_index: 0 }],
      voice_capture: { duration_ms: 1400, recorded_at: '2020-01-01T10:00:00Z' }, audio: { path: 'chinotto-record/audio/first.m4a', bytes: 20 },
      encounters: [{ url_raw: 'https://example.com', url_key: 'example.com', shared_at: '2020-01-01T10:00:00Z', enrichment: { state: 'ok', title: 'source title' } }, { url_raw: 'https://second.example', url_key: 'second.example', shared_at: '2020-01-01T10:00:00Z' }] },
  ], [], digest);
  const preview = await previewRecordRestore(db, archive, digest); const io = files();
  await restoreRecord(db, archive, preview, digest, io);
  expect((await createRecordStore(db).loadRecord()).map((m) => m.id).sort()).toEqual(['first','later']);
  expect(await db.getFirstAsync('SELECT body,captured_at,correction_count FROM fragments WHERE id=?','first')).toEqual({ body:'new words', captured_at:'2020-01-01T10:00:00.000Z', correction_count:1 });
  expect(await db.getFirstAsync('SELECT body FROM fragment_revisions')).toEqual({ body:'old words' });
  expect(await db.getFirstAsync('SELECT continues_id FROM continuations')).toEqual({ continues_id:'first' });
  expect(io.install).toHaveBeenCalledTimes(1);
  expect(await db.getFirstAsync('SELECT COUNT(*) AS n FROM fragments_fts WHERE fragment_id=?', 'first')).toEqual({ n: 1 });
  expect(await db.getFirstAsync<{ source: string }>('SELECT source FROM fragments_fts WHERE fragment_id=?', 'first')).toMatchObject({ source: expect.stringContaining('source title') });
  const repeated = await previewRecordRestore(db, archive, digest);
  expect(repeated.newMoments).toBe(0); expect(repeated.duplicates).toBe(2);
  await restoreRecord(db, archive, repeated, digest, io);
  expect(io.install).toHaveBeenCalledTimes(1); db.close();
});
it('keeps current wording and removed IDs, including suppressed permanent removals', async () => {
  const db = openTestDb(); await migrate(db); const store = createRecordStore(db);
  await store.capture({ id:'existing', body:'current', at:Date.parse('2020-01-01T10:00:00Z') });
  await db.runAsync('INSERT INTO firestore_ingest_suppressed_ids (id,suppressed_at) VALUES (?,?)','gone','2020-01-01T10:00:00Z');
  const archive = await readRecordArchive([moment('existing','older'),moment('gone')],[],digest);
  const preview = await previewRecordRestore(db,archive,digest);
  expect(preview).toMatchObject({ newMoments:0,duplicates:1,changed:1,removed:1 });
  await restoreRecord(db,archive,preview,digest,files());
  expect((await store.loadRecord())[0].body).toBe('current'); db.close();
});
it('rolls back all inserted rows and installed audio on disk failure', async () => {
  const db = openTestDb(); await migrate(db);
  const archive = await readRecordArchive([moment('first'),{ ...moment('voice'), voice_capture:{ recorded_at:'2020-01-01T10:00:00Z' }, audio:{ path:'chinotto-record/audio/voice.m4a',bytes:5 } }],[],digest);
  const preview=await previewRecordRestore(db,archive,digest); const io=files();
  (io.install as jest.Mock).mockRejectedValue(new Error('disk full'));
  await expect(restoreRecord(db,archive,preview,digest,io)).rejects.toThrow('disk full');
  expect(await db.getFirstAsync('SELECT COUNT(*) AS n FROM fragments')).toEqual({ n:0 });
  expect(io.rollback).toHaveBeenCalled(); expect(io.finish).not.toHaveBeenCalled(); db.close();
});
it('requires a new preview after relevant local changes and respects cancellation', async () => {
  const db=openTestDb(); await migrate(db); const archive=await readRecordArchive([moment('f1')],[],digest);
  const preview=await previewRecordRestore(db,archive,digest);
  await createRecordStore(db).capture({ id:'f1',body:'just captured',at:Date.parse('2020-01-01T10:00:00Z') });
  await expect(restoreRecord(db,archive,preview,digest,files())).rejects.toThrow('changed');
  const abort=new AbortController();abort.abort();
  await expect(restoreRecord(db,archive,preview,digest,files(),abort.signal)).rejects.toThrow('cancelled');db.close();
});

it('joins a waiting continuation when its predecessor is restored later, without inventing a moment', async () => {
  const db = openTestDb(); await migrate(db);
  const child = await readRecordArchive([{ ...moment('child'), continuations: [{ continues_id: 'parent', linked_at: '2020-01-01T10:00:00Z', origin: 'explicit' }] }], [], digest);
  const plan = await previewRecordRestore(db, child, digest); expect(plan.waitingLinks).toBe(1);
  await restoreRecord(db, child, plan, digest, files());
  expect(await db.getFirstAsync('SELECT COUNT(*) AS n FROM continuations')).toEqual({ n: 0 });
  const parent = await readRecordArchive([moment('parent')], [], digest);
  await restoreRecord(db, parent, await previewRecordRestore(db, parent, digest), digest, files());
  expect(await db.getFirstAsync('SELECT fragment_id,continues_id FROM continuations')).toEqual({ fragment_id: 'child', continues_id: 'parent' }); db.close();
});
it('reads a native compressed archive and restores its original history and audio metadata', async () => {
  const path = process.env.CHINOTTO_NATIVE_ARCHIVE_FIXTURE ?? require('node:path').join(__dirname, '../__testsupport__/fixtures/native-record-v1.zip');
  const bytes = new Uint8Array(require('node:fs').readFileSync(path));
  const { openArchiveZip } = require('../readArchiveZip') as typeof import('../readArchiveZip');
  const zip = await openArchiveZip({ size: bytes.length, read: (offset, length) => bytes.slice(offset, offset + length) });
  const archive = await readRecordArchive(await zip.jsonLines('chinotto-record/record.jsonl'), await zip.jsonLines('chinotto-record/archived.jsonl'), digest);
  const db = openTestDb(); await migrate(db); const plan = await previewRecordRestore(db, archive, digest);
  expect(archive.moments.some((m) => m.audio?.path.endsWith('.caf'))).toBe(true);
  expect(plan.newMoments).toBeGreaterThanOrEqual(3); expect(plan.audioFiles).toBeGreaterThanOrEqual(1);
  await restoreRecord(db, archive, plan, digest, files());
  expect(await db.getFirstAsync('SELECT body FROM fragment_revisions WHERE fragment_id=?', 'café space')).toEqual({ body: 'first wording' });
  expect(await db.getFirstAsync('SELECT continues_id FROM continuations WHERE fragment_id=?', 'later')).toEqual({ continues_id: 'café space' });
  expect(await db.getFirstAsync('SELECT state FROM record_sync_state WHERE fragment_id=?', 'café space')).toMatchObject({ state: expect.stringContaining('revised wording') });
  db.close();
});
