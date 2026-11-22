# iOS 3.0.0 (local build 46) — source integrated 22 November 2026

The 3.0.0 source is in `main`: [#6](https://github.com/probnaya-work/chinotto-mobile/pull/6) brought the mobile baseline, [#9](https://github.com/probnaya-work/chinotto-mobile/pull/9) added the iOS thought actions menu, and [#10](https://github.com/probnaya-work/chinotto-mobile/pull/10) integrated the remaining changes from #7 and #8. The integration merge is `d22d6fa`.

The iOS release source uses version 3.0.0 and local build 46. EAS assigns the distribution build number. This records source integration; it does not establish a new TestFlight upload or App Store release. Android preparation is tracked separately below.

## Record and runtime changes (shared implementation)

- Find remembered words with Unicode-aware evidence and a visible entrance that preserves unfinished capture.
- Return to an older thought with a dated explanation. Continue it as a new moment in the same Line.
- Request a possible connection through shared words, compare dated original passages, and dismiss a pair.
- Quiet reading puts secondary controls away while keeping Continue available. The reader reflows for larger system text sizes.
- Read with the warm light appearance and lifted contrast.
- Move the shared dependencies to Expo SDK 58, React Native 0.88, and React 19.3.

## iOS additions

- Set a reminder on a thought, manage the date and preview, and reopen the thought directly from its notification.
- Opt in to discreet Return alerts in Notifications. The device-local choice starts off and spaces alerts at least seven days apart.
- On supported iPhones, compare meaning on-device through Apple's Natural Language framework when no lexical connection is found.
- On iOS 26 and later, use the reader's ellipsis menu for reminders, quiet reading, and connection lookup. Earlier iOS versions retain inline actions.
- Recent thoughts fit within the small, medium, and large Home Screen widgets. A thought opens directly in the reader, after device authentication when protection is enabled.

## Verification

Integration verification: 132 Jest suites passed (891 tests passed, one skipped), TypeScript passed, and the Expo dependency check passed. The reader regression also covers meaning lookup through the iOS 26 menu and the earlier inline action. GitHub CI passed for the final PR commit and the [merge into main](https://github.com/probnaya-work/chinotto-mobile/actions/runs/45071615201). Native builds, delivery, model quality, and physical-device acceptance for each platform remain separate checks; see [development](development.md) and [verification history](product-improvements.md).

# Android — in preparation, unpublished

Android has not been published. The shared Record changes and Expo SDK 58 / React Native 0.88 migration update the version being prepared for Android. This section tracks that work separately from the iOS 3.0.0 release.

- The shared work improves Find and word evidence, Returns, lexical connections, quiet reading, appearance, and larger-text reading.
- Local capture, retained audio, and the off-network voice policy were already implemented before the iOS 3.0.0 baseline and remain part of the upcoming Android app.
- Sync, iPhone widgets, Apple's native meaning model, and reminder alerts remain iOS capabilities. Android retains the available inline reader actions.

The shared `package.json` and `expo.version` currently read 3.0.0, while the committed Android `versionCode` is 3. These configuration values do not establish the public version or publication status of the upcoming Android app. Native Android build and device acceptance are separate from the JavaScript CI results above. See [development](development.md) and [Android platform decisions](unspecified-decisions.md#10-android).

# iOS 2.2.0 (build 45) — replacement submitted 15 November 2026

Build 45 replaced build 44 for the 2.2.0 submission with manual release. Remaining device acceptance is tracked in `product-improvements.md`.

- Protect reading with optional Face ID or your device code while keeping new capture available. A quiet Chinotto mark accompanies authentication and opening the Record.
- Choose a warm light appearance, lift contrast and use the iPhone's larger text settings.
- Preview and restore a Chinotto archive with dates, wording history, links and original audio, without duplicating moments already present.
- Keep continuation links and earlier wording across current iPhone and Mac clients when sync is enabled. Original audio stays on the device that recorded it.
- Find remembered words from a visible entrance at capture. Search handles Cyrillic and accented words more accurately.
- Revisit older moments when recent writing gives them a reason to return, starting in the first week.
- Improve compatibility with the iOS scene lifecycle.
- Home Screen widgets fit more of your recent thoughts while keeping the original layout.

# iOS 2.1.0 (build 43) — previous App Store release

- Export a portable ZIP of the local Record, including correction history and retained original audio. Export works offline; import and restore are not part of this release.
- Keep local capture available without an account. When optional sync is enabled, a removal on either device erases the local content on the other device. Pending offline deletions remain queued through restart and reconnect.
- Keep voice transcription across pauses and preserve recordings when words are unavailable. The first tap prepares microphone and speech permissions; a later deliberate tap starts recording. Locked capture and discard remain available.
- Improve Settings accessibility and wording, selected-row controls on narrow screens, and launch presentation. Add an expandable interaction reference in Settings for Find, voice, Continue, Correct, and date navigation.
- Let the small home widget preview the latest thought and the medium widget show two recent thoughts while keeping capture one tap away.

Find continues to use the existing interaction. The separate Find affordance study is not included in the production surface.
