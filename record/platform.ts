/**
 * What this phone can actually do, in one place.
 *
 * The Record was built on an iPhone, and several of its surfaces stand on iOS-only native
 * code: hold-to-speak and playback, the home widget, the alternate app icon. On Android none
 * of those modules exist yet, and a surface that offers them anyway either fails under the
 * finger or claims something false — a circle that never listens, a widget that is not there.
 *
 * So the surface asks here rather than checking the platform itself, and what is missing is
 * simply not offered — the UI stays minimal, and the gaps are recorded in
 * `docs/unspecified-decisions.md` §10 rather than listed to the person.
 *
 * On iOS every answer is what the shipping app already assumes, so nothing about the iPhone
 * surface changes. Sync is off on Android for a different reason from the others: it is not
 * missing code but an undecided identity and entitlement model — see
 * `docs/unspecified-decisions.md` §10.
 */

export type PlatformCapabilities = {
  /** How the surface names this device: `this iphone`, `this phone`. */
  deviceNoun: string;
  /**
   * Whether the update gate may run: the soft notice, the forced screen, settings' `up to date`.
   * Every one of them points at a store listing, so it runs only where a live one exists.
   */
  updateGate: boolean;
  /** Hold-to-speak: recording, and the transcript drafted from it. */
  voice: boolean;
  /** Hearing a retained recording back. */
  playback: boolean;
  /** A home-screen widget this app actually ships. */
  homeWidget: boolean;
  /** Choosing between the alternate app icons. */
  iconChoice: boolean;
  /** Whether sync can be set up from this phone at all. */
  syncSetup: boolean;
  /** What the share sheet can send in. */
  shareKinds: string;
};

const IOS: PlatformCapabilities = {
  deviceNoun: 'iphone',
  updateGate: true,
  voice: true,
  playback: true,
  homeWidget: true,
  iconChoice: true,
  syncSetup: true,
  shareKinds: 'a page, a selection or a photo',
};

/**
 * Android, as it stands.
 *
 * `voice` and `playback` wait on native modules that do not exist yet; `homeWidget` on an
 * Android widget; `iconChoice` on activity aliases. Android's share filter accepts text,
 * which carries pages and selections but not photos. `updateGate` waits on a live Play Store
 * listing: there is none, and an update notice with nowhere to send somebody is worse than
 * none — turn it on only once the listing is public and its URL is in Remote Config.
 */
const ANDROID: PlatformCapabilities = {
  deviceNoun: 'phone',
  updateGate: false,
  voice: false,
  playback: false,
  homeWidget: false,
  iconChoice: false,
  syncSetup: false,
  shareKinds: 'a page or a selection',
};

export function capabilitiesFor(os: string): PlatformCapabilities {
  return os === 'android' ? ANDROID : IOS;
}
