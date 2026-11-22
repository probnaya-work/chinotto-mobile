import { createHash } from 'node:crypto';
import { readRecordArchive } from '../archiveFormat';
const digest = async (s: string) => createHash('sha256').update(s).digest('hex');
export const moment = (id = 'f1') => ({ version: 1, id, body: 'мысль', captured_at: '2026-01-01T10:00:00.000Z', capture_method: 'typed', correction_count: 0 });
it('accepts earlier phone envelopes without local row IDs or new optional fields', async () => {
  const archive = await readRecordArchive([moment()], [], digest);
  expect(archive.moments[0].fragment).toMatchObject({ id: 'f1', body: 'мысль', legacy_edit_count: 0 });
});
it.each([
  { captured_at: 'yesterday' }, { captured_at: '2026-02-30T00:00:00Z' }, { correction_count: 1 }, { revisions: [{ body: 'old', superseded_at: 'bad', revision_index: 0 }] },
  { voice_capture: { recorded_at: '2026-01-01T10:00:00Z' } }, { audio: { path: 'chinotto-record/audio/../secret.m4a', bytes: 10 } },
  { holds: [{ fragment_id: 'other', held_at: '2026-01-01T10:00:00Z' }] }, { wording_versions: { selected: 'fake', versions: {} } },
])('rejects invalid canonical material %j', async (change) => {
  await expect(readRecordArchive([{ ...moment(), ...change }], [], digest)).rejects.toThrow();
});
it('rejects duplicate IDs and continuation cycles before a database write', async () => {
  await expect(readRecordArchive([moment(), moment()], [], digest)).rejects.toThrow('duplicate');
  const link = (id: string) => [{ continues_id: id, linked_at: '2026-01-01T10:00:00Z', origin: 'explicit' }];
  await expect(readRecordArchive([{ ...moment(), continuations: link('f2') }, { ...moment('f2'), continuations: link('f1') }], [], digest)).rejects.toThrow('cycle');
});
