/**
 * The Record's write and read paths, and the place its invariants are enforced.
 *
 * Every rule here exists because breaking it would destroy something a person wrote or tell
 * them something untrue:
 *
 *   * `captured_at` is immutable. Correction changes the wording, never the moment.
 *   * A correction pushes the wording it replaced onto `fragment_revisions` first, and
 *     `correction_count` is maintained to equal `COUNT(fragment_revisions)` exactly.
 *   * Continue appends a new dated moment and links it. It never edits the earlier one.
 *   * Removal is soft, and publishing it is deferred for the whole undo window.
 *   * A voice fragment exists the moment recording stops, whether or not anything is ever
 *     transcribed, and a transcript never touches the audio.
 *
 * The store takes its clock and its id generator as parameters so the tests can run against
 * a real SQLite engine with a deterministic world, rather than against a fake database.
 */

import { rebuildLineIndex } from './lineIndex';
import { NOT_BLANK } from './migrate';
import { domainOf, soleUrlIn, urlKey } from './urlKey';
import type { RecordDb } from './db';
import type {
  CaptureMethod,
  CaptureOrigin,
  DerivedState,
  Material,
} from './model/material';

/** Keep present is bounded and has no ordering system, so the limit refuses rather than evicting. */
export const MAX_HELD = 5;
/** The undo window. Nothing is published to sync inside it. */
export const UNDO_WINDOW_MS = 8000;
/** How much of the record is held in memory at once. A safety limit, not a design one. */
export const RECORD_CAP = 50_000;

export class HoldLimitReached extends Error {
  constructor() {
    super(`[Record] already keeping ${MAX_HELD} present`);
    this.name = 'HoldLimitReached';
  }
}

export type StoreOptions = {
  now?: () => number;
  newId?: () => string;
  /** Called after any write that the legacy bridge should mirror. */
  onChanged?: (fragmentId: string) => void;
};

export type CaptureInput = {
  /**
   * An id chosen by the caller. Voice needs this: the audio file is opened under the
   * fragment's own id before the fragment exists, so the two must agree.
   */
  id?: string;
  body: string;
  method?: CaptureMethod;
  origin?: CaptureOrigin;
  /** An explicit moment, for material that arrived from somewhere with its own timestamp. */
  at?: number;
  encounter?: {
    urlRaw: string;
    sourceApp?: string | null;
    selectedText?: string | null;
  } | null;
  voice?: {
    audioPath: string;
    durationMs: number;
  } | null;
};

type FragmentRow = {
  id: string;
  body: string;
  captured_at: string;
  capture_method: CaptureMethod;
  capture_origin: string | null;
  corrected_at: string | null;
  correction_count: number;
  removed_at: string | null;
  line_root: string | null;
  prev_body: string | null;
  url_raw: string | null;
  url_key: string | null;
  source_app: string | null;
  selected_text: string | null;
  domain: string | null;
  title: string | null;
  enrichment_state: DerivedState | null;
  duration_ms: number | null;
  audio_missing: number | null;
  transcript_state: DerivedState | null;
};

const iso = (ms: number) => new Date(ms).toISOString();
const ms = (s: string | null): number | null => (s ? new Date(s).getTime() : null);

