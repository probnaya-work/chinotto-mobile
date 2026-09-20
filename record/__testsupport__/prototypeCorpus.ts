/**
 * TEST SUPPORT ONLY.
 *
 * Bridges the vendored prototype's fragments into the durable model's `Material`, so the two
 * implementations can be run over the identical 2 000-fragment, six-year corpus and diffed.
 *
 * The interesting part is the mapping itself. The prototype carries a `kind` discriminator;
 * the Record has no such column, because what a fragment *is* emerges from which tables
 * mention it. This function is where that translation is written down, and it is the same
 * translation the repository performs when it assembles `Material` out of SQL.
 */

// eslint-disable-next-line @typescript-eslint/no-var-requires
const proto = require('./prototype/chinottoData.js') as PrototypeModule;

import type { CaptureMethod, Material } from '../model/material';

export type PrototypeFragment = {
  id: string;
  at: number;
  text: string;
  kind: 'text' | 'voice' | 'url' | 'quote';
  quote?: string;
  url?: string;
  domain?: string;
  title?: string | null;
  source?: string;
  dur?: number;
  lineId?: string;
  prevText?: string;
  correctedAt?: number;
};

export type PrototypeBand =
  | { type: 'band'; key: string; D: number; labels: string[]; items: PrototypeFragment[] }
  | {
      type: 'years';
      key: string;
      years: { y: number; months: number[]; first: string[]; count: number }[];
    };

type PrototypeModule = {
  NOW: number;
  buildCorpus(): PrototypeFragment[];
  bandsFor(input: {
    frags: PrototypeFragment[];
    now: number;
    anchor?: { y: number; m: number } | null;
    query?: string | null;
    exclude?: Record<string, boolean> | null;
  }): PrototypeBand[];
  parseAnchor(text: string, now: number): { y: number; m: number } | null | undefined;
  tokens(text: string): { w: string; s: string }[];
  stem(word: string): string;
  sharedRun(a: unknown[], b: unknown[]): { len: number; a: string; b: string } | null;
  sharedCount(a: unknown[], b: unknown[]): number;
  parts(text: string, phrases?: (string | null)[]): { t: string; m: boolean; n: boolean }[];
  suggestContinuation(
    frag: PrototypeFragment,
    frags: PrototypeFragment[],
    now: number
  ): { id: string; score: number; text: string; when: string } | null;
  traces(
    line: PrototypeFragment[],
    frags: PrototypeFragment[],
    rejected: Record<string, boolean>
  ): { frag: PrototypeFragment; kind: 'seen' | 'guess'; phrase: string | null }[];
  displayText(f: PrototypeFragment): string;
  firstLine(f: PrototypeFragment): string;
  hay(f: PrototypeFragment): string;
  dayLabel(t: number, now: number): string;
  monthLabel(t: number, now: number, forceYear?: boolean): string;
  fullDate(t: number): string;
  ago(t: number, now: number): string;
  fmtTime(t: number): string;
  fmtDur(s: number): string;
  yearsSummary(f: PrototypeFragment[]): { y: number; months: number[]; count: number }[];
  lastMonthWithData(f: PrototypeFragment[], y: number): number;
  guessFor(q: string, f: PrototypeFragment[], now: number): PrototypeFragment[];
};

export const prototype = proto;
export const PROTOTYPE_NOW = proto.NOW;

/** The prototype's `kind` restated as the Record's capture method. */
function methodFor(f: PrototypeFragment): CaptureMethod {
  if (f.kind === 'voice') return 'voice';
  if (f.kind === 'url' || f.kind === 'quote') return f.source === 'shared' ? 'shared' : 'url';
  return 'typed';
}

export function toMaterial(f: PrototypeFragment): Material {
  const isExternal = f.kind === 'url' || f.kind === 'quote';
  return {
    id: f.id,
    at: f.at,
    body: f.text ?? '',
    method: methodFor(f),
    origin: 'mobile',

    correctedAt: f.correctedAt ?? null,
    previousBody: f.prevText ?? null,
    correctionCount: f.prevText ? 1 : 0,
    removedAt: null,

    lineId: f.lineId ?? null,

    // An encounter exists when the prototype knew a URL. A quotation with no URL — which the
    // prototype produces for text typed inside quotation marks — is material the person put
    // there, not something met, so it carries `selectedText` and no encounter.
    url: isExternal ? (f.url ?? null) : null,
    urlKey: isExternal && f.url ? urlKey(f.url) : null,
    sourceApp: f.source === 'shared' ? 'share' : null,
    selectedText: f.kind === 'quote' ? (f.quote ?? null) : null,
    domain: isExternal ? (f.domain ?? null) : null,
    title: isExternal ? (f.title ?? null) : null,
    enrichmentState: isExternal ? (f.title ? 'ok' : 'pending') : null,

    durationMs: f.kind === 'voice' ? (f.dur ?? 0) * 1000 : null,
    audioMissing: false,
    transcriptState: f.kind === 'voice' ? 'ok' : null,
  };
}

/**
 * The same deterministic, offline normalisation the Record computes once at capture: host
 * and path, lowercased, no scheme, no `www.`, no fragment, no tracking parameters.
 *
 * Duplicated here in its simplest form rather than imported, so a change to the real one
 * shows up as a test failure instead of being silently agreed with.
 */
export function urlKey(raw: string): string {
  let s = raw.trim().toLowerCase();
  s = s.replace(/^https?:\/\//, '').replace(/^www\./, '');
  s = s.split('#')[0];
  const [path, query] = s.split('?');
  if (!query) return path.replace(/\/+$/, '');
  const kept = query
    .split('&')
    .filter((p) => !/^(utm_[^=]*|fbclid|gclid|ref|ref_src|mc_cid|mc_eid|igshid)=/.test(p))
    .sort();
  const base = path.replace(/\/+$/, '');
  return kept.length ? `${base}?${kept.join('&')}` : base;
}

/** The prototype's corpus, as `Material`. */
export function prototypeCorpus(): Material[] {
  return proto.buildCorpus().map(toMaterial);
}
