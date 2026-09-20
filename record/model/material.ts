/**
 * The shape the Record's model works on.
 *
 * A row in `fragments` plus whatever the encounter, voice and line tables say about it,
 * assembled once by the repository and then passed around as a value. The model layer is
 * deliberately free of SQL and of React: banding, matching, traces and returns are pure
 * functions over `Material[]`, which is what makes them testable against the prototype's own
 * corpus and against desktop's fixtures.
 *
 * Naming note: the prototype calls this a "fragment" and carries a `kind` discriminator of
 * `text | voice | url | quote`. The durable model has no `kind` column — what a fragment *is*
 * emerges from which tables mention it, which is the whole point of capture without
 * classification. The predicates below re-derive the prototype's four cases from that, so the
 * interface can draw what it drew without the database learning to classify.
 */

export type CaptureMethod = 'typed' | 'voice' | 'url' | 'shared' | 'imported';
export type CaptureOrigin = 'mobile' | 'widget' | 'share' | 'desktop' | 'legacy' | (string & {});
export type DerivedState = 'pending' | 'ok' | 'failed';

export type Material = {
  id: string;
  /** `captured_at`, as epoch ms in local time. Immutable: a correction never moves it. */
  at: number;
  /** The CURRENT wording. Every wording it replaced is in `fragment_revisions`. */
  body: string;
  method: CaptureMethod;
  origin: CaptureOrigin | null;

  correctedAt: number | null;
  /** The most recent superseded wording, when one has been loaded. */
  previousBody: string | null;
  correctionCount: number;
  removedAt: number | null;

  /** `line_index.root_id`. Null when this moment is not part of a Line. */
  lineId: string | null;

  /** Encounter — what actually arrived. Null when this fragment met nothing external. */
  url: string | null;
  urlKey: string | null;
  sourceApp: string | null;
  /** Material the source supplied, distinct from the person's own words. */
  selectedText: string | null;
  /** Enrichment — derived, allowed to be absent, allowed to fail. */
  domain: string | null;
  title: string | null;
  enrichmentState: DerivedState | null;

  /** Voice — the audio is canonical. Null when this fragment is not a recording. */
  durationMs: number | null;
  audioMissing: boolean;
  transcriptState: DerivedState | null;
};

/** A blank the model treats as "nothing written yet", matching `NOT_BLANK()` in SQL. */
const BLANK = /^[\s ]*$/;

export const isBlank = (s: string | null | undefined): boolean => !s || BLANK.test(s);

export const isVoice = (m: Material): boolean => m.method === 'voice';

/** Met something external: a shared page, a typed link. */
export const isEncounter = (m: Material): boolean => m.url !== null;

/**
 * The prototype's `quote` case: the source supplied text and the person has written none of
 * their own yet. Drawn as a rail-and-quotation rather than as a link.
 */
export const isQuoteOnly = (m: Material): boolean =>
  !isBlank(m.selectedText) && isBlank(m.body);

/** Nothing of the person's own words yet — an encounter left to say something about later. */
export const hasNoWordsYet = (m: Material): boolean => isEncounter(m) && isBlank(m.body);

/**
 * What the record shows as this moment's own words.
 *
 * A quotation the source supplied is **not** the person's words and is drawn separately, on
 * its own rail — so a moment that is only a quotation has no display text of its own, and
 * neither the URL nor the page title is substituted for one.
 *
 * An encounter with neither words nor a quotation falls back to whatever enrichment managed
 * to learn and then to the URL itself: never to nothing, and never to an invented summary.
 */
export const displayText = (m: Material): string => {
  if (!isBlank(m.body)) return m.body;
  if (!isBlank(m.selectedText)) return '';
  if (isEncounter(m)) return m.title ?? m.url ?? '';
  return '';
};

/** One line, for a held item, a widget, an undo notice or a trace. */
export const firstLine = (m: Material): string => {
  const t = isQuoteOnly(m) ? (m.selectedText ?? '') : displayText(m);
  return t.split('\n')[0].slice(0, 90);
};

/** Everything Find looks through, lowercased. */
export const hay = (m: Material): string =>
  [m.body, m.title, m.domain, m.selectedText].filter(Boolean).join(' ').toLowerCase();

/**
 * The provenance word a moment states in focus: `today · 09:41 · voice`.
 *
 * Mobile has two sources desktop cannot produce. They are named rather than flattened to
 * `typed`, for the reason desktop gave when it made the same call for the menu bar
 * (their 0.8): a source the product has and then does not show is a gap nobody notices again.
 */
export const sourceOf = (m: Material): string => {
  if (isVoice(m)) return 'voice';
  if (m.origin === 'widget') return 'widget';
  if (m.origin === 'share' || m.method === 'shared') return 'shared';
  if (m.method === 'imported') return m.origin === 'desktop' ? 'the mac' : 'typed';
  return 'typed';
};

/** How many paragraphs a body has beyond its first. Drives `N more paragraphs`. */
export const paragraphCount = (m: Material): number =>
  displayText(m).split(/\n\n+/).filter((p) => !isBlank(p)).length;
