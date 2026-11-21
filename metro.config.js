const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const projectRoot = __dirname;

/** @type {import('expo/metro-config').ExpoMetroConfig} */
const config = getDefaultConfig(projectRoot);

// Make pnpm's virtual store visible to Metro.
const pnpmStore = path.join(projectRoot, 'node_modules', '.pnpm');
config.watchFolders = [...new Set([...(config.watchFolders ?? []), pnpmStore])];

// pnpm: ensure Metro resolves expo-blur the same way Node does (glass search field).
try {
  const expoBlurRoot = path.dirname(
    require.resolve('expo-blur/package.json', { paths: [projectRoot] }),
  );
  config.resolver.extraNodeModules = {
    ...config.resolver.extraNodeModules,
    'expo-blur': expoBlurRoot,
  };
} catch {
  // expo-blur missing until `pnpm install` — bundle will fail on import until then.
}

// Webfonts loaded via `require()` for expo-font (default Metro asset list is image-first)
if (!config.resolver.assetExts.includes('woff')) {
  config.resolver.assetExts.push('woff');
}
if (!config.resolver.assetExts.includes('woff2')) {
  config.resolver.assetExts.push('woff2');
}

module.exports = config;
