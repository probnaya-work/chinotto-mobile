/**
 * Turns off Android's default keyboard-focus highlight for the app.
 *
 * A hardware key — Return on a Bluetooth keyboard, a Chromebook, `adb shell input keyevent` —
 * takes Android out of touch mode, and the first focusable view is then drawn with the
 * system's default focus highlight. In the Record that view is the list's `ScrollView`, so the
 * whole record turned into a grey slab, and stayed grey across a restart until the next touch
 * (touch mode is system-wide). React Native 0.83 has no `focusable` prop for `ScrollView`, so
 * the highlight is turned off in the theme instead.
 *
 * The cost: no drawn focus ring for someone moving through the app with arrow keys. The
 * Record has no such path designed, and every control is still reachable by touch and by
 * TalkBack, which draws its own focus.
 *
 * Android-only: the theme lives in `res/values/styles.xml`, so iOS prebuild output is
 * unaffected.
 */
const { withAndroidStyles, AndroidConfig } = require('expo/config-plugins');

const ITEM = 'android:defaultFocusHighlightEnabled';

function applyNoFocusHighlight(styles) {
  return AndroidConfig.Styles.assignStylesValue(styles, {
    add: true,
    parent: AndroidConfig.Styles.getAppThemeGroup(),
    name: ITEM,
    value: 'false',
    // API 26 attribute; older versions ignore it and have no default highlight to hide.
    targetApi: '26',
  });
}

const withAndroidNoFocusHighlight = (config) =>
  withAndroidStyles(config, (mod) => {
    mod.modResults = applyNoFocusHighlight(mod.modResults);
    return mod;
  });

module.exports = withAndroidNoFocusHighlight;
module.exports.applyNoFocusHighlight = applyNoFocusHighlight;
