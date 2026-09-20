/**
 * The durable identity of a source met more than once.
 *
 * `url_raw` is stored byte-for-byte as it arrived and is never rewritten. `url_key` is this
 * deterministic, **offline** normalisation of it, computed once at capture rather than
 * re-derived by fuzzy matching later — which is what lets the record say "you met this site
 * before" without a network call and without guessing.
 *
 * Offline is the constraint that shapes the whole function. It cannot resolve a redirect,
 * cannot canonicalise via the page's own `<link rel=canonical>`, and cannot know that two
 * different paths are the same article. It normalises only what is safe to normalise from
 * the string itself, and leaves everything else alone.
 */

/**
 * Parameters that identify a referral rather than a resource. Stripping these is the one
 * place this function makes a judgement, and it is a conservative one: a parameter that
 * might select content — `?p=2`, `?id=7`, `?q=` — is kept, because dropping it would merge
 * two genuinely different pages into one encounter.
 */
const TRACKING = new Set([
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'utm_name',
  'utm_id',
  'fbclid',
  'gclid',
  'gbraid',
  'wbraid',
  'msclkid',
  'dclid',
  'yclid',
  'twclid',
  'igshid',
  'igsh',
  'mc_cid',
  'mc_eid',
  'ref',
  'ref_src',
  'ref_url',
  'referrer',
  'source',
  's_kwcid',
  'cmpid',
  'campaign_id',
  '_hsenc',
  '_hsmi',
  'vero_id',
  'oly_enc_id',
  'oly_anon_id',
  'at_medium',
  'at_campaign',
  'spm',
  'scm',
]);

export function urlKey(raw: string): string {
  let s = String(raw ?? '').trim();
  if (!s) return '';

  // A share sheet can hand over a bare host, so a missing scheme is normal rather than an
  // error. Nothing about the scheme is kept either way: http and https are the same source.
  s = s.replace(/^[a-z][a-z0-9+.-]*:\/\//i, '');
  s = s.split('#')[0];

  const slash = s.indexOf('/');
  const q = s.indexOf('?');
  const cut = slash === -1 ? (q === -1 ? s.length : q) : q === -1 ? slash : Math.min(slash, q);

  let host = s.slice(0, cut).toLowerCase();
  const rest = s.slice(cut);
  host = host.replace(/^www\./, '');
  // Credentials and an explicit default port are not part of a source's identity.
  host = host.replace(/^[^@/]*@/, '').replace(/:(80|443)$/, '');

  const [pathRaw = '', queryRaw = ''] = rest.split('?');
  // Case is preserved in the path: plenty of sites serve different content for different
  // cases, and folding it would merge two pages that are not the same one.
  const path = pathRaw.replace(/\/+$/, '');

  if (!queryRaw) return `${host}${path}`;

  const kept = queryRaw
    .split('&')
    .filter((pair) => {
      if (!pair) return false;
      const name = pair.split('=')[0].toLowerCase();
      return !TRACKING.has(name);
    })
    // Sorted so the same parameters in a different order are the same encounter.
    .sort();

  return kept.length ? `${host}${path}?${kept.join('&')}` : `${host}${path}`;
}

/** The domain shown on a row, from the raw URL. Never invented when there is no host. */
export function domainOf(raw: string): string | null {
  const key = urlKey(raw);
  if (!key) return null;
  const host = key.split(/[/?]/)[0];
  return host.includes('.') ? host : null;
}

/**
 * Whether a body is exactly one URL and nothing else.
 *
 * A fragment with two links stays plain text, per desktop's decision 5c.6: one link is
 * unambiguous, two is a judgement about which one the fragment is *about*, and the design
 * does not make that judgement.
 */
export function soleUrlIn(body: string): string | null {
  const text = String(body ?? '').trim();
  if (!text) return null;
  const matches = text.match(/\bhttps?:\/\/\S+/gi) ?? [];
  if (matches.length === 1) {
    // The whole body must be the link, or the link plus nothing but whitespace.
    return text === matches[0] ? matches[0] : null;
  }
  if (matches.length > 1) return null;

  // A bare host typed without a scheme, e.g. `theatlantic.com/ideas`.
  const bare = text.match(/^(([\w-]+\.)+[a-z]{2,})(\/\S*)?$/i);
  return bare ? `https://${text}` : null;
}
