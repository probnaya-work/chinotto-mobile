# iOS 3.0.0 (local build 46) — source integrated 22 November 2026

The 3.0.0 source is in `main`: [#6](https://github.com/probnaya-work/chinotto-mobile/pull/6) brought the initial candidate, [#9](https://github.com/probnaya-work/chinotto-mobile/pull/9) added the thought actions menu, and [#10](https://github.com/probnaya-work/chinotto-mobile/pull/10) integrated the remaining changes from #7 and #8. The integration merge is `d22d6fa`.

EAS assigns the distribution build number. Build 46 is the local native version. This records source integration; it does not establish a new TestFlight upload or App Store release.

- Set a reminder on a thought, manage the date and preview, and reopen the thought directly from its notification.
- Return to an older thought with a dated explanation. Continue it as a new moment in the same Line.
- Opt in to discreet Return alerts in Notifications. The device-local choice starts off and spaces alerts at least seven days apart.
- Request a possible connection, compare dated original passages, and dismiss a pair. Shared-word evidence comes first; supported iPhones can compare meaning on-device when no lexical connection is found.
- Hide secondary actions while reading or continuing a thought. The reader adapts when you change the iPhone text size.
- On iOS 26 and later, use the reader's ellipsis menu for reminders, quiet reading, and connection lookup. Earlier iOS versions retain inline actions.
- Recent thoughts fit within the small, medium, and large Home Screen widgets. A thought opens directly in the reader, after device authentication when protection is enabled.
- Move the native and JavaScript dependencies to Expo SDK 58, React Native 0.88, and React 19.3.

Integration verification: 132 Jest suites passed (891 tests passed, one skipped), TypeScript passed, and the Expo dependency check passed. The reader regression also covers meaning lookup through the iOS 26 menu and the earlier inline action. GitHub CI passed for the final PR commit and the [merge into main](https://github.com/probnaya-work/chinotto-mobile/actions/runs/45071615201). Native delivery, model quality, and physical-device acceptance remain separate checks; see [development](development.md) and [verification history](product-improvements.md).

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
