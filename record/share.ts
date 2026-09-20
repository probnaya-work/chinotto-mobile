/**
 * What arrives from the share sheet, read structurally rather than flattened.
 *
 * v1 turned every incoming share into one newline-joined string, which is the right answer
 * when all you have is `{id, text, created_at}` and the wrong one now. An encounter is not a
 * string: the URL is the durable identity of a source, the page's title is derived and may
 * be wrong or absent, and a passage somebody selected is *the source's* words, not theirs.
 * Flattening the three into one body makes all of that unrecoverable.
 *
 * So this reads the payloads into their parts, and keeps only what actually arrived. Nothing
 * here requires the network, and nothing here can fail: a bare URL is a complete fragment,
 * and so is a stray line of text.
 *
 * The artifact filtering is inherited from `share/extractShareEntryTexts.ts`, which learned
 * the hard way what Safari and WebKit put in these fields.
 */

export type SharePayloadLike = {
  shareType?: string;
  contentType?: string;
  value?: string | null;
  contentUri?: string | null;
  originalName?: string | null;
};

export type ShareIntake = {
  /** The source that was met, exactly as it arrived. */
  url: string | null;
  /** What the sharing app called it. Derived, and frequently a filename artifact. */
  title: string | null;
  /** Material the source supplied — a selected passage. Never the person's own words. */
  selectedText: string | null;
  /** When there is no URL at all: plain text, shared from somewhere. */
  text: string | null;
};

const isUrl = (s: string): boolean => {
  const t = s.trim();
  if (!/^https?:\/\//i.test(t)) return false;
  try {
    const u = new URL(t);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    // A malformed URL that still says http:// is a URL somebody meant; it is kept raw.
    return true;
  }
};

/**
 * Safari and WebKit put suggested save names in `value` and `originalName` — `www.site.html`,
 * `cmux.com.html`, `Article_Title.html`. None of them is a title anybody wrote.
 */
function isFilenameArtifact(s: string): boolean {
  const t = s.trim();
  if (!t || /\s/.test(t) || /[()[\]]/.test(t) || isUrl(t)) return false;
  if (!/\.html?$/i.test(t)) return false;
  return (
    /^www\.[a-z0-9.-]+\.html?$/i.test(t) ||
    /^([a-z0-9-]+\.)+[a-z]{2,}\.html?$/i.test(t) ||
    /^[a-z0-9._-]+\.html?$/i.test(t)
  );
}

/** A "title" that is just the last path segment tells you nothing the URL does not. */
function echoesTheUrl(name: string, url: string): boolean {
  try {
    const segment = new URL(url).pathname.split('/').filter(Boolean).pop();
    if (!segment) return false;
    const decoded = decodeURIComponent(segment);
    const withoutHtml = name.replace(/\.html?$/i, '');
    return (
      name === segment || name === decoded || withoutHtml === segment || withoutHtml === decoded
    );
  } catch {
    return false;
  }
}

/** `warp.dev` alongside `https://warp.dev/x` is the same thing twice. */
function isBareHostOf(text: string, url: string): boolean {
  const t = text.trim().toLowerCase().replace(/^www\./, '');
  if (!t || t.includes(' ') || t.includes('/')) return false;
  try {
    return new URL(url).hostname.replace(/^www\./i, '').toLowerCase() === t;
  } catch {
    return false;
  }
}

/** `[text](url)` shared as one string. */
function splitMarkdownLink(s: string): { text: string | null; url: string | null } | null {
  const m = /^\[([^\]]*)\]\((https?:[^)\s]+)\)\s*$/i.exec(s.trim());
  if (!m) return null;
  const text = m[1].trim();
  return { text: text && !isFilenameArtifact(text) ? text : null, url: m[2].trim() };
}

/**
 * Reads one share intent.
 *
 * Returns null when nothing usable arrived — an image-only share, say, which this build does
 * not yet make a fragment of.
 */
export function readShare(payloads: SharePayloadLike[]): ShareIntake | null {
  const urls: string[] = [];
  const texts: string[] = [];
  let title: string | null = null;

  for (const p of payloads) {
    const kind = p.shareType ?? '';
    const isWeb = kind === 'url' || kind === 'text' || p.contentType === 'website';
    if (!isWeb) continue;

    const value = (p.value ?? '').trim();
    const uri = (p.contentUri ?? '').trim();
    const name = (p.originalName ?? '').trim();

    for (const candidate of [value, uri]) {
      if (!candidate) continue;
      const link = splitMarkdownLink(candidate);
      if (link) {
        if (link.url) urls.push(link.url);
        if (link.text) texts.push(link.text);
        continue;
      }
      if (isUrl(candidate)) urls.push(candidate);
      else if (!isFilenameArtifact(candidate)) texts.push(candidate);
    }

    if (name && !isFilenameArtifact(name) && !title) title = name;
  }

  const url = urls.find(Boolean) ?? null;

  if (title && url && echoesTheUrl(title, url)) title = null;

  // What is left over, once the title and anything that merely repeats the URL are removed,
  // is the passage somebody selected.
  const remaining = texts.filter(
    (t) => t !== title && !(url && isBareHostOf(t, url)) && !isUrl(t)
  );
  const unique = [...new Set(remaining.map((t) => t.trim()))].filter(Boolean);

  if (!url && unique.length === 0) return null;

  // With no URL there is no encounter, only text somebody sent over.
  if (!url) {
    return { url: null, title: null, selectedText: null, text: unique.join('\n\n') };
  }

  // The longest remaining passage is the selection; a short leftover is far more likely to
  // be a heading the sharing app threw in than something a person highlighted.
  const selected = unique.sort((a, b) => b.length - a.length)[0] ?? null;
  const selectedText = selected && selected.length > 40 ? selected : null;

  // A short leftover that is not a selection is the best title we have, if we have none.
  if (!title && selected && !selectedText) title = selected;

  return { url, title, selectedText, text: null };
}
