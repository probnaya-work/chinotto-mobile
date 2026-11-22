import { parseWidgetDeepLink } from '../parseWidgetDeepLink';

describe('parseWidgetDeepLink', () => {
  it('parses capture deep link', () => {
    expect(parseWidgetDeepLink('chinotto://capture')).toEqual({ type: 'capture', mode: 'default' });
  });

  it('parses voice capture mode', () => {
    expect(parseWidgetDeepLink('chinotto://capture?mode=voice')).toEqual({
      type: 'capture',
      mode: 'voice',
    });
  });

  it('parses thought deep link', () => {
    expect(parseWidgetDeepLink('chinotto://thought/abc-123')).toEqual({
      type: 'thought',
      thoughtId: 'abc-123',
    });
    expect(parseWidgetDeepLink('chinotto://thought/fragment%2Fid')).toEqual({
      type: 'thought',
      thoughtId: 'fragment/id',
    });
  });

  it('returns null for invalid urls', () => {
    expect(parseWidgetDeepLink('https://example.com')).toBeNull();
    expect(parseWidgetDeepLink('chinotto://thought/')).toBeNull();
    expect(parseWidgetDeepLink('chinotto://thought/one/two')).toBeNull();
    expect(parseWidgetDeepLink('chinotto://thought/%C0')).toBeNull();
    expect(parseWidgetDeepLink(null)).toBeNull();
  });
});
