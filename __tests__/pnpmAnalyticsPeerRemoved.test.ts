import * as fs from 'fs';
import * as path from 'path';

/**
 * @react-native-firebase/remote-config peer-depends on @react-native-firebase/analytics with
 * no `optional: true` in its peerDependenciesMeta, even though analytics was removed as dead
 * weight (it has no call sites and remote-config's own podspec doesn't need it natively). Left
 * at pnpm's default, a plain `pnpm install` silently reinstalls it to satisfy that peer — this
 * guards the one setting (`autoInstallPeers: false` in pnpm-workspace.yaml) that keeps a clean
 * install from undoing the removal, and that the lockfile agrees, since a mismatch between the
 * two makes `pnpm install --frozen-lockfile` (what CI runs) fail outright.
 */
it('pnpm-workspace.yaml disables autoInstallPeers', () => {
  const yaml = fs.readFileSync(
    path.join(__dirname, '..', 'pnpm-workspace.yaml'),
    'utf8'
  );
  expect(yaml).toMatch(/^autoInstallPeers:\s*false\s*$/m);
});

it('pnpm-lock.yaml settings agree with pnpm-workspace.yaml (frozen-lockfile requires this)', () => {
  const lockfile = fs.readFileSync(
    path.join(__dirname, '..', 'pnpm-lock.yaml'),
    'utf8'
  );
  expect(lockfile).toMatch(/^\s*autoInstallPeers:\s*false\s*$/m);
});

it('@react-native-firebase/analytics is not a direct dependency', () => {
  const pkg = JSON.parse(
    fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8')
  );
  expect(pkg.dependencies).not.toHaveProperty('@react-native-firebase/analytics');
});
