# Chinotto Quiet

Quiet is a mode inside the existing iPhone app. Open Chinotto and tap **Quiet** at the top
right of the Record. A protected Record also offers Quiet without asking to unlock it.
An ordinary app launch still opens the Record's capture surface.

**Message** presents Apple's `MFMessageComposeViewController` when the device supports it.
The person selects or types a recipient, writes the message and presses Send in that system
interface. Chinotto does not supply recipients, request the address book, retain message
content or send automatically. The delegate dismisses the composer before resolving its
result back into Quiet. `sent` means accepted by the composer; it is not a delivery receipt.
Cancellation, failure and unavailable messaging have distinct explanations. Message can be
retried, and capture remains available after any result.

**What arrived?** opens the existing `Edge` text input with focus. Quiet uses the same local
Record store and privacy policy as ordinary capture. The database write is the save boundary:
it is never retried because a later Record reload or sync failed. Concurrent Return/Save events
share one pending write. The editor disables changes while saving, keeps the text after a write
failure, and only clears it after success. Success dismisses the keyboard and returns to Quiet.
Back to Quiet cancels editing without saving and keeps the draft in this app session, including
when Quiet is left and reopened. Drafts are not promised to survive process termination.

**Exit Quiet · Record** returns to the existing Record. A widget capture link, reminder or
incoming share uses its existing destination instead of inheriting Quiet's save destination.
Quiet does not read or show personal Record material. The hidden Record is excluded from
accessibility and does not display a Return as though the person had read it.

Appearance follows the app's existing light/dark and contrast preferences. Quiet uses the app's
Archivo families, a Georgia serif capture invitation, scalable text, scrolling, safe-area
padding and minimum touch areas. No setup, Focus, Shortcut, widget, contacts access or app
allow-list is required. Calls, maps, Screen Time, profiles and onboarding are outside this slice.

## Optional Home Screen widget

`QuietCaptureWidget` is a second native widget in the existing `ExpoWidgetsTarget` bundle.
The large widget shows Chinotto and the date above **Open Quiet →**. Tap the title or the
space around it to enter Quiet through `chinotto://quiet`. The two bottom controls open
ordinary capture directly. **What arrived?** uses `chinotto://capture` and the microphone
uses `chinotto://capture?mode=voice`. The widget shares the existing light and dark palette
and has no Record storage access. The date timeline supplies seven future local midnights so it can
advance without a running app. The widget is optional for the in-app Quiet scenario.

## Verification

Verified on 25 November 2026 with Xcode 27.2 and an iPhone 17 Pro simulator on iOS 27.2:
the app and Widget Extension built in Release; typecheck passed; Jest passed 918 tests
(one existing skip). Seven UI tests passed across the walking scenario, retained cancelled
draft, light appearance, widget gallery/placement, maximum accessibility text size and both
cold widget links. An independent read-only SQLite check found one fragment for the synthetic
walking thought, also visible in the ordinary Record. MessageUI's real unavailable branch
was exercised. The cold voice entrance was checked with microphone permission denied;
recording audio, the available composer and real messaging remain physical-device checks.
No real contact was selected and no SMS or iMessage was sent.

After adding Open Quiet, all three widget routes passed cold-launch UI tests on the same
simulator. A tap in the clear space to the right of the title reached the Quiet screen
with Message and What arrived? available and the keyboard hidden, in both light and dark
appearance. The bottom controls reached the focused Record input and the microphone
permission recovery screen respectively.

Run `pnpm typecheck` and `pnpm test --runInBand`. Jest covers message-result handling, a real
SQLite capture, cancellation, failed save/retry, duplicate submission, protected capture,
ordinary entry and existing capture links. The native widget contract is checked alongside
the existing widget tests. The voice entrance includes a regression for acknowledging its
request before a parent clears the flag and cancels its startup timer.

For UI verification, install a simulator Release build, then generate an independent runner:

```sh
ruby scripts/ios/create-quiet-tests.rb /tmp/chinotto-quiet-ui
xcodebuild -project /tmp/chinotto-quiet-ui/QuietScenarioTests.xcodeproj \
  -scheme QuietScenarioTests -destination 'platform=iOS Simulator,id=SIMULATOR_ID' \
  -only-testing:QuietScenarioTests/QuietScenarioTests/test01Walk test
```

The runner never enters a recipient or taps Send. On a simulator without MessageUI support it
checks the real native unavailability branch, then captures one synthetic thought, returns to
Quiet and opens that thought in the Record. Read the simulator's `Documents/SQLite/chinotto.db`
in read-only mode to verify exactly one fragment. Use a dedicated simulator with no personal data.
The other UI tests cover cancellation, light appearance, the widget gallery and enlarged text.

On a physical iPhone, verify recipient selection without an app contacts permission, editing
“Я у воды, скоро буду”, and cancellation returning to Quiet. An owner-approved manual Send
should return the composer result and Quiet, then allow one local thought to be saved. Check
delivery separately in Messages or with the recipient; Chinotto cannot confirm it. Also test
messaging unavailable, failed sending when reproducible, background/foreground while composing,
and the protected Record across a relock. No automated test sends SMS or iMessage.
