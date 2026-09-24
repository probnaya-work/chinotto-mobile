/**
 * What this phone can actually do, in one place.
 *
 * The Record was built on an iPhone, and several of its surfaces stand on native code that
 * Android either has in its own form (hold-to-speak and playback, `modules/chinotto-voice`)
 * or does not have at all (the home widget, the alternate app icon, sync). A surface that
 * offers what is missing either fails under the finger or claims something false — a widget
 * that is not there, a sync that cannot be set up.
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
  /** How the surface names the system, in `… in ios settings`, `android will ask …`. */
  systemName: 'ios' | 'android';
  /** Settings › privacy: what happens to the words, and only what actually happens. */
  privacyLine: string;
  /** Settings › privacy: how speech becomes words here. Null where the line above says it all. */
  voicePrivacyLine: string | null;
  /** Settings › why chinotto: the argument, in paragraphs, true of this phone. */
  manifesto: readonly string[];
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
  systemName: 'ios',
  privacyLine: 'the words stay on this phone unless sync is on, and then only go to your own devices.',
  voicePrivacyLine: null,
  manifesto: [
    'Thinking rarely starts structured.',
    'Most tools assume the opposite. They ask you to create a document, a folder, a workspace before you even know what the thought is.',
    'So you name things, you organize, you plan — and the thought slips away. Sometimes you do not write it down at all because the friction is too high.',
    'Chinotto is built for the moment the thought appears. You open it, capture it, and move on. No hierarchy to maintain. Just capture.',
    'Structure can come later, when the thought has had time to settle. Not before.',
  ],
};

/**
 * Android, as it stands.
 *
 * `voice` and `playback` are `modules/chinotto-voice`: a recording is always kept, and it
 * becomes words only through a recogniser the phone shows cannot reach the network (see
 * `OnDevicePolicy.kt`). `homeWidget` waits on an Android widget; `iconChoice` on activity
 * aliases. There is no sync on Android, so the privacy lines say so plainly rather than
 * describing a sync that is not there. Android's share filter accepts text,
 * which carries pages and selections but not photos. `updateGate` waits on a live Play Store
 * listing: there is none, and an update notice with nowhere to send somebody is worse than
 * none — turn it on only once the listing is public and its URL is in Remote Config.
 */
const ANDROID: PlatformCapabilities = {
  deviceNoun: 'phone',
  updateGate: false,
  voice: true,
  playback: true,
  homeWidget: false,
  iconChoice: false,
  syncSetup: false,
  shareKinds: 'a page or a selection',
  systemName: 'android',
  privacyLine: 'what you write and what you say stay on this phone. none of it is sent anywhere.',
  voicePrivacyLine:
    'speech becomes words only through android’s on-device recogniser, and only where this phone shows that recogniser can’t reach the internet. otherwise the recording is kept here without words, and read again if that changes.',
  // The manifesto as chinotto.app now states it, less what Android does not do: no widget,
  // no sync, no desktop from this phone. Every sentence here is true of this app.
  manifesto: [
    'Chinotto is for thoughts that stop mid-sentence — and for returning to them when more has gathered around them.',
    'Most notes apps help you capture, organize, or find a note later. Returning to an unfinished thought — with more around it — is rarer: how do you pick up where you left off?',
    'Most notes apps keep the file. Chinotto keeps the return — the same line, later, with more weight.',
    'You capture without closing the thought. Structure can wait until you come back.',
    'On this phone, Chinotto is the pocket — type, hold the circle and talk, or share in from another app; find what came before when you have a minute.',
    'Not another notes app. A place to pick up unfinished thoughts months later.',
    'Your thoughts stay on this phone. There is no Chinotto account.',
  ],
};

export function capabilitiesFor(os: string): PlatformCapabilities {
  return os === 'android' ? ANDROID : IOS;
}
