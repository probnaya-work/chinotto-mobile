/**
 * Rasterize the Chinotto mark to every icon the app ships.
 * Run: pnpm run generate:icons
 *
 * One master, one geometry. The mark is a ring with three dots receding down a column, drawn
 * in a 64-unit box — the same box `record/ui/Mark.tsx` draws, so the icon and the lockup and
 * the mark inside settings are the same object at different sizes rather than three drawings
 * that happen to look alike.
 *
 * The old mark (a ring with four scattered dots, periwinkle `#8a94c8`) is gone, and so are
 * its five colour variants. There are exactly two now — dark and light — because iOS tints
 * and Android themes these two on their own, and a palette of six was answering a question
 * nobody asked.
 *
 * Proportions, from the identity file and matched to the prototype's own settings tile:
 *   * the mark occupies 0.62 of the icon's square;
 *   * the ring is stroke 3 in the 64-unit box, drawn rather than scaled;
 *   * Android's adaptive foreground sits inside the 66% safe zone, so the mark is drawn at
 *     0.62 × 0.667 ≈ 0.41 of that canvas and the launcher's mask never clips it.
 */
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import sharp from 'sharp';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

/** How much of the square the mark takes up. */
const MARK_SCALE = 0.62;
/** Inside Android's adaptive safe zone. */
const ADAPTIVE_MARK_SCALE = MARK_SCALE * (2 / 3);

/** The ≥40pt rung: three dots, receding. Identical to `Mark.tsx`'s `full`. */
const RING = { cx: 32, cy: 32, r: 28, strokeWidth: 3 };
const DOTS = [
  { cy: 23, r: 8 },
  { cy: 38, r: 4.5 },
  { cy: 47.5, r: 2.5 },
];

/**
 * The two variants, and only these two.
 * `dark` is the record's own field; `light` is the second appearance.
 */
const VARIANTS = [
  { id: 'dark', foreground: '#e6e6e3', background: '#141416' },
  { id: 'light', foreground: '#1b1b1d', background: '#f2f1ec' },
];

/** The mark, as SVG, centred in a `size` square at `scale` of it. */
function markSvg({ size, foreground, scale = MARK_SCALE }) {
  const drawn = size * scale;
  const unit = drawn / 64;
  const offset = (size - drawn) / 2;
  return `
  <g transform="translate(${offset} ${offset}) scale(${unit})">
    <circle cx="${RING.cx}" cy="${RING.cy}" r="${RING.r}" stroke="${foreground}" stroke-width="${RING.strokeWidth}" fill="none"/>
    ${DOTS.map((d) => `<circle cx="32" cy="${d.cy}" r="${d.r}" fill="${foreground}"/>`).join('\n    ')}
  </g>`;
}

function squareIconSvg({ foreground, background, size = 1024 }) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect width="${size}" height="${size}" fill="${background}"/>
${markSvg({ size, foreground })}
</svg>
`;
}

function transparentMarkSvg({ foreground, size = 1024, scale = MARK_SCALE }) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" fill="none" xmlns="http://www.w3.org/2000/svg">
${markSvg({ size, foreground, scale })}
</svg>
`;
}

async function png(svg, outRelative, size) {
  const out = join(root, outRelative);
  mkdirSync(dirname(out), { recursive: true });
  await sharp(Buffer.from(svg)).resize(size, size).png().toFile(out);
  console.log(`Wrote ${outRelative} (${size}×${size})`);
}

function writeSvg(outRelative, svg) {
  writeFileSync(join(root, outRelative), svg);
  console.log(`Wrote ${outRelative}`);
}

/* ------------------------------------------------------------------ the masters */

const dark = VARIANTS[0];

writeSvg('assets/chinotto-icon.svg', squareIconSvg(dark));
writeSvg(
  'assets/chinotto-icon-foreground.svg',
  transparentMarkSvg({ foreground: dark.foreground, scale: ADAPTIVE_MARK_SCALE })
);
// Monochrome is themed by Android itself, so it is drawn in flat black and left alone.
writeSvg(
  'assets/chinotto-icon-monochrome.svg',
  transparentMarkSvg({ foreground: '#000000', scale: ADAPTIVE_MARK_SCALE })
);
// Kept as the mark on its own, for anywhere the identity is needed without a background.
// It is NOT the native splash any more — see the splash section below for why.
writeSvg('assets/chinotto-splash-logo.svg', transparentMarkSvg({ foreground: dark.foreground, scale: 1 }));

/* ------------------------------------------------------------------- the rasters */

await png(readFileSync(join(root, 'assets/chinotto-icon.svg'), 'utf8'), 'assets/icon.png', 1024);
await png(
  readFileSync(join(root, 'assets/chinotto-icon-foreground.svg'), 'utf8'),
  'assets/android-icon-foreground.png',
  1024
);
await png(
  readFileSync(join(root, 'assets/chinotto-icon-monochrome.svg'), 'utf8'),
  'assets/android-icon-monochrome.png',
  1024
);
await png(readFileSync(join(root, 'assets/chinotto-icon.svg'), 'utf8'), 'assets/favicon.png', 48);
// What `app.json` points `expo-splash-screen` at, so a prebuild would produce the same
// empty splash the committed iOS asset already is.
await png(
  `<svg width="2048" height="2048" viewBox="0 0 2048 2048" fill="none" xmlns="http://www.w3.org/2000/svg"></svg>\n`,
  'assets/splash-icon.png',
  2048
);

/* ------------------------------------------------- the native splash, on iOS and Android */

