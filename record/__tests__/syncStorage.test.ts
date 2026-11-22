import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openTestDb } from '../__testsupport__/nodeSqliteDb';
import { migrate } from '../migrate';
import { createRecordStore } from '../store';
import { createBridge } from '../bridge';
import { heads } from '../syncProtocol';
import {
  acknowledgeRecordSync, activateRecordSyncUser, commitRecordSync, ensureIncomingSyncFragment,
  pendingRecordSyncIds, prepareStoredRecord, readSyncSnapshot,
} from '../syncStorage';
import { prepareRecordSync } from '../syncProtocol';

const digest = async (s: string) => createHash('sha256').update(s).digest('hex');
let clock = Date.UTC(2026, 10, 1, 12);
async function client(file?: string) {
  const db = openTestDb(file);
  await migrate(db);
  const store = createRecordStore(db, { now: () => clock });
  return { db, store };
}
type Client = Awaited<ReturnType<typeof client>>;
async function send(from: Client, to: Client, id: string) {
  const packet = await prepareStoredRecord(from.db, id, digest);
  expect(packet).not.toBeNull();
  await ensureIncomingSyncFragment(to.db, id, packet!.body, packet!.wire.capturedAt);
  return prepareStoredRecord(to.db, id, digest, { wire: packet!.wire, text: packet!.body });
}
describe('two durable Record clients', () => {
  (process.env.CHINOTTO_NATIVE_SYNC_FIXTURE ? it : it.skip)(
    'receives a correction and continuation from the real Rust SQLite client', async () => {
      const native = JSON.parse(readFileSync(process.env.CHINOTTO_NATIVE_SYNC_FIXTURE!, 'utf8'));
      const phone = await client();
      try {
        await phone.store.capture({ id: 'fixture-moment', body: 'original wording', at: Date.parse('2026-11-01T10:00:00.000Z') });
        await prepareStoredRecord(phone.db, 'fixture-moment', digest);
        for (const snapshot of [native.child, native.parent]) {
          const exported = await prepareRecordSync(snapshot, digest);
          await ensureIncomingSyncFragment(phone.db, snapshot.id, exported.body, exported.wire.capturedAt);
          await prepareStoredRecord(phone.db, snapshot.id, digest, { wire: exported.wire, text: exported.body });
        }
        const rows = await phone.store.loadRecord();
        expect(rows.map((r) => r.lineId)).toEqual(['fixture-moment', 'fixture-moment']);
        expect((await phone.store.wordingHistory('fixture-moment')).map((r) => r.body))
          .toEqual(['original wording', 'phone correction']);
        expect(rows.find((r) => r.id === native.child.id)!.body).toBe('native continuation');
      } finally { phone.db.close(); }
    },
  );
  beforeEach(() => { clock = Date.UTC(2026, 10, 1, 12); });
  it('captures on one device, continues and corrects on another, then returns the complete line', async () => {
    const phone = await client();
    const mac = await client();
    try {
      await phone.store.capture({ id: 'first', body: 'the first wording' });
      await send(phone, mac, 'first');
      clock += 86400000;
      await mac.store.correct('first', 'the corrected wording');
      await mac.store.continueFrom('first', { id: 'second', body: 'a new moment' });
      await send(mac, phone, 'second');
      await send(mac, phone, 'first');
      const record = await phone.store.loadRecord();
      expect(record.map((m) => m.lineId)).toEqual(['first', 'first']);
      expect(record.find((m) => m.id === 'first')!.at).toBe(clock - 86400000);
      expect(record.find((m) => m.id === 'second')!.at).toBe(clock);
      expect((await phone.store.wordingHistory('first')).map((w) => w.body))
        .toEqual(['the first wording', 'the corrected wording']);
    } finally { phone.db.close(); mac.db.close(); }
  });
  it('keeps both concurrent offline wordings and does not create duplicate revisions on replay', async () => {
    const phone = await client();
    const mac = await client();
    try {
      await phone.store.capture({ id: 'first', body: 'original' });
      await send(phone, mac, 'first');
      clock += 1000;
      await phone.store.correct('first', 'phone wording');
      await mac.store.correct('first', 'Mac wording');
      await send(phone, mac, 'first');
      await send(mac, phone, 'first');
      await send(phone, mac, 'first');
      expect((await phone.store.getFragment('first'))!.body).toBe('phone wording');
      expect((await mac.store.getFragment('first'))!.body).toBe('Mac wording');
      const phoneState = await readSyncSnapshot(phone.db, 'first');
      expect(heads(JSON.parse(phoneState!.state!).wire)).toHaveLength(2);
      expect(phoneState!.history).toHaveLength(1);
      expect(await createBridge(phone.db).openConflicts()).toHaveLength(1);
    } finally { phone.db.close(); mac.db.close(); }
  });
  it('keeps an unsent correction through a real close and reopen', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'chinotto-sync-'));
    const file = join(directory, 'record.sqlite');
    const first = await client(file);
    await first.store.capture({ id: 'first', body: 'original' });
    await prepareStoredRecord(first.db, 'first', digest);
    await first.store.correct('first', 'offline correction');
    first.db.close();
    const reopened = await client(file);
    try {
      expect(await pendingRecordSyncIds(reopened.db)).toContain('first');
      const packet = await prepareStoredRecord(reopened.db, 'first', digest);
      expect(packet!.body).toBe('offline correction');
      expect(Object.values(packet!.wire.wordings).map((w) => w.body))
        .toEqual(expect.arrayContaining(['original', 'offline correction']));
    } finally { reopened.db.close(); rmSync(directory, { recursive: true }); }
  });
  it('does not acknowledge or overwrite an edit that raced an in-flight upload', async () => {
    const phone = await client();
    try {
      await phone.store.capture({ id: 'first', body: 'original' });
      const before = await readSyncSnapshot(phone.db, 'first');
      const pending = await prepareRecordSync(before!, digest);
      await phone.store.correct('first', 'typed while sending');
      expect(await commitRecordSync(phone.db, pending)).toBe(false);
      await acknowledgeRecordSync(phone.db, 'first', before!.generation);
      expect(await pendingRecordSyncIds(phone.db)).toContain('first');
      expect((await phone.store.getFragment('first'))!.body).toBe('typed while sending');
    } finally { phone.db.close(); }
  });
  it('erases stored sync wordings and refuses delayed metadata after a permanent removal', async () => {
    const phone = await client();
    const mac = await client();
    try {
      await phone.store.capture({ id: 'first', body: 'private wording' });
      await send(phone, mac, 'first');
      const packet = await prepareStoredRecord(phone.db, 'first', digest);
      await mac.store.remove('first');
      clock += 9000;
      await createBridge(mac.db, { now: () => clock }).publishDueRemovals(['first']);
      expect(await ensureIncomingSyncFragment(mac.db, 'first', 'private wording', packet!.wire.capturedAt))
        .toBe(false);
      expect(await prepareStoredRecord(mac.db, 'first', digest, { wire: packet!.wire, text: packet!.body }))
        .toBeNull();
      expect(await mac.db.getFirstAsync('SELECT state FROM record_sync_state WHERE fragment_id = ?', 'first'))
        .toBeNull();
      expect((await mac.store.getFragment('first'))!.body).toBe('');
    } finally { phone.db.close(); mac.db.close(); }
  });
  it('preserves every continuation when two devices continue one parent', async () => {
    const a = await client(); const b = await client();
    try {
      await a.store.capture({ id: 'root', body: 'starting point' });
      await send(a, b, 'root');
      await a.store.continueFrom('root', { id: 'phone-child', body: 'phone thought' });
      await b.store.continueFrom('root', { id: 'mac-child', body: 'Mac thought' });
      await send(a, b, 'phone-child');
      await send(b, a, 'mac-child');
      for (const device of [a, b]) {
        const rows = await device.db.getAllAsync<{ fragment_id: string; root_id: string; line_length: number }>(
          'SELECT * FROM line_index ORDER BY position');
        expect(rows.map((r) => r.fragment_id)).toEqual(['root', 'mac-child', 'phone-child']);
        expect(rows.every((r) => r.root_id === 'root' && r.line_length === 3)).toBe(true);
      }
      await a.store.remove('root'); clock += 9000;
      await createBridge(a.db, { now: () => clock }).publishDueRemovals(['root']);
      const child = await prepareStoredRecord(a.db, 'phone-child', digest);
      expect(child!.wire.continuation).toBeNull();
    } finally { a.db.close(); b.db.close(); }
  });
  it('requeues metadata only when the sync account changes', async () => {
    const phone = await client();
    try {
      await phone.store.capture({ id: 'first', body: 'original' });
      await activateRecordSyncUser(phone.db, 'one');
      const first = await readSyncSnapshot(phone.db, 'first');
      await acknowledgeRecordSync(phone.db, 'first', first!.generation);
      await activateRecordSyncUser(phone.db, 'one');
      expect(await pendingRecordSyncIds(phone.db)).toEqual([]);
      await activateRecordSyncUser(phone.db, 'two');
      expect(await pendingRecordSyncIds(phone.db)).toEqual(['first']);
    } finally { phone.db.close(); }
  });
  it('prioritises unsent captures before a failed old history', async () => {
    const phone = await client();
    try {
      await phone.store.capture({ id: 'old', body: 'old' });
      await phone.store.capture({ id: 'new', body: 'new' });
      await phone.db.runAsync('UPDATE record_sync_state SET error = ? WHERE fragment_id = ?', 'failed', 'old');
      expect(await pendingRecordSyncIds(phone.db, 1)).toEqual(['new']);
      await phone.db.runAsync('UPDATE record_sync_state SET error = ?, touched_at = ? WHERE fragment_id = ?',
        'failed', '2099-01-01T00:00:00.000Z', 'new');
      expect(await pendingRecordSyncIds(phone.db, 1)).toEqual(['old']);
    } finally { phone.db.close(); }
  });

});