export function createRecordStore(db: RecordDb, options: StoreOptions = {}) {
  const now = options.now ?? (() => Date.now());
  const newId = options.newId ?? defaultNewId;
  const changed = (id: string) => options.onChanged?.(id);

  /* ------------------------------------------------------------------ reading */

  const SELECT = `
    SELECT f.id, f.body, f.captured_at, f.capture_method, f.capture_origin,
           f.corrected_at, f.correction_count, f.removed_at,
           li.root_id                AS line_root,
           (SELECT r.body FROM fragment_revisions r
             WHERE r.fragment_id = f.id
             ORDER BY r.revision_index DESC LIMIT 1) AS prev_body,
           e.url_raw, e.url_key, e.source_app, e.selected_text,
           en.domain, en.title, en.state AS enrichment_state,
           v.duration_ms, v.audio_missing,
           vt.state AS transcript_state
      FROM fragments f
      LEFT JOIN line_index li ON li.fragment_id = f.id
      LEFT JOIN encounters e ON e.fragment_id = f.id
      LEFT JOIN encounter_enrichment en ON en.encounter_id = e.id
      LEFT JOIN voice_captures v ON v.fragment_id = f.id
      LEFT JOIN voice_transcripts vt ON vt.fragment_id = f.id
  `;

  function hydrate(r: FragmentRow): Material {
    return {
      id: r.id,
      at: new Date(r.captured_at).getTime(),
      body: r.body,
      method: r.capture_method,
      origin: (r.capture_origin as CaptureOrigin | null) ?? null,
      correctedAt: ms(r.corrected_at),
      previousBody: r.prev_body,
      correctionCount: r.correction_count,
      removedAt: ms(r.removed_at),
      lineId: r.line_root,
      url: r.url_raw,
      urlKey: r.url_key,
      sourceApp: r.source_app,
      selectedText: r.selected_text,
      domain: r.domain,
      title: r.title,
      enrichmentState: r.enrichment_state,
      durationMs: r.duration_ms,
      audioMissing: r.audio_missing === 1,
      transcriptState: r.transcript_state,
    };
  }

  /** Everything the record can show, newest first. Removed material is excluded. */
  async function loadRecord(limit = RECORD_CAP): Promise<Material[]> {
    const rows = await db.getAllAsync<FragmentRow>(
      `${SELECT} WHERE f.removed_at IS NULL ORDER BY f.captured_at DESC LIMIT ?`,
      limit
    );
    return rows.map(hydrate);
  }

  async function getFragment(id: string): Promise<Material | null> {
    const row = await db.getFirstAsync<FragmentRow>(`${SELECT} WHERE f.id = ?`, id);
    return row ? hydrate(row) : null;
  }

  /** Every wording this moment has had, oldest first, ending with the current one. */
  async function wordingHistory(id: string): Promise<{ body: string; at: number }[]> {
    const revisions = await db.getAllAsync<{ body: string; superseded_at: string }>(
      'SELECT body, superseded_at FROM fragment_revisions WHERE fragment_id = ? ORDER BY revision_index ASC',
      id
    );
    const current = await db.getFirstAsync<{ body: string; corrected_at: string | null; captured_at: string }>(
      'SELECT body, corrected_at, captured_at FROM fragments WHERE id = ?',
      id
    );
    const out = revisions.map((r) => ({ body: r.body, at: new Date(r.superseded_at).getTime() }));
    if (current) {
      out.push({
        body: current.body,
        at: new Date(current.corrected_at ?? current.captured_at).getTime(),
      });
    }
    return out;
  }

  async function heldIds(): Promise<string[]> {
    const rows = await db.getAllAsync<{ fragment_id: string }>(
      `SELECT h.fragment_id FROM holds h
         JOIN fragments f ON f.id = h.fragment_id
        WHERE h.released_at IS NULL AND f.removed_at IS NULL
        ORDER BY h.held_at ASC`
    );
    return rows.map((r) => r.fragment_id);
  }

  async function traceJudgements(): Promise<Record<string, 'confirmed' | 'rejected'>> {
    const rows = await db.getAllAsync<{ related_id: string; judgement: 'confirmed' | 'rejected' }>(
      'SELECT related_id, judgement FROM trace_judgements'
    );
    const out: Record<string, 'confirmed' | 'rejected'> = {};
    for (const r of rows) out[r.related_id] = r.judgement;
    return out;
  }

  /* ------------------------------------------------------------------ capture */

  /**
   * Capture. Cannot fail on anything but the database itself: no network, no classification,
   * no decision asked of the person.
   */
  async function capture(input: CaptureInput): Promise<Material> {
    const id = input.id ?? newId();
    const at = input.at ?? now();
    const body = input.body ?? '';

    // A body that is exactly one URL is an encounter. Two links stay plain text, because
    // which one the fragment is *about* is a judgement the design does not make.
    const implicitUrl = input.encounter ? null : soleUrlIn(body);
    const encounter = input.encounter ?? (implicitUrl ? { urlRaw: implicitUrl } : null);

    const method: CaptureMethod =
      input.method ?? (input.voice ? 'voice' : encounter ? 'url' : 'typed');

    await db.withTransactionAsync(async () => {
      await db.runAsync(
        `INSERT INTO fragments (id, body, captured_at, capture_method, capture_origin)
         VALUES (?, ?, ?, ?, ?)`,
        id,
        body,
        iso(at),
        method,
        input.origin ?? 'mobile'
      );

      if (encounter) {
        await db.runAsync(
          `INSERT INTO encounters (fragment_id, url_raw, url_key, source_app, shared_at, selected_text)
           VALUES (?, ?, ?, ?, ?, ?)`,
          id,
          encounter.urlRaw,
          urlKey(encounter.urlRaw),
          encounter.sourceApp ?? null,
          iso(at),
          encounter.selectedText ?? null
        );
        const row = await db.getFirstAsync<{ id: number }>(
          'SELECT id FROM encounters WHERE fragment_id = ? ORDER BY id DESC LIMIT 1',
          id
        );
        if (row) {
          // Enrichment is derived and may never arrive. The domain is the one thing that can
          // be read from the string itself, so it is filled in offline and the rest waits.
          await db.runAsync(
            `INSERT INTO encounter_enrichment (encounter_id, domain, state) VALUES (?, ?, 'pending')`,
            row.id,
            domainOf(encounter.urlRaw)
          );
        }
      }

      if (input.voice) {
        // The audio is already on disk by the time this runs — see `voice.ts`. The row is
        // written whether or not a transcript ever exists.
        await db.runAsync(
          `INSERT INTO voice_captures (fragment_id, audio_path, duration_ms, recorded_at)
           VALUES (?, ?, ?, ?)`,
          id,
          input.voice.audioPath,
          input.voice.durationMs,
          iso(at)
        );
        await db.runAsync(
          `INSERT INTO voice_transcripts (fragment_id, state) VALUES (?, 'pending')`,
          id
        );
      }
    });

    changed(id);
    return (await getFragment(id))!;
  }

  /* --------------------------------------------------------------- correction */

  /**
   * Correct the wording. The earlier wording is kept, and the moment keeps its date.
   *
   * A no-op correction writes nothing: re-saving identical text must not manufacture a
   * revision, or the history would fill with wordings nobody changed.
   */
  async function correct(id: string, body: string): Promise<Material | null> {
    const current = await db.getFirstAsync<{ body: string; correction_count: number }>(
      'SELECT body, correction_count FROM fragments WHERE id = ?',
      id
    );
    if (!current) return null;
    const next = body.trim();
    if (!next || next === current.body) return getFragment(id);

    const at = now();
    await db.withTransactionAsync(async () => {
      await db.runAsync(
        `INSERT INTO fragment_revisions (fragment_id, body, superseded_at, revision_index)
         VALUES (?, ?, ?, ?)`,
        id,
        current.body,
        iso(at),
        current.correction_count
      );
      // captured_at is deliberately absent from this UPDATE.
      await db.runAsync(
        `UPDATE fragments
            SET body = ?, corrected_at = ?, correction_count = correction_count + 1
          WHERE id = ?`,
        next,
        iso(at),
        id
      );
    });

    changed(id);
    return getFragment(id);
  }

  /* ---------------------------------------------------------------- continue */

  /**
   * Continue: a new moment, dated now, linked to the one it continues.
   *
   * The earlier moment is not touched. `origin` records whether the person said so outright
   * or accepted an offer, because those are different kinds of decision.
   */
  async function continueFrom(
    continuesId: string,
    input: CaptureInput,
    origin: 'explicit' | 'accepted_suggestion' = 'explicit'
  ): Promise<Material | null> {
    const target = await db.getFirstAsync<{ id: string }>(
      'SELECT id FROM fragments WHERE id = ?',
      continuesId
    );
    if (!target) return null;

    const created = await capture(input);
    await db.withTransactionAsync(async () => {
      await db.runAsync(
        `INSERT INTO continuations (fragment_id, continues_id, linked_at, origin) VALUES (?, ?, ?, ?)`,
        created.id,
        continuesId,
        iso(now()),
        origin
      );
      await rebuildLineIndex(db);
    });

    changed(created.id);
    return getFragment(created.id);
  }

  /**
   * Accepting a continuation offer, which links two moments that already exist.
   *
   * The *later* moment continues the earlier one, whichever way round they were passed:
   * a Line is ordered by when things were said, not by which one was on screen.
   */
  async function linkContinuation(aId: string, bId: string): Promise<boolean> {
    if (aId === bId) return false;
    const rows = await db.getAllAsync<{ id: string; captured_at: string }>(
      'SELECT id, captured_at FROM fragments WHERE id IN (?, ?)',
      aId,
      bId
    );
    if (rows.length !== 2) return false;

    rows.sort((x, y) => new Date(x.captured_at).getTime() - new Date(y.captured_at).getTime());
    const [earlier, later] = rows;

    const existing = await db.getFirstAsync<{ fragment_id: string }>(
      'SELECT fragment_id FROM continuations WHERE fragment_id = ?',
      later.id
    );
    // A fragment continues at most one thing; the chain is never re-pointed silently.
    if (existing) return false;

    await db.withTransactionAsync(async () => {
      await db.runAsync(
        `INSERT INTO continuations (fragment_id, continues_id, linked_at, origin)
         VALUES (?, ?, ?, 'accepted_suggestion')`,
        later.id,
        earlier.id,
        iso(now())
      );
      await rebuildLineIndex(db);
    });

    changed(later.id);
    return true;
  }

  /* -------------------------------------------------------------------- hold */

  async function hold(id: string): Promise<void> {
    const held = await heldIds();
    if (held.includes(id)) return;
    if (held.length >= MAX_HELD) throw new HoldLimitReached();
    await db.runAsync(
      `INSERT INTO holds (fragment_id, held_at, released_at) VALUES (?, ?, NULL)
       ON CONFLICT(fragment_id) DO UPDATE SET held_at = excluded.held_at, released_at = NULL`,
      id,
      iso(now())
    );
  }

  /** Released rows are kept, so a Return can say "you kept this present". */
  async function release(id: string): Promise<void> {
    await db.runAsync('UPDATE holds SET released_at = ? WHERE fragment_id = ? AND released_at IS NULL', iso(now()), id);
  }

  /* ----------------------------------------------------------------- removal */

  /**
   * Remove. Soft locally, and **not published** for the length of the undo window.
   *
   * The deferral is not a nicety. The other device offers the same eight seconds, so
   * publishing a tombstone immediately would let this phone destroy material that the Mac
   * can still bring back — and the person would have no way to tell that had happened.
   */
  async function remove(id: string): Promise<void> {
    const at = now();
    await db.withTransactionAsync(async () => {
      await db.runAsync('UPDATE fragments SET removed_at = ? WHERE id = ?', iso(at), id);
      await db.runAsync(
        `INSERT INTO pending_removals (fragment_id, removed_at, publish_at) VALUES (?, ?, ?)
         ON CONFLICT(fragment_id) DO UPDATE SET removed_at = excluded.removed_at, publish_at = excluded.publish_at`,
        id,
        iso(at),
        iso(at + UNDO_WINDOW_MS)
      );
    });
  }

  /** `bring back`. Only possible while the removal is still unpublished. */
  async function bringBack(id: string): Promise<boolean> {
    const pending = await db.getFirstAsync<{ fragment_id: string }>(
      'SELECT fragment_id FROM pending_removals WHERE fragment_id = ?',
      id
    );
    if (!pending) return false;
    await db.withTransactionAsync(async () => {
      await db.runAsync('DELETE FROM pending_removals WHERE fragment_id = ?', id);
      await db.runAsync('UPDATE fragments SET removed_at = NULL WHERE id = ?', id);
    });
    changed(id);
    return true;
  }

  /** Removals whose window has passed and which the bridge should now publish. */
  async function dueRemovals(): Promise<string[]> {
    const rows = await db.getAllAsync<{ fragment_id: string }>(
      'SELECT fragment_id FROM pending_removals WHERE publish_at <= ? ORDER BY publish_at ASC',
      iso(now())
    );
    return rows.map((r) => r.fragment_id);
  }

  /** How long is left on the undo offer, in whole seconds. */
  async function undoSecondsLeft(id: string): Promise<number> {
    const row = await db.getFirstAsync<{ publish_at: string }>(
      'SELECT publish_at FROM pending_removals WHERE fragment_id = ?',
      id
    );
    if (!row) return 0;
    return Math.max(0, Math.ceil((new Date(row.publish_at).getTime() - now()) / 1000));
  }

  /** Marks a removal published. The row leaves `pending_removals`; the fragment stays soft-removed. */
  async function markRemovalPublished(id: string): Promise<void> {
    await db.runAsync('DELETE FROM pending_removals WHERE fragment_id = ?', id);
  }

  /* ------------------------------------------------------------------ traces */

  async function judgeTrace(
    fragmentId: string,
    relatedId: string,
    kind: string,
    judgement: 'confirmed' | 'rejected'
  ): Promise<void> {
    await db.runAsync(
      `INSERT INTO trace_judgements (fragment_id, related_id, kind, judgement, judged_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(fragment_id, related_id, kind)
         DO UPDATE SET judgement = excluded.judgement, judged_at = excluded.judged_at`,
      fragmentId,
      relatedId,
      kind,
      judgement,
      iso(now())
    );
  }

  /* ----------------------------------------------------------------- returns */

  async function recordReturn(
    fragmentId: string,
    reason: string,
    evidence: { kind: string; detail: string; occurredAt: number; relatedId: string }
  ): Promise<number> {
    let returnId = 0;
    await db.withTransactionAsync(async () => {
      const res = await db.runAsync(
        'INSERT INTO returns (fragment_id, surfaced_at, reason) VALUES (?, ?, ?)',
        fragmentId,
        iso(now()),
        reason
      );
      returnId = res.lastInsertRowId;
      // A Return with no evidence row is a bug, not a quiet fallback — so it is written in
      // the same transaction as the Return itself.
      await db.runAsync(
        `INSERT INTO return_evidence (return_id, kind, detail, occurred_at, related_id)
         VALUES (?, ?, ?, ?, ?)`,
        returnId,
        evidence.kind,
        evidence.detail,
        iso(evidence.occurredAt),
        evidence.relatedId
      );
    });
    return returnId;
  }

  async function closeReturn(
    returnId: number,
    outcome: 'opened' | 'continued' | 'let_go' | 'expired'
  ): Promise<void> {
    await db.runAsync(
      'UPDATE returns SET outcome = ?, outcome_at = ? WHERE id = ?',
      outcome,
      iso(now()),
      returnId
    );
  }

  /** Ids surfaced within the window, so the same thing is not pressed twice. */
  async function recentlyReturned(withinMs: number): Promise<Set<string>> {
    const rows = await db.getAllAsync<{ fragment_id: string }>(
      'SELECT DISTINCT fragment_id FROM returns WHERE surfaced_at >= ?',
      iso(now() - withinMs)
    );
    return new Set(rows.map((r) => r.fragment_id));
  }

  /* ------------------------------------------------------------------- voice */

  /**
   * What a machine heard. Derived: it may fail, and failing must lose nothing — the audio is
   * still there and the fragment still exists.
   */
  async function setTranscript(
    fragmentId: string,
    result:
      | { state: 'ok'; text: string; model?: string }
      /**
       * `model` on a failure records that a recogniser actually ran — see
       * `record/transcripts.ts`, which never retries a recording one already has.
       */
      | { state: 'failed'; failure: string; model?: string }
  ): Promise<void> {
    await db.withTransactionAsync(async () => {
      if (result.state === 'ok') {
        await db.runAsync(
          `UPDATE voice_transcripts
              SET machine_transcript = ?, state = 'ok', model = ?, transcribed_at = ?, failure = NULL
            WHERE fragment_id = ?`,
          result.text,
          result.model ?? null,
          iso(now()),
          fragmentId
        );
        // The body follows the machine transcript only while nobody has worded it
        // themselves. A person's correction is never overwritten by a re-transcription.
        await db.runAsync(
          `UPDATE fragments SET body = ?
            WHERE id = ? AND correction_count = 0 AND ${NOT_BLANK('?')}`,
          result.text,
          fragmentId,
          result.text
        );
      } else {
        await db.runAsync(
          `UPDATE voice_transcripts SET state = 'failed', failure = ?, model = ?, transcribed_at = ?
            WHERE fragment_id = ?`,
          result.failure,
          result.model ?? null,
          iso(now()),
          fragmentId
        );
      }
    });
    changed(fragmentId);
  }

  /** The audio was looked for and was not there. Says so rather than pretending. */
  async function markAudioMissing(fragmentId: string): Promise<void> {
    await db.runAsync('UPDATE voice_captures SET audio_missing = 1 WHERE fragment_id = ?', fragmentId);
  }

  async function audioPathOf(fragmentId: string): Promise<string | null> {
    const row = await db.getFirstAsync<{ audio_path: string }>(
      'SELECT audio_path FROM voice_captures WHERE fragment_id = ?',
      fragmentId
    );
    return row?.audio_path ?? null;
  }

  /* -------------------------------------------------------------- enrichment */

  async function setEnrichment(
    fragmentId: string,
    result:
      | { state: 'ok'; title?: string | null; domain?: string | null; siteName?: string | null; canonical?: string | null }
      | { state: 'failed'; failure: string }
  ): Promise<void> {
    const enc = await db.getFirstAsync<{ id: number }>(
      'SELECT id FROM encounters WHERE fragment_id = ? ORDER BY id DESC LIMIT 1',
      fragmentId
    );
    if (!enc) return;
    if (result.state === 'ok') {
      await db.runAsync(
        `UPDATE encounter_enrichment
            SET title = ?, domain = COALESCE(?, domain), site_name = ?, url_canonical = ?,
                state = 'ok', fetched_at = ?, failure = NULL
          WHERE encounter_id = ?`,
        result.title ?? null,
        result.domain ?? null,
        result.siteName ?? null,
        result.canonical ?? null,
        iso(now()),
        enc.id
      );
    } else {
      await db.runAsync(
        `UPDATE encounter_enrichment SET state = 'failed', failure = ?, attempted_at = ? WHERE encounter_id = ?`,
        result.failure,
        iso(now()),
        enc.id
      );
    }
    changed(fragmentId);
  }

  /** Have we met this source before? Offline, from `url_key`. */
  async function encountersOf(key: string, excludeFragmentId?: string): Promise<Material[]> {
    const rows = await db.getAllAsync<FragmentRow>(
      `${SELECT} WHERE e.url_key = ? AND f.removed_at IS NULL AND f.id <> ? ORDER BY f.captured_at DESC`,
      key,
      excludeFragmentId ?? ''
    );
    return rows.map(hydrate);
  }

  return {
    // read
    loadRecord,
    getFragment,
    wordingHistory,
    heldIds,
    traceJudgements,
    encountersOf,
    // write
    capture,
    correct,
    continueFrom,
    linkContinuation,
    hold,
    release,
    remove,
    bringBack,
    dueRemovals,
    undoSecondsLeft,
    markRemovalPublished,
    judgeTrace,
    recordReturn,
    closeReturn,
    recentlyReturned,
    setTranscript,
    markAudioMissing,
    audioPathOf,
    setEnrichment,
  };
}

export type RecordStore = ReturnType<typeof createRecordStore>;

/**
 * Ids are generated locally and are the identity of the moment everywhere — including on the
 * legacy wire, where the same id is what makes the bridge idempotent in both directions.
 */
function defaultNewId(): string {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { randomUUID } = require('expo-crypto') as { randomUUID: () => string };
  return randomUUID();
}