// The native splash draws NOTHING but the background, and that is the point.
//
// It used to carry the mark, which meant the app opened on the finished lockup and then
// played the lockup from the beginning: the mark appeared, vanished, and assembled itself
// again. A splash that shows the last frame of an animation cannot hand over to its first.
//
// So the splash is the field the lockup arrives on. Its colour is the record's own surface,
// which makes the handover invisible — there is no seam to see, because nothing changes at
// it — and the identity is drawn once, in motion, by `record/ui/Launch.tsx`.
//
// The image is kept (transparent) rather than removed: `SplashScreen.storyboard` names it,
// this repo commits `ios/`, and `expo-splash-screen` only rewrites that storyboard during a
// prebuild that does not happen here. An asset the storyboard cannot find is a build error;
// an asset with nothing in it is a background.
// The field itself is the record's own surface, not a darker colour of its own. A splash
// that is a different black than the app is a step you can see at the handover, which is
// the seam this was all meant to remove.
const splashBackground = dark.background;
{
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(splashBackground.slice(i, i + 2), 16) / 255);
  writeFileSync(
    join(root, 'ios/Chinotto/Images.xcassets/SplashScreenBackground.colorset/Contents.json'),
    `${JSON.stringify(
      {
        colors: [
          {
            color: {
              components: { alpha: '1.000', blue: String(b), green: String(g), red: String(r) },
              'color-space': 'srgb',
            },
            idiom: 'universal',
          },
        ],
        info: { version: 1, author: 'expo' },
      },
      null,
      2
    )}\n`
  );
  console.log(`Wrote ios/.../SplashScreenBackground.colorset (${splashBackground})`);
}

const SPLASH_WIDTH = 120;
const emptySplashSvg = `<svg width="${SPLASH_WIDTH}" height="${SPLASH_WIDTH}" viewBox="0 0 ${SPLASH_WIDTH} ${SPLASH_WIDTH}" fill="none" xmlns="http://www.w3.org/2000/svg"></svg>\n`;
writeSvg('assets/splash-icon.svg', emptySplashSvg);
for (const [suffix, scale] of [['', 1], ['@2x', 2], ['@3x', 3]]) {
  await png(
    emptySplashSvg,
    `ios/Chinotto/Images.xcassets/SplashScreenLogo.imageset/image${suffix}.png`,
    SPLASH_WIDTH * scale
  );
}

/* ---------------------------------------------------------------- the two variants */

// Anything the old six-variant scheme left behind goes, rather than sitting in the bundle
// pretending to be choosable.
const appIconsDir = join(root, 'assets', 'app-icons');
rmSync(appIconsDir, { recursive: true, force: true });

for (const variant of VARIANTS) {
  const svg = squareIconSvg(variant);
  await png(svg, `assets/app-icons/${variant.id}/ios.png`, 1024);
  await png(
    transparentMarkSvg({ foreground: variant.foreground, scale: ADAPTIVE_MARK_SCALE }),
    `assets/app-icons/${variant.id}/android-foreground.png`,
    1024
  );
}

/* --------------------------------------------------------------- the iOS icon sets */

const ICON_SLOTS = [
  { filename: 'icon-60@2x.png', size: 120, idiom: 'iphone', scale: '2x', pointSize: '60x60' },
  { filename: 'icon-60@3x.png', size: 180, idiom: 'iphone', scale: '3x', pointSize: '60x60' },
  { filename: 'icon-76@2x.png', size: 152, idiom: 'ipad', scale: '2x', pointSize: '76x76' },
  { filename: 'icon-83.5@2x.png', size: 167, idiom: 'ipad', scale: '2x', pointSize: '83.5x83.5' },
  {
    filename: 'icon-1024@1x.png',
    size: 1024,
    idiom: 'ios-marketing',
    scale: '1x',
    pointSize: '1024x1024',
  },
];

const xcassets = join(root, 'ios', 'Chinotto', 'Images.xcassets');

async function writeIconSet(setDir, svg) {
  mkdirSync(setDir, { recursive: true });
  for (const slot of ICON_SLOTS) {
    await sharp(Buffer.from(svg)).resize(slot.size, slot.size).png().toFile(join(setDir, slot.filename));
  }
  writeFileSync(
    join(setDir, 'Contents.json'),
    `${JSON.stringify(
      {
        images: ICON_SLOTS.map((slot) => ({
          size: slot.pointSize,
          idiom: slot.idiom,
          filename: slot.filename,
          scale: slot.scale,
        })),
        info: { version: 1, author: 'xcode' },
      },
      null,
      2
    )}\n`
  );
  console.log(`Wrote ${setDir.replace(root, '.')}`);
}

// The five icon sets the old palette shipped are removed, not left orphaned in the bundle.
for (const stale of ['Violet', 'Cyan', 'Orange', 'Gradient', 'Light']) {
  rmSync(join(xcassets, `${stale}AppIcon.appiconset`), { recursive: true, force: true });
}

// An older Expo template named the marketing icon `App-Icon-1024x1024@1x.png`. Nothing in
// `Contents.json` has referenced it since, so it was sitting in the catalog carrying the old
// four-dot mark and being compiled into the bundle for no reason.
rmSync(join(xcassets, 'AppIcon.appiconset', 'App-Icon-1024x1024@1x.png'), { force: true });

// `dark` is the primary icon, so it is written as `AppIcon` and NOT also as a named
// alternate — an extra set nothing can select would still be compiled into the bundle.
// `light` is the only alternate, which is exactly what `iconVariants.ts` declares and what
// `Info.plist` registers. The three must agree or `setAlternateIconName` fails at runtime.
await writeIconSet(join(xcassets, 'AppIcon.appiconset'), squareIconSvg(dark));
rmSync(join(xcassets, 'DarkAppIcon.appiconset'), { recursive: true, force: true });

const light = VARIANTS.find((v) => v.id === 'light');
await writeIconSet(join(xcassets, 'LightAppIcon.appiconset'), squareIconSvg(light));

console.log('Done.');
