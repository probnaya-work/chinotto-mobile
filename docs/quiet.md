# Quiet Home Screen for iPhone

The optional Focus page belongs to iOS. Messages, Phone and Maps open from their own icons.
Chinotto supplies a private Medium or Large widget with text and voice capture. Its optional
**Quiet guide** is at the top right of the Record, including locked capture.

## Set up the suggested Personal Focus page

1. Open **Settings → Focus → Personal**. Under **Customize Screens**, choose the Home Screen, select a suggestion under **Create a New Page** and tap **Add**.
2. Turn Personal on from **Control Center → Focus**. Hold the background of the suggested page, then tap **Edit → Add Widget**. Search for Chinotto and select **Chinotto Quiet** in Medium. Add it and tap **Done**. Use the standard apps already on the page or in the Dock.
3. During use, swipe Home from Messages or Chinotto to return to this page. Toggle Personal in Control Center to restore your usual pages or bring the suggested page back.

## Suggested pages on a physical iPhone

On 25 November 2026, an iPhone 15 running iOS 27.0.1 offered three suggested
Home Screen pages under Settings → Focus → Personal → Choose Home Screen →
Create a New Page. Existing pages appeared in a separate section below.
Opening the first suggestion showed a New Page preview with Edit Apps and
Add. The inspection ended with Back and Cancel. Work was marked Set Up.
In a subsequent owner walkthrough on the same iPhone, the Home Screen showed
the large Chinotto Quiet widget and the standard Messages icon. The owner
confirmed that swiping Home from Messages returned to that page and turning
off Personal Focus restored the usual layout with icons in their original
positions. Setup time and a second activation were not measured.

## Alternative using a manually arranged page and custom Focus

1. Hold the Home Screen background. In edit mode, swipe left past the last page to the
   blank page. Tap **Edit → Add Widget → Chinotto**. Slide across the preview dots until the
   title reads **Chinotto Quiet**, then tap **Add Widget → Done**.
2. Count icons already on that page and in the Dock. For a missing app, swipe left from
   the new page to App Library, open the category containing its icon, hold the icon past
   the context menu and drag it onto the widget page. Tap **Done**. Keep the Dock as it is.
3. In iPhone **Settings → Focus → + → Custom**, name the Focus **Quiet**. Under
   **Customize Screens**, choose the **Home Screen** and select only the widget page.
4. Open Control Center by swiping down from the upper-right corner. Tap **Focus → Quiet**
   and dismiss Control Center. Open Apple’s Messages from the page or Dock. Swiping Home
   should bring back the widget page. **What arrived?** opens the Record editor.
5. Turn Quiet off in Control Center. If the extra page still appears among your usual
   pages, edit the Home Screen while Quiet is off, tap the page dots, uncheck only that
   page and tap **Done**. Turn Quiet on again and check the page reappears.

