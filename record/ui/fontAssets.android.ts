/**
 * The Archivo faces `expo-font` loads at launch, on Android.
 *
 * Metro resolves this file instead of `fontAssets.ts` on Android. The files are the same
 * instances as iOS's, decoded from their WOFF2 container into plain TrueType — the outlines
 * are glyph-for-glyph identical — because Android's `Typeface` cannot read WOFF2 and, rather
 * than failing, draws every face in Roboto. Seen on an API 36 emulator before this existed.
 */
export const FONT_ASSETS: Record<string, number> = {
  'Archivo-400-100': require('../../assets/fonts/android/Archivo-400-100.ttf'),
  'Archivo-400-96': require('../../assets/fonts/android/Archivo-400-96.ttf'),
  'Archivo-400-94': require('../../assets/fonts/android/Archivo-400-94.ttf'),
  'Archivo-400-92': require('../../assets/fonts/android/Archivo-400-92.ttf'),
  'Archivo-400-90': require('../../assets/fonts/android/Archivo-400-90.ttf'),
  'Archivo-400-88': require('../../assets/fonts/android/Archivo-400-88.ttf'),
  'Archivo-400-80': require('../../assets/fonts/android/Archivo-400-80.ttf'),
  'Archivo-400-76': require('../../assets/fonts/android/Archivo-400-76.ttf'),
  'Archivo-500-96': require('../../assets/fonts/android/Archivo-500-96.ttf'),
  'Archivo-540-90': require('../../assets/fonts/android/Archivo-540-90.ttf'),
  'Archivo-540-92': require('../../assets/fonts/android/Archivo-540-92.ttf'),
  'Archivo-540-94': require('../../assets/fonts/android/Archivo-540-94.ttf'),
  'Archivo-400-100-Italic': require('../../assets/fonts/android/Archivo-400-100-Italic.ttf'),
  'Archivo-400-94-Italic': require('../../assets/fonts/android/Archivo-400-94-Italic.ttf'),
  'Archivo-400-88-Italic': require('../../assets/fonts/android/Archivo-400-88-Italic.ttf'),
  'Archivo-400-80-Italic': require('../../assets/fonts/android/Archivo-400-80-Italic.ttf'),
  'Archivo-400-76-Italic': require('../../assets/fonts/android/Archivo-400-76-Italic.ttf'),
};
