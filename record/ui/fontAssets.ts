/**
 * The Archivo faces `expo-font` loads at launch — on iOS, and everywhere but Android.
 *
 * These files carry a `.ttf` name but are WOFF2 inside: the generator saves the instancer's
 * output with the source's WOFF2 flavour. CoreText reads WOFF2 transparently, so iOS renders
 * them. Android's `Typeface` does not — it silently falls back to Roboto — which is why
 * Android resolves `fontAssets.android.ts` instead. These iOS files are left exactly as they
 * shipped.
 */
export const FONT_ASSETS: Record<string, number> = {
  'Archivo-400-100': require('../../assets/fonts/Archivo-400-100.ttf'),
  'Archivo-400-96': require('../../assets/fonts/Archivo-400-96.ttf'),
  'Archivo-400-94': require('../../assets/fonts/Archivo-400-94.ttf'),
  'Archivo-400-92': require('../../assets/fonts/Archivo-400-92.ttf'),
  'Archivo-400-90': require('../../assets/fonts/Archivo-400-90.ttf'),
  'Archivo-400-88': require('../../assets/fonts/Archivo-400-88.ttf'),
  'Archivo-400-80': require('../../assets/fonts/Archivo-400-80.ttf'),
  'Archivo-400-76': require('../../assets/fonts/Archivo-400-76.ttf'),
  'Archivo-500-96': require('../../assets/fonts/Archivo-500-96.ttf'),
  'Archivo-540-90': require('../../assets/fonts/Archivo-540-90.ttf'),
  'Archivo-540-92': require('../../assets/fonts/Archivo-540-92.ttf'),
  'Archivo-540-94': require('../../assets/fonts/Archivo-540-94.ttf'),
  'Archivo-400-100-Italic': require('../../assets/fonts/Archivo-400-100-Italic.ttf'),
  'Archivo-400-94-Italic': require('../../assets/fonts/Archivo-400-94-Italic.ttf'),
  'Archivo-400-88-Italic': require('../../assets/fonts/Archivo-400-88-Italic.ttf'),
  'Archivo-400-80-Italic': require('../../assets/fonts/Archivo-400-80-Italic.ttf'),
  'Archivo-400-76-Italic': require('../../assets/fonts/Archivo-400-76-Italic.ttf'),
};
