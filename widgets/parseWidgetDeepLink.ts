import { CHINOTTO_WIDGET_CAPTURE_URL } from './chinottoWidgetConstants';

export type WidgetDeepLinkAction =
  | { type: 'capture'; mode: 'default' | 'voice' }
  | { type: 'thought'; thoughtId: string };

/**
 * Parses widget deep links used by iOS home widgets.
 * Supported:
 * - chinotto://capture
 * - chinotto://capture?mode=voice
 * - chinotto://thought/<id>
 */
export function parseWidgetDeepLink(url: string | null | undefined): WidgetDeepLinkAction | null {
  if (!url?.trim()) {
    return null;
  }

  try {
    const expected = new URL(CHINOTTO_WIDGET_CAPTURE_URL);
    const actual = new URL(url);
    if (actual.protocol !== expected.protocol) {
      return null;
    }
    const host = actual.hostname.toLowerCase();

    if (host === expected.hostname.toLowerCase()) {
      const mode = actual.searchParams.get('mode')?.trim().toLowerCase();
      return { type: 'capture', mode: mode === 'voice' ? 'voice' : 'default' };
    }

    if (host === 'thought') {
      const path = actual.pathname.replace(/^\//, '');
      const thoughtId = decodeURIComponent(path).trim();
      if (!thoughtId || path.includes('/') || /\p{Cc}/u.test(thoughtId)) {
        return null;
      }
      return { type: 'thought', thoughtId };
    }

    return null;
  } catch {
    return null;
  }
}