The iPhone system steps follow Apple’s guides to [Focus](https://support.apple.com/guide/iphone/iphd6288a67f/ios)
and [Home Screen pages](https://support.apple.com/guide/iphone/iphd2fc8ce30/ios).
The physical-device observation above covers Personal Focus. The timings below describe the simulator walkthrough.

## Widget and existing in-app capture

Both sizes display the local date and contain no Record data. In Medium, the
two-line **What arrived?** opens `chinotto://capture` and the sage disc opens
`chinotto://capture?mode=voice`. In Large, the question and microphone open the
same two destinations. Its header opens build 50’s in-app capture at
`chinotto://quiet`, also accessible in the guide.
These app links operate independently of system Focus.

On the iPhone 17 Pro simulator (iOS 27.2), the gallery offered Medium. With the
app terminated, tapping the question focused the editor. Tapping the disc with
microphone access denied opened voice capture and offered Settings. A separate
walkthrough returned to the Medium page from an unsent Messages draft and again
after saving in Record. A read-only SQLite query found one row for the new
thought. On the owner's iPhone 15, the owner tapped the Medium widget’s green
disc and observed Chinotto open and recording start immediately. The owner
then played the recording and heard the test phrase. The number of voice
entries in Record was not reported.

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

**Back to Record** returns to the existing Record. A widget capture link, reminder or
incoming share uses its existing destination instead of inheriting Quiet's save destination.
Quiet does not read or show personal Record material. The hidden Record is excluded from
accessibility and does not display a Return as though the person had read it.

Appearance follows the app's existing light/dark and contrast preferences. Quiet uses the app's
Archivo families, a Georgia serif capture invitation, scalable text, scrolling, safe-area
padding and minimum touch areas.

## Walkthrough and friction measurements, 25 November 2026

Build 50 came from `fd09f16`. The walkthrough used an iPhone 17 Pro simulator,
iOS 27.2 (24B8117), Xcode 27.2. It started with Chinotto installed and opened once,
two ordinary pages, a regular Maps icon on page one, Messages and Safari in the Dock,
and no Quiet page. The simulator image omits the Phone app. No personal account was
signed in. The setup used normal system gestures.

| Task | Observed result |
| --- | --- |
| Create the page on the clean configuration | 75 seconds, 17 actions, from holding the background on page one through Done with Maps and the widget visible. Includes inspection time, a failed Maps drag and the retry. |
| Repeat page creation after restoring the two-page layout | 19.8 seconds, 12 actions. One continuous slide across the gallery dots replaced three swipes. Maps was visible in App Library after the earlier run, saving the category tap. |
| Hide the page from ordinary browsing | Six actions on the first attempt: hold background, tap page dots, uncheck the widget page, Done twice, acknowledge the system alert. About 14 seconds including inspection. The two ordinary pages led directly to App Library. The original Maps icon and Dock were preserved. |
| Configure Focus and perform a second activation | Requires measurement on an iPhone. Settings search and the Control Center control gallery both returned “No Results for Focus” in this simulator. |

The 12 replay actions were a hold, two page swipes, Edit, Add Widget, Chinotto, a slide
across the dots, Add Widget, Done, a swipe to App Library, a hold-and-drag of Maps, and
Done. Duration is wall time including system animation and automation waits. The timer
excludes app installation, reading the guide and Focus configuration. This is an operator
walkthrough. A first-time participant has yet to attempt the task.

**Where the operator got stuck.** Edit mode reveals the empty page. Several widget previews
share the Chinotto name, so the guide gives the exact preview title. Dragging Maps from
Spotlight displaced an existing icon during exploration. App Library preserved the original
icon, and holding through the contextual menu let the operator place the additional icon.
Messages opened from the existing Dock. When a page was first hidden, iOS displayed a
notice that newly downloaded apps would appear in App Library.

**What the recording proves.** With Chinotto closed, the operator navigated to the page,
opened Apple’s Messages from the Dock, typed in an empty simulator sample conversation,
and swiped up from the bottom edge. The same widget and Maps icon were visible.
What arrived? opened the focused Record input. One Save and another swipe Home returned
to that page. A read-only SQLite query found one fragment for the recorded thought
`A heron by the water FEAE`. The microphone link was tested separately with permission
denied and opened the existing recovery action. The recording contains manual page
navigation. System Focus activation, deactivation and second activation require an iPhone.
Whether Focus automatically hides a previously visible page when turned off is still open.

## Physical iPhone acceptance

For a first-time participant, give only this prompt:

> Set up a quiet Home Screen for a walk, then bring your usual Home Screen back.

Let the participant find the guide. Record elapsed setup time, actions, first hesitation
and any help requested. Time the next activation separately. An owner checking the
mechanism can also use build 50’s large widget and its bottom capture controls.

1. Note which pages are visible before setup. Leave the new page checked for the first
   on/off cycle. Choose it as the sole Home Screen in the Quiet Focus.
2. Start a continuous screen recording on the ordinary Home Screen with Chinotto closed.
   Activate Quiet in Control Center. Open Messages, compose an unsent sample draft and
   swipe Home. Confirm the widget, native app icons and Dock. Use a test phone with an
   empty Messages inbox, or keep any recording containing private threads on the device.
3. Use What arrived?, save one distinctive thought, swipe Home, then turn Quiet off.
   Compare both the set of pages and their contents with the starting layout.
4. Only if the extra page remains visible, uncheck it in the page picker with Focus off.
   Repeat the on/off cycle. Report whether the hidden page is shown by Focus.
5. On the next activation, count from the ordinary Home Screen until the Quiet page is
   visible, including dismissal of Control Center. Keep Chinotto closed throughout.
   Confirm Phone, Messages and Maps are reachable. Verify the thought appears once in Record.

The XCUITest runner lives in `scripts/ios/QuietScenarioTests.swift`.
Generate it with `ruby scripts/ios/create-quiet-tests.rb /tmp/chinotto-quiet-ui`.
Tests 06–08 cover cold widget entry. Test 09 uses a clean simulator with the prepared
page and Apple’s sample Messages data. It checks actual bottom-edge gestures and keeps
screenshots of both returns. Run `pnpm typecheck` and `pnpm test --runInBand` for the
app tests.

## Hide selected apps on the current Home Screen (prototype)

**Layout change observed on iPhone 15.** Turning Quiet off moved both selected
icons from the first Home Screen page to the second. Restoring their original
positions requires manual rearrangement.

Open **Quiet guide → Previous app-hiding experiment → Hide apps with Quiet** and grant individual Screen Time access.
Choose individual apps inside the system picker, then tap **Save**. The selection
stays on this device. Keep Chinotto and Messages available for the first test.
Turn Quiet on or off in the sheet. On iOS 18 or later, add **Chinotto Quiet**
once from the Control Center gallery. This path uses your existing pages and Dock.

Chinotto writes the selected applications to `application.blockedApplications`
in its own named Managed Settings store. Turning Quiet off clears that store.
iOS owns icon placement and decides when restrictions take effect. If Chinotto
is inaccessible, its Screen Time permission can be revoked in iPhone Settings.

**Device check.** Note the exact positions of two dispensable apps, one in a
folder and one in the Dock. Turn Quiet on, open Messages and swipe Home. Check
whether both icons disappeared. Turn Quiet off and compare both positions,
including the folder page. Repeat from Control Center with Chinotto closed.

**25 November 2026.** On the signed iOS 27.2 iPhone 17 Pro simulator build, the
system showed its consent prompt, passcode flow, approval and app picker. The
Control Center gallery offered the control and the installed control rendered
its Off state. Searches in the picker for Files, Safari and two locally installed
sample apps returned no selectable rows. In a separate simulator-only diagnostic
using known sample bundle IDs, one sample icon remained visible after requesting
restrictions. That diagnostic bypassed the picker. It does not establish how
restrictions from the picker affect a physical device. A development-signed
build with Family Controls on both targets was installed over build 50 and
launched on an iPhone 15. The owner selected two apps they had grouped on the
first Home Screen page. Both icons disappeared when Quiet was turned on. When
Quiet was turned off, both reappeared on the second page. This failed the
requirement to restore the usual layout. The owner did not separately report
the swipe Home from Messages or the positions within a folder or the Dock.
