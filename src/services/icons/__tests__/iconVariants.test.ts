import {
  appIconIdFromNativeName,
  APP_ICON_VARIANTS,
  getAppIconVariant,
  parseAppIconVariantId,
} from '../iconVariants';

describe('iconVariants', () => {
  it('offers exactly the two the design draws', () => {
    // Six became two: iOS tints and Android themes these on their own, and a palette of
    // colours was answering a question the product does not ask.
    expect(APP_ICON_VARIANTS.map((v) => v.id)).toEqual(['dark', 'light']);
  });

  it('draws them on the record’s own field, and its reverse', () => {
    expect(getAppIconVariant('dark')).toMatchObject({
      foreground: '#e6e6e3',
      iosBackground: '#141416',
      nativeName: null,
    });
    expect(getAppIconVariant('light')).toMatchObject({
      foreground: '#1b1b1d',
      iosBackground: '#f2f1ec',
      nativeName: 'LightAppIcon',
    });
  });

  it('maps a null native name to the default icon', () => {
    expect(appIconIdFromNativeName(null)).toBe('dark');
    expect(appIconIdFromNativeName('UnknownIcon')).toBe('dark');
    expect(appIconIdFromNativeName('LightAppIcon')).toBe('light');
  });

  it('resolves a retired colour to the default rather than to nothing', () => {
    // Somebody chose violet. Removing it should give them the default icon, not an
    // unreadable setting.
    for (const retired of ['default', 'violet', 'cyan', 'orange', 'gradient']) {
      expect(parseAppIconVariantId(retired)).toBe('dark');
    }
    expect(parseAppIconVariantId('dark')).toBe('dark');
    expect(parseAppIconVariantId('light')).toBe('light');
    expect(parseAppIconVariantId('nonsense')).toBeNull();
    expect(parseAppIconVariantId(null)).toBeNull();
    expect(parseAppIconVariantId(7)).toBeNull();
  });
});
