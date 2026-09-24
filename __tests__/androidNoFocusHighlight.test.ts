/**
 * The app theme turns off Android's default focus highlight.
 *
 * After a hardware key the whole record list was drawn as a grey slab — the system's default
 * highlight on a focused `ScrollView` — and it stayed across a restart until the next touch.
 */

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { applyNoFocusHighlight } = require('../plugins/withAndroidNoFocusHighlight');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const appJson = require('../app.json');

const STYLES = {
  resources: {
    style: [
      {
        $: { name: 'AppTheme', parent: 'Theme.AppCompat.DayNight.NoActionBar' },
        item: [{ $: { name: 'colorPrimary' }, _: '@color/colorPrimary' }],
      },
    ],
  },
};

type Item = { $: { name: string; 'tools:targetApi'?: string }; _: string };

function appTheme(styles: typeof STYLES): Item[] {
  return (styles.resources.style.find((s) => s.$.name === 'AppTheme')?.item ?? []) as Item[];
}

describe('android focus highlight', () => {
  it('is turned off in the app theme, for the API level that has it', () => {
    const out = applyNoFocusHighlight(structuredClone(STYLES));
    const item = appTheme(out).find((i) => i.$.name === 'android:defaultFocusHighlightEnabled');
    expect(item?._).toBe('false');
    expect(item?.$['tools:targetApi']).toBe('26');
  });

  it('is idempotent across repeated prebuilds', () => {
    const once = applyNoFocusHighlight(structuredClone(STYLES));
    const twice = applyNoFocusHighlight(structuredClone(once));
    expect(appTheme(twice)).toEqual(appTheme(once));
  });

  it('is registered with the app config', () => {
    expect(appJson.expo.plugins).toContain('./plugins/withAndroidNoFocusHighlight.js');
  });
});
