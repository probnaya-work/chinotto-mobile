/**
 * The two app icons.
 *
 * There were six: a periwinkle default and five colours. There are two now — the record's
 * own ink field, and the same mark the other way round — because that is what the design
 * draws, and because iOS tints and Android themes these two on their own. A palette of six
 * was answering a question nobody asked.
 *
 * The rasters come from one master: `scripts/generate-app-icons.mjs`, which draws the same
 * ring-and-three-dots geometry as `record/ui/Mark.tsx` at the same proportions. The icon,
 * the launch lockup and the mark in settings are one object, not three drawings that
 * resemble each other.
 */

export type AppIconVariantId = 'dark' | 'light';

/** Ids people may already have stored, and what each becomes. */
const RETIRED: Record<string, AppIconVariantId> = {
  default: 'dark',
  violet: 'dark',
  cyan: 'dark',
  orange: 'dark',
  gradient: 'dark',
};

export type AppIconVariant = {
  id: AppIconVariantId;
  name: string;
  /** Native plugin icon key (PascalCase). Null means the default app icon. */
  nativeName: string | null;
  foreground: string;
  /** iOS full icon background. */
  iosBackground: string;
  /** Android adaptive icons require a solid background colour. */
  androidBackground: string;
};

export const APP_ICON_VARIANTS: AppIconVariant[] = [
  {
    id: 'dark',
    name: 'dark',
    // The default icon, so no alternate is set for it.
    nativeName: null,
    foreground: '#d4d3ce',
    iosBackground: '#141416',
    androidBackground: '#141416',
  },
  {
    id: 'light',
    name: 'light',
    nativeName: 'LightAppIcon',
    foreground: '#1b1b1d',
    iosBackground: '#f2f1ec',
    androidBackground: '#f2f1ec',
  },
];

const byId = new Map(APP_ICON_VARIANTS.map((variant) => [variant.id, variant]));
const byNativeName = new Map(
  APP_ICON_VARIANTS.map((variant) => [variant.nativeName ?? '__default__', variant.id])
);

export function getAppIconVariant(id: AppIconVariantId): AppIconVariant {
  return byId.get(id) ?? APP_ICON_VARIANTS[0];
}

export function appIconIdFromNativeName(name: string | null): AppIconVariantId {
  return byNativeName.get(name ?? '__default__') ?? 'dark';
}

/**
 * Reads a stored id, including one from the retired palette.
 *
 * A retired colour resolves to `dark` rather than to nothing: somebody chose an icon, and
 * the honest outcome of removing it is that they get the default one — not that the setting
 * quietly becomes unreadable.
 */
export function parseAppIconVariantId(raw: unknown): AppIconVariantId | null {
  if (typeof raw !== 'string') return null;
  if (raw === 'dark' || raw === 'light') return raw;
  return RETIRED[raw] ?? null;
}
