/**
 * The word matching every evidence-backed thing in the Record rests on.
 *
 * A faithful port of the `---- words ----` section of the prototype's `chinotto-data.js`,
 * which desktop and mobile share. Traces, Returns and the continuation offer all quote real
 * words back to a person, so this is where "the same words" is defined — and it has to mean
 * the same thing on both devices, or the two would disagree about why something came back.
 *
 * Nothing here is clever. It is a stemmer, a stop list and a longest-shared-run search, and
 * that is deliberate: a Return states its reason by quoting, so the matcher must produce
 * something quotable rather than a score.
 */

const STOP = new Set(
  "the a an and or but of to in on at for with is are was were be been it its this that these those i me my we you your he she they them his her our their as by from not no so if then than too very just about into over under again there here what which who whom when where why how do does did done have has had having um uh ok okay i'm i've it's that's don't".split(
    ' '
  )
);

/**
 * Crude, order-dependent suffix stripping. Ported exactly, including the length guards: the
 * guards are what stop it turning short words into single letters that then match everything.
 */
export function stem(word: string): string {
  let s = word.replace(/’/g, "'").replace(/'s$/, '');
  if (s.length > 5) s = s.replace(/ing$/, '');
  s = s.replace(/(edly|ed|es|ly)$/, '');
  if (s.length > 3) s = s.replace(/s$/, '');
  if (s.length > 4) s = s.replace(/e$/, '');
  return s;
}

export type Token = { w: string; s: string };

/**
 * Up to 160 tokens. The cap is the prototype's and it matters at scale: a 10 000-word
 * fragment would otherwise make every comparison against it quadratic in its length.
 */
export const tokens = (text: string | null | undefined): Token[] =>
  (String(text ?? '')
    .toLowerCase()
    .match(/[a-z0-9’']+/g) ?? [])
    .slice(0, 160)
    .map((w) => ({ w, s: stem(w) }));

const esc = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export type SharedRun = {
  len: number;
  /** The run as it appears in the first text — what gets quoted and highlighted. */
  a: string;
  /** The same run as it appears in the second. */
  b: string;
};

/**
 * The longest run of consecutive stem-equal tokens shared by two texts.
 *
 * A run only counts when it carries at least two words that are neither stop words nor
 * two-letter fragments, OR when it is four or more tokens long. That is the line between
 * "these two moments share language" and "these two moments both contain the word 'the'".
 */
export function sharedRun(ta: Token[], tb: Token[]): SharedRun | null {
  let best: SharedRun | null = null;
  const m = tb.length;
  let prev = new Array<number>(m + 1).fill(0);

  for (let i = 1; i <= ta.length; i += 1) {
    const cur = new Array<number>(m + 1).fill(0);
    for (let j = 1; j <= m; j += 1) {
      if (ta[i - 1].s === tb[j - 1].s && ta[i - 1].s.length > 1) {
        cur[j] = prev[j - 1] + 1;
        if (cur[j] >= 2 && (!best || cur[j] > best.len)) {
          const A = ta.slice(i - cur[j], i);
          const B = tb.slice(j - cur[j], j);
          const substantial = A.filter((t) => !STOP.has(t.w) && t.w.length > 2).length >= 2;
          if (substantial || cur[j] >= 4) {
            best = {
              len: cur[j],
              a: A.map((t) => t.w).join(' '),
              b: B.map((t) => t.w).join(' '),
            };
          }
        }
      }
    }
    prev = cur;
  }
  return best;
}

/** How many distinct substantial stems the second text shares with the first. */
export function sharedCount(ta: Token[], tb: Token[]): number {
  const A = new Set(ta.filter((t) => !STOP.has(t.w) && t.w.length > 2).map((t) => t.s));
  let n = 0;
  const seen = new Set<string>();
  for (const t of tb) {
    if (!STOP.has(t.w) && A.has(t.s) && !seen.has(t.s)) {
      seen.add(t.s);
      n += 1;
    }
  }
  return n;
}

export type TextPart = {
  t: string;
  /** Matched — drawn with the highlight wash. */
  m: boolean;
  /** Not matched. Both flags are carried because the template branches on each. */
  n: boolean;
};

/**
 * Splits `text` around every occurrence of any phrase, so the interface can highlight the
 * actual matched words rather than re-searching in the view.
 *
 * Phrases are matched loosely across whitespace and punctuation, because the run came from
 * stems and the text it is being highlighted in is the original wording.
 */
export function parts(text: string | null | undefined, phrases?: (string | null)[]): TextPart[] {
  const source = String(text ?? '');
  if (!source) return [{ t: '', m: false, n: true }];

  const ps = (phrases ?? []).filter((p): p is string => Boolean(p && p.trim()));
  if (!ps.length) return [{ t: source, m: false, n: true }];

  const re = new RegExp(
    ps.map((p) => p.trim().split(/\s+/).map(esc).join('[\\s\\W]+')).join('|'),
    'gi'
  );

  const out: TextPart[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source))) {
    if (!m[0].length) {
      re.lastIndex += 1;
      continue;
    }
    if (m.index > last) out.push({ t: source.slice(last, m.index), m: false, n: true });
    out.push({ t: m[0], m: true, n: false });
    last = m.index + m[0].length;
  }
  if (last < source.length) out.push({ t: source.slice(last), m: false, n: true });
  return out;
}

/**
 * A window of `text` around `phrase`, for a trace row that must show the shared words in
 * context without carrying a whole paragraph.
 */
export function snippet(text: string, phrase: string): string {
  const re = new RegExp(
    phrase
      .trim()
      .split(/\s+/)
      .map(esc)
      .join('[\\s\\W]+'),
    'i'
  );
  const m = text.match(re);
  if (!m || m.index === undefined) return text.slice(0, 90);

  let a = Math.max(0, m.index - 20);
  let b = Math.min(text.length, m.index + m[0].length + 30);
  if (a > 0) a = text.indexOf(' ', a) + 1;
  if (b < text.length) b = text.lastIndexOf(' ', b);
  return `${a > 0 ? '…' : ''}${text.slice(a, b)}${b < text.length ? '…' : ''}`;
}
