import definitions from './archiveFields.json';
import { readRecordWire, type Digest, type SyncState } from './syncProtocol';
import { safeArchivePath } from './readArchiveZip';
export type ArchiveRow = Record<string, string | number | null>;
export type ArchiveMoment = {
  fragment: ArchiveRow; revisions: ArchiveRow[]; continuations: ArchiveRow[]; holds: ArchiveRow[];
  encounters: { row: ArchiveRow; enrichment: ArchiveRow | null }[];
  voice: ArchiveRow | null; transcript: ArchiveRow | null; judgements: ArchiveRow[]; conflict: ArchiveRow | null;
  audio: { path: string; bytes: number } | null; wording: string | null;
};
export type RecordArchive = { moments: ArchiveMoment[]; archived: ArchiveRow[] };
const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const bad = () => new Error('The archive contains invalid Record data. Nothing has been restored.');
const date = (value: unknown) => {
  if (typeof value !== 'string') return false;
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.exec(value);
  if (!m || !Number.isFinite(Date.parse(value))) return false;
  const year = Number(m[1]), month = Number(m[2]), day = Number(m[3]);
  const end = new Date(0); end.setUTCFullYear(year, month, 0);
  const last = end.getUTCDate();
  return month >= 1 && month <= 12 && day >= 1 && day <= last && Number(m[4]) < 24 && Number(m[5]) < 60 && Number(m[6]) < 60;
};
function normalize(value: unknown, name: keyof typeof definitions, owner?: string): ArchiveRow {
  if (!object(value) || (owner && value.fragment_id !== undefined && value.fragment_id !== owner)) throw bad();
  const row: ArchiveRow = {};
  for (const [key, spec] of Object.entries(definitions[name])) {
    const [rule, fallback] = spec as [string, unknown?];
    const v = value[key] === undefined ? (spec.length > 1 ? fallback : rule.startsWith('?') ? null : undefined) : value[key];
    const type = rule.replace(/^\?/, '');
    if (v === null && rule.startsWith('?')) { row[key] = null; continue; }
    let valid = false;
    if (type === 'uint' || type === 'flag') valid = typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 && (type !== 'flag' || v <= 1);
    else if (type === 'date') valid = date(v);
    else if (typeof v === 'string' && !v.includes('\0')) {
      valid = type.startsWith('choice:') ? type.slice(7).split(',').includes(v)
        : v.length <= (type === 'text' ? 1024 ** 2 : type === 'id' ? 1024 : 4096) && (type !== 'id' || v.length > 0);
    }
    if (!valid) throw bad();
    row[key] = v as string | number;
  }
  return row;
}
const list = (value: unknown, max: number): unknown[] => {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > max) throw bad();
  return value;
};
export async function readRecordArchive(lines: unknown[], archived: unknown[], digest: Digest): Promise<RecordArchive> {
  if (lines.length > 100000 || archived.length > 100000) throw bad();
  const moments: ArchiveMoment[] = []; const ids = new Set<string>();
  for (const input of lines) {
    if (!object(input) || input.version !== 1) throw new Error('This Record archive version is not supported.');
    const fragment = normalize(input, 'fragment'); const id = fragment.id as string;
    if (ids.has(id)) throw new Error('The archive contains duplicate moment IDs.');
    ids.add(id);
    const rows = (key: keyof typeof definitions, max: number) => list(input[key], max).map((r) => normalize(r, key, id));
    const revisions = rows('revisions', 10000).sort((a, b) => Number(a.revision_index) - Number(b.revision_index));
    if (revisions.length !== fragment.correction_count || revisions.some((r, i) => r.revision_index !== i) ||
        (revisions.length > 0 && fragment.corrected_at === null)) throw bad();
    const continuations = rows('continuations', 1);
    if (continuations.some((c) => c.continues_id === id)) throw bad();
    const voice = input.voice_capture == null ? null : normalize(input.voice_capture, 'voice_capture', id);
    let audio: ArchiveMoment['audio'] = null;
    if (input.audio != null) {
      if (!object(input.audio) || typeof input.audio.path !== 'string' || !safeArchivePath(input.audio.path) ||
          !/^chinotto-record\/audio\/[^/]+\.(m4a|caf)$/.test(input.audio.path) ||
          !Number.isSafeInteger(input.audio.bytes) || Number(input.audio.bytes) <= 0) throw bad();
      audio = { path: input.audio.path, bytes: Number(input.audio.bytes) };
    }
    if ((audio && !voice) || (voice && !audio && voice.audio_missing !== 1)) throw bad();
    const conflict = input.wording_conflict == null ? null : normalize(input.wording_conflict, 'wording_conflict', id);
    let wording: string | null = null;
    if (input.wording_versions != null) {
      if (!object(input.wording_versions) || typeof input.wording_versions.selected !== 'string') throw bad();
      const link = continuations[0];
      const wire = await readRecordWire(id, { version: 1, capturedAt: fragment.captured_at,
        wordings: input.wording_versions.versions,
        continuation: link ? { continuesId: link.continues_id, linkedAt: link.linked_at, origin: link.origin } : null }, digest);
      const selected = input.wording_versions.selected;
      if (wire.wordings[selected]?.body !== fragment.body) throw bad();
      const state: SyncState = { wire, selected, revisionCount: revisions.length,
        revisions: Object.keys(wire.wordings).filter((key) => key !== selected && revisions.some((r) => r.body === wire.wordings[key].body)),
        resolvedAt: conflict?.resolved_at as string | null ?? null };
      wording = JSON.stringify(state);
    }
    moments.push({ fragment, revisions, continuations, holds: rows('holds', 1), voice, audio, wording, conflict,
      transcript: input.transcript == null ? null : normalize(input.transcript, 'transcript', id),
      encounters: list(input.encounters, 64).map((encounter) => ({ row: normalize(encounter, 'encounters', id),
        enrichment: object(encounter) && encounter.enrichment != null ? normalize(encounter.enrichment, 'enrichment') : null })),
      judgements: rows('trace_judgements', 10000),
    });
  }
  // Follow parent pointers iteratively so malicious/deep archives cannot exhaust the stack.
  const parent = new Map(moments.filter((m) => m.continuations.length).map((m) => [String(m.fragment.id), String(m.continuations[0].continues_id)]));
  const visited = new Set<string>();
  for (const id of parent.keys()) {
    const path = new Set<string>(); let next: string | undefined = id;
    while (next && parent.has(next) && !visited.has(next)) {
      if (path.has(next)) throw new Error('The archive contains a continuation cycle.');
      path.add(next); next = parent.get(next);
    }
    path.forEach((key) => visited.add(key));
  }
  const old = archived.map((r) => normalize(r, 'archived'));
  if (new Set(old.map((r) => r.id)).size !== old.length) throw bad();
  return { moments, archived: old };
}
