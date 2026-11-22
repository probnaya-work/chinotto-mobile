# Decisions the mobile design did not specify

**Opened with `feat/chinotto-next-mobile` (20 sep 2026).** The working mobile prototype is the
UI and interaction source of truth; the desktop Record implementation is the source of truth
for durable semantics. This file collects every value that is an **implementation or
product-policy decision made during the build** rather than something either source stated, so
they can be reviewed as decisions instead of quietly inherited as if they were designed.

`docs/handoff-diff.md` has the full comparison.

Status key — **decided**: the product owner ruled on it · **provisional**: explicitly
temporary · **inherited**: taken from desktop's resolved policy · **inferred**: read from what
the prototype draws, never stated as a rule · **invented**: no basis in either source, chosen
because the code needed a value · **pending**: named here because it is unresolved, not
because it is settled.

Where an entry reuses a desktop decision, its desktop number is given. Reusing by default is
the rule; a mobile divergence must appear here with its reason.

---

## 1. Launch, and what mobile does with its own golden rule

| # | Decision | Value | Where | Status |
|---|---|---|---|---|
| 1.1 | Launch identity plays on cold start only, never on warm resume | — | `record/ui/Launch.tsx` | **decided** |
| 1.2 | The lockup never gates capture: the field is mounted and typeable underneath, and the lockup dismisses as soon as the Record is ready | — | same | **decided** |
| 1.3 | Hold, when the Record is not ready yet | `1.9s` from the prototype's own prop, minus time already spent loading | same | inferred |
| 1.4 | Reduced motion | static hold of `0.5s`, no choreography | same | from the prototype |

1.1/1.2 are the resolution of handoff-diff §1.1. The prototype and `AGENTS.md`'s golden rule
genuinely contradict each other on every-open friction, and this is the reading that keeps
both: the identity moment is real, and typing is never waiting on it.

## 2. Rendering an unbounded record on a phone

| # | Decision | Value | Where | Status |
|---|---|---|---|---|
| 2.1 | The record is unbounded, as drawn; only the mounted window is bounded | — | `record/ui/` | inherited (desktop 0.1) |
| 2.2 | Bands are flattened to rows before virtualization, so band labels are list items | — | same | invented |
| 2.3 | How much of the record is held in memory at once | `50_000` fragments | `record/store.ts` | inherited (desktop 0.2) |

2.2 is mobile's substitute for desktop's `Windowed.tsx`. Nested band containers cannot be
virtualized by an inverted list without measuring every band, so the band structure is
computed and then flattened. The surface is identical; the tree is not.

## 3. Time, tiers and type

| # | Decision | Value | Where | Status |
|---|---|---|---|---|
| 3.1 | Tier windows | D0 `<8h` · D1 `≥ todayStart−1d` · D2 `<7d` · D3 `<60d` · D4 `<180d` · years `≥180d` | `record/model/bands.ts` | from the prototype |
| 3.2 | Anchored tier windows | `dm 0 / 1 / ≤3 / ≤8 / ≤14 / years` | same | from the prototype |
| 3.3 | D3 and D4 share one appearance on mobile | 12px, `wdth 76`, `#8f8e89` | `record/ui/tiers.ts` | from the prototype |
| 3.4 | A bare year stands you in the last month that holds anything | — | `record/model/anchors.ts` | inherited (desktop 0.9) |

3.3 is a real divergence from desktop, which draws five distinct steps. The mobile prototype's
`STY` gives D3 and D4 identical values. Following the mobile prototype, per the source order.

## 4. Voice

| # | Decision | Value | Where | Status |
|---|---|---|---|---|
| 4.1 | Audio is canonical; the transcript is derived | — | `record/voice.ts` | inherited (desktop schema) |
| 4.2 | Audio is written before transcription is attempted | — | same | **decided** (product instruction) |
| 4.3 | Container and codec | `.m4a`, AAC, at the input's own sample rate and channel count | `ios/Chinotto/VoiceCaptureModule.swift` | **divergence from desktop — see below** |
| 4.4 | Audio paths are stored relative to the document directory | — | `record/files.ts` | invented |
| 4.5 | A second tap under `0.8s` drops the recording silently, file and all | `0.8s` | `record/voice.ts` | revised after use: tap-to-toggle replaces hold-to-speak |
| 4.6 | ~~Retained audio is deleted only when a removal is finally published~~ — **now does what it says.** At the publish that ends the undo window, a voice moment's recording, transcript, every wording, voice metadata, search entry, Traces and Returns that quote it are erased; the fragment row (id, `captured_at`, method, `removed_at`) and the sync outbox rows stay. See 4.17 | — | `record/erasure.ts`, `record/bridge.ts` | **product rule** (2026-09-24) |
| 4.7 | No automatic retention cap; measured audio use appears in Settings and low free space is warned before recording | 64 MiB warning threshold, not a recording limit | `record/storage.ts`, `record/voice.ts` | **decided** for storage awareness; retention remains user-controlled |
| 4.8 | A recording that could not be written still yields a moment from the transcript, explicitly marked `audio_missing` | — | `record/voice.ts` | revised for truthful persistence status |
| 4.9 | A write failure mid-recording keeps what already reached disk and stops | — | `VoiceCaptureModule.swift` | invented |
| 4.10 | Audio missing at settle time is recorded as `audio_missing` immediately | — | `record/voice.ts` | invented |
| 4.11 | The machine transcript fills the body only while `correction_count == 0` | — | `record/store.ts` | **product rule** |
| 4.12 | Microphone state is only ever learned by trying — never probed, never assumed | — | `RecordRoot.tsx` | inherited (desktop 12.6) |
| 4.13 | A recording with no words says which — `listening back…` / `couldn't transcribe · the audio is safe` | — | `record/ui/MomentRow.tsx` | inherited (desktop, `FragmentRow`) |
| 4.14 | Speech is recognised on this iPhone or not at all | a task only when `supportsOnDeviceRecognition`, always with `requiresOnDeviceRecognition`; otherwise no task and no request | `VoiceCaptureModule.swift` `onDeviceTask` | **product rule** (2026-09-24) |
| 4.15 | Microphone and speech recognition are independent | the microphone decides whether there is a recording; speech only whether it has words | `VoiceCaptureModule.swift` | **product rule** (2026-09-24) |
| 4.16 | Recordings without words are read back later, locally, once each | availability checked first; 5 min backoff doubling to 24 h; `model` marks a reading done | `record/transcripts.ts` | **product rule** (2026-09-24); numbers invented |
| 4.17 | Where a removal becomes permanent | `removed_at` set and no `pending_removals` row | `record/erasure.ts` | derived from 5.1–5.4 |
| 4.18 | `ios-on-device` only when the native side said so; older labels become `ios-speech` | — | `record/voice.ts`, `record/transcripts.ts` | correctness fix |

**4.3 is a deliberate divergence from desktop's 12.1, flagged rather than taken quietly.**

Desktop keeps the input's own format in a `.caf`, reasoning that "resampling on the way in
would mean the thing we kept is already a derivation". That reasoning is right, and it is
about the durable model rather than about macOS — which is exactly why this is recorded
here instead of being decided silently.

Mobile re-encodes anyway, because of an arithmetic that desktop does not face. Uncompressed
float32 at the iPhone's 48 kHz input is roughly 190 KB per second: eleven megabytes a
minute, and 630 MB for the 55-minute recording the voice tests already exercise. A Mac can
absorb that. A phone with no retention policy (4.7) cannot, and the failure mode is the
worst one available — a full device, which costs capture itself.

So mobile treats AAC as the canonical source, and the honest statement of the cost is that
mobile's canonical audio *is* already a lossy derivation where desktop's is not. Both
devices can still hear the moment back; only mobile's copy has been through a codec.

**This is the one shared-semantic question on this branch where the two repositories do not
agree, and it should be settled deliberately rather than by whoever writes the next commit.**
The alternatives, if the divergence is unacceptable: keep the input format on mobile too and
pair it with a retention policy, which makes 4.7 blocking rather than pending; or adopt a
compressed canonical form on both sides.

4.9 is the one that reads like an implementation detail and is not: a volume that fills
mid-sentence should cost the rest of the sentence, not the whole recording. The file is
closed where it stopped, the failure is reported, and what was already captured is kept.

4.11 is how "the transcript is derived" survives contact with re-transcription. Once somebody
has worded a moment themselves, the machine's opinion is history — it stays in
`voice_transcripts` and it never reaches the body again.

4.4 is not a detail. iOS rewrites the app container's absolute path on reinstall and on some
restores, so an absolute URI recorded today can be wrong tomorrow while the file is intact.

**4.14–4.18, the on-device rule.** Apple's recogniser sends audio to Apple's servers unless the
request *requires* on-device recognition **and** the recogniser *supports* it; the flag alone is
ignored where support is missing. Builds up to 2.0.0 set the flag only when support was there and
went ahead regardless, which for a language without local support is a server path. From 2.0.1
every task goes through `onDeviceTask`, a buffer request is kept only once that has given it a
task, and `__tests__/voiceOnDeviceOnly.test.ts` reads the Swift to keep it so.

Without a local recogniser — the language is unsupported, the recogniser is momentarily
unavailable, or speech recognition is refused — the recording is made anyway and settles as
`failed` with no `model`. That absence is what `record/transcripts.ts` looks for: on launch
(after four seconds) and on every return to the foreground it asks, without prompting, whether
local recognition is available, and if it is, reads each waiting recording from its own file
through the same gate. A reading that ran records `ios-on-device` whether or not it found
words, which is what makes it once. A reading that could not run leaves the row as it was.
Recordings that older builds failed to transcribe get the same single reading.

Transcripts older builds labelled `ios-on-device` are relabelled `ios-speech` once, from
`migrate`, because those builds could not know where recognition ran. It is a data fix keyed in
`record_meta`, not a schema step, so a 2.0.0 build can still open the database.

**4.17, where "for good" is.** `bring back` is possible exactly while the `pending_removals` row
exists; publishing deletes it; nothing restores a fragment after that (remote tombstones never
reach the Record — `applyRemoteTombstone` has no caller — and the bridge will not re-project an
id it holds as removed). Publishing and `bring back` both begin by deleting that row, so a
last-instant `bring back` either wins outright or finds nothing, and the erasure happens in the
same transaction as the publish. The file is deleted after the commit; a sweep at launch finishes
anything a kill interrupted and anything 2.0.0 published without erasing, and touches a file
only when a removed-for-good voice fragment with that exact id proves it.

4.7 is the honest gap: a phone can fill up, and nothing here yet tells anyone that. It is not
invented into a policy because any number (a size cap, an age cap, a "keep the last N") is a
product decision about someone's own recordings, and deleting a canonical source to save space
is exactly the kind of thing that must be asked rather than assumed.

## 5. Removal and undo

| # | Decision | Value | Where | Status |
|---|---|---|---|---|
| 5.1 | Undo window | `8s` | `record/store.ts` | from the prototype |
| 5.2 | Removal is soft locally and the publish is deferred for the whole window | — | `record/store.ts`, `record/bridge.ts` | **decided** (data integrity) |
| 5.3 | A removal whose window elapsed while the app was closed publishes on next boot | — | `record/RecordApp.tsx` | invented |
| 5.4 | A remote tombstone soft-removes here rather than destroying | — | `record/bridge.ts` | inherited (desktop 5c.3) |

5.3 is the case the prototype cannot show, because a prototype is never killed mid-timer.

## 6. The legacy bridge

| # | Decision | Value | Where | Status |
|---|---|---|---|---|
| 6.1 | The fragment id is the legacy entry id, both ways | — | `record/bridge.ts` | inherited |
| 6.2 | A Continue mirrors as its own legacy entry, never appended | — | same | inherited (desktop 5c.2), **product rule** |
| 6.3 | An incoming text change on a known id is a conflict, not a revision | — | same | inherited (desktop 0.20) |
| 6.4 | Until asked, the record shows the local wording | — | same | inherited (desktop 0.21) |
| 6.5 | Fragments mirrored out carry `capture_origin` unchanged; the wire cannot express it | — | same | inherited (desktop 5c.1) |
| 6.6 | A typed URL becomes an encounter when the body contains exactly one | — | `record/urlKey.ts` | inherited (desktop 5c.6) |
| 6.7 | Carrying the earlier wording on the wire is **not** done unilaterally | — | — | **pending** |

6.7 is the one place where both repositories are blocked on the same additive change. Desktop
records it as their 0.20; mobile records it here. Until the contract carries wording history,
a conflict is a two-way question rather than a three-way comparison, on both devices.

## 7. Migration

| # | Decision | Value | Where | Status |
|---|---|---|---|---|
| 7.1 | `capture_method` for v1 material | `imported`, never guessed as `typed` | `record/migrate.ts` | inherited (desktop 10.1) |
| 7.2 | v1 edit counts do not become corrections | `legacy_edit_count` | same | inherited (desktop 10.2) |
| 7.3 | v1 tables are read, never dropped | — | same | inherited (desktop 10.4) |
| 7.4 | Blankness is tested against spaces, tabs, newlines, CR, VT and FF | `NOT_BLANK()` | same | invented |
| 7.5 | Recall themes are archived verbatim before the concept is retired | `archived_material` + a readable file | `record/themeArchive.ts` | **decided** (data integrity) |
| 7.6 | The archive never blocks boot, and is retried until the readable copy lands | — | `storage/db.ts` | invented |
| 7.7 | A database from a newer build is refused rather than migrated down | — | `record/migrate.ts` | invented |

7.4 exists because SQLite's `TRIM()` strips spaces only. Without it, a v1 entry made of two
newlines becomes a blank fragment in the Record. Caught by the hostile fixture, not by review.

7.5 has two copies on purpose: the database row cannot fail, the file is readable by anything.
If only one could exist it would be the database row, because the product is what guarantees
it. The v1 theme tables are **not** dropped by any of this.

## 8a. Decisions the build added after the plan

| # | Decision | Value | Where | Status |
|---|---|---|---|---|
| 8a.1 | Archivo's `wdth` axis is resolved into static instances ahead of time | 14 faces, 205 KB | `scripts/generate-archivo-instances.py` | invented |
| 8a.2 | The instances are committed, not generated at build time | — | same | invented |
| 8a.3 | A share's long leftover is a selection; a short one is a title | 40 characters | `record/share.ts` | invented |
| 8a.4 | The app icon is two variants, and a retired colour resolves to `dark` | — | `src/services/icons/iconVariants.ts` | **decided** |
| 8a.5 | Connectivity with no reachability check reports "unknown", never "offline" | — | `RecordRoot.tsx` | invented |
| 8a.6 | The device list is empty until a real device collection is read | — | same | **product rule** |
| 8a.7 | A wording conflict's two sides are labelled by *where*, not *when* | — | `record/useSyncSurface.ts` | forced by the contract |

8a.1 is the largest mobile-only divergence in the build. React Native has no
`fontVariationSettings`, so the width axis that carries half of "this is further away"
cannot be varied at runtime. Resolving it ahead of time is the only way to keep the ladder;
8a.2 follows because a release build must not depend on a python toolchain.

8a.3 is a guess with a number in it, and it is the kind of guess worth revisiting with real
shares: a 40-character threshold separates "A Brief History" from a highlighted passage
today, and will occasionally be wrong in both directions.

8a.7 is the honest consequence of 6.7. Over `{id, text, created_at}` there is no way to know
which wording is later, so the sides say `this iphone` and `your other device` rather than
inventing an order.

## 8. Pending surfaces — named, not decided

| # | What | Why it is open |
|---|---|---|
| 8.1 | **Restorable backup of the Record** | User-initiated portable export now exists (`docs/export-format.md`). Import and restore remain a separate design decision. |
| 8.2 | Retained-audio limit | See 4.7. Usage and low-space warnings now exist. No size, age or count cap is imposed; recordings remain canonical material. |
| 8.3 | Reading time on a shared article (`14 min`) | Not derivable offline; unresolved content in the prototype. |
| 8.4 | Price, saving and trial copy | RevenueCat supplies them; the prototype states they are unresolved and the layout holds the longest plausible line. |
| 8.5 | Android parity for the new surface | `AGENTS.md` defers it and the prototype is an iPhone prototype. The Android sign-in path is untouched, not redesigned. |
| 8.6 | Wording history on the sync wire | See 6.7. Needs both repositories. |
| 8.7 | ~~The plan rows, `continue with apple`, `restore a purchase` and account deletion~~ — **joined.** The sheet now loads the real offering and shows only what the store said; `continue` runs `openSyncPurchaseFlow` with the existing product identifiers and the `Chinotto Pro` entitlement; `restore` runs `restorePurchases` and tells apart "nothing to restore" from "could not ask"; `continue with apple` runs `enableAppleSyncWithFirebase` followed by the same post-sign-in sequence the shipping app sends (queue, tombstones, themes, backfill, access mirror, in that order); `stop` mirrors `active: false` before signing out; and `delete for good` runs the v1 deletion including the reauthentication Firebase demands after the Firestore data is already gone. **Still unverified:** a real purchase, a real restore against a real Apple ID, and a real Sign in with Apple, none of which can be exercised on a simulator without a sandbox account — see the device checklist. |
| 8.8 | ~~The cloud device collection~~ — **built, with one stated limit.** Devices live at `users/{uid}/devices/{deviceId}`, beside `users/{uid}/entries`, so a desktop that knows nothing about them is unaffected. Identity is generated once and never regenerated; `last seen` is a server timestamp written only by the device itself, so a device that has never checked in is not listed rather than given an invented time; nothing reports an online state, because a heartbeat a minute apart cannot tell "here" from "was here fifty seconds ago". Removing writes `revokedAt` rather than deleting, because a deleted row is indistinguishable from one that never existed and the device would re-register. **What revocation is not:** the revoked device reads its own row and stops — through `isSyncAccessBlocked()`, so the queue, both outboxes and ingest all honour it — but Firestore's deployed rules still permit any signed-in client to write its own user's entries. It is enforcement by agreement. Making it a real boundary means a security-rules change that checks the caller's device row, which is a backend deployment this app cannot do to itself. |
| 8.9 | **Light appearance — the control is gone, not the idea** | There is one palette in `tokens.ts`, the prototype draws no light screen, and the choice did not survive a relaunch. So `system · light · dark` was a control that selected an appearance the app cannot render, and `system` in particular promised to follow a phone it could not follow. Settings now states the one appearance there is and offers nothing. When a light appearance is actually designed, this becomes a choice again — and the home-screen icon's light variant stays, because iOS renders that one for real. |
| 8.10 | **`lift contrast in bright light` — removed for the same reason** | The control was drawn and stated its state; there were no token deltas behind it, so turning it on changed nothing. Removed with the appearance control rather than left as a switch that does nothing. |
| 8.11 | ~~Nothing on this branch has been seen running on a device or simulator~~ — **superseded.** RevenueCat was upgraded to 10.10.0 (`fix(ios): upgrade RevenueCat for Xcode 27`), the build succeeds, and the branch has now been driven on an iPhone 17 simulator: cold launch, capture, multiline capture and its cap, keyboard open/close including interactive dismissal, Find, Focus, Continue, Correction with its revision, voice capture with its permission prompt, and a retained recording that could not be transcribed. It has since been installed and run on a physical iPhone 15 as a signed Release build, which is what produced 8.18, 8.19 and 8.20. Still unseen: the microphone — no simulator has one, so 8.12 is untouched — and everything in 8.16. |
| 8.12 | **Whether a recording that is silent should still become a moment** | On the simulator there is no audio input, and a four-second hold produced no fragment while a twenty-five-second one produced `couldn't transcribe · the audio is safe`. Those two outcomes cannot be told apart here: "the app discards silence" and "the simulator produced no samples" look identical without a real microphone. The retention rule itself is verified — audio survived a transcription failure — but the silent case needs a device. |
| 8.13 | ~~Retained audio cannot be played~~ — **done.** A sibling native module (`AudioPlaybackModule`) plays a moment back through `AVAudioPlayer`, behind an injected port so the rules are testable without a device: one thing at a time, the mark follows the sound rather than the tap, and a recording that has gone is written down as gone rather than appearing to play silence. Verified on the simulator against CoreAudio's own log — a 25.4-second file played for 25.44 seconds and the mark returned by itself. It is a separate module from the recorder on purpose: recording is the load-bearing path and nothing about hearing a recording again reaches into it. |
| 8.14 | **Nothing sweeps orphaned audio — and nothing should yet** *(narrowed 2026-09-24: `record/erasure.ts` now deletes a file whose fragment is provably removed for good — 4.17 — and still keeps, and reports, every file with no fragment at all, for exactly the reason below)* | Retained audio is deleted when a recording is too short to keep and when a removal is finally published; there is no pass for a file whose fragment never came to exist. That should not happen any more — it was a symptom of the voice controller being rebuilt mid-recording (see `fix(voice): stop replacing the recorder while it is recording`) — but the two files it left on the test simulator are the proof that it can, and nothing would find them. **Automatic deletion is deliberately not implemented.** A file with no fragment is not evidence that the audio is safe to delete: a capture can be between the native side persisting it and the database transaction that records it, and in that window the file is the only copy of what somebody said. An age-only heuristic cannot tell that window apart from an orphan, and deleting canonical material on a guess is the one failure this design is built to prevent. Whatever rule eventually does this needs a durable notion of capture state and ownership — something the record itself can be asked, that survives a force-kill — rather than a timer. Left open on purpose, for design rather than for a passing fix. |
| 8.15 | ~~Haptics~~ — **preserved, and deliberately not extended.** The shipping app fires exactly one impact, `ImpactFeedbackStyle.Light`, behind one stored preference, at the moment a thought is persisted — its own comment says "not on keypress or failed save". That is kept, at the four places a moment now lands: typed, spoken, continued, shared. Its five other call sites belonged to v1 surfaces that no longer exist (a search chrome toggle, a month rack, a sheet opening, a temporal boundary); they are **not** reassigned to whatever the new surface does in roughly the same place, because a haptic moved to a different event is a different haptic. v1 had no toggle for this and neither does this — the key, the default (on) and the behaviour are the same, so an upgrading install keeps whatever it already chose. |
| 8.16 | **Sign in with Apple, a completed purchase, and everything downstream of them** | Verified as far as a simulator without a sandbox Apple ID allows: the offering loads and shows real prices and a real trial (`$29.99` a year, `save 38%` computed from the real monthly, `1-week free trial` from the store's own introductory offer); `restore` reaches StoreKit and returns `no purchases found for this apple id`; `continue` reaches StoreKit and a cancel is treated as a decision, not a failure. **Not verified:** a purchase that completes, an entitlement becoming active, Sign in with Apple, and therefore everything behind it — sync actually turning on, the device list against a real Firestore, and revocation across two devices. The paywall gates sign-in, so with no entitlement the Apple step cannot be reached from the interface at all; this is the shipping app's behaviour, not a new one. All of it needs a sandbox Apple ID on a real device. |
| 8.17 | ~~Share and widget both need a real signature~~ — **wrong, and worth recording as wrong.** The reasoning was that `cfprefsd` gives each process its own store for an app group that no provisioning profile backs, so the extension's payload and the app's read never met on a simulator. Everything observed was consistent with that and it was still the wrong conclusion. On the same simulator the extension's payload is in the group's own preferences file, beside the widget's key, written by the extension and read by the app — the suite is shared, and was all along. What actually dropped the share is 8.18. **The widget is a separate question and is still open:** its key is written into the same suite the share now demonstrably crosses, so the mechanism is not in doubt, but no widget has been placed on a home screen and read on either a simulator or the device. The lesson is the one that keeps recurring here: a plausible platform explanation for a failure is not a diagnosis until the thing it claims is impossible has been looked for on disk. |
| 8.18 | ~~Nothing shared ever arrived~~ — **fixed.** `useIncomingShare` holds an empty list from the moment it mounts, which is what it has before anything has been shared. The intake treated that empty list as a share — an array is truthy — found nothing in it, and reported it handled. The handled flag is only released when the payloads go empty, and they were already empty, so nothing released it: from the first render of every launch, every share was gated away before it reached the surface. Two corrections, because they are two different mistakes. Nothing arrived is not something to handle, so the intake returns before it says so; and an empty list is not a share, so it is never passed as one. A third, from the same session: taking a share clears the store the extension writes into, but not the hook's own copy of it, so the hook sat holding the last share forever and neither the second share nor the same page shared twice looked like an arrival — it is asked to re-read the now-empty store instead. Verified on the simulator end to end: a link from Safari, the same link again, a selected passage as text, and `you met this site before` read from the record. |
| 8.19 | ~~A thought could be cut off mid-line at the bottom of the record~~ — **fixed.** The record reserved `frame.bottom` for the edge, a constant, and the edge is not one height: it grows with every notice stacked over the capture row and again with every line the field gains. It is opaque and in front, so anything taller than the constant simply covered the newest material — which is what the first device report showed, a moment cut through its second line with the undo notice sitting under the cut. The edge now reports its own height and the record stops there, never above the design's figure. |
| 8.20 | ~~Settings could not be found~~ — **fixed, and it needed a frame correction to fit.** Pulling down from the top edge is decision 10 of the handoff and is not revised; what was missing is that the strip drew nothing at all until it was already being pulled, so sync, the account and the devices were unreachable unless somebody told you the gesture existed. The mark now rests there as the handle and the words stay beside it until the pull has worked once. Drawing anything there exposed a second thing: `frame.top` was 64, which is above the bottom of the grab strip (54 + 34), so the record ran under both the new affordance and the standing bar. It is now the sum it was always described as. |

---

## 9. Where mobile deliberately differs from desktop

Recorded so neither repository drifts by accident.

| Mobile | Desktop | Why |
|---|---|---|
| D3 and D4 share one appearance | five distinct steps | the mobile prototype's own `STY` (3.3) |
| Inverted virtualized list of flattened rows | `Windowed.tsx` chunk mounting | no DOM; same surface, different mechanism (2.2) |
| Back gesture + drawn affordances | one global `esc` ladder | a phone has no `esc` (handoff-diff §1.3) |
| `capture_origin` adds `widget`, `share` | adds `tray` | each platform's own sources; the column is free text on both sides |
| Audio retained on the phone | audio retained on the Mac | same rule, and neither crosses the wire |
| User-initiated ZIP export; no restore | `export_record` + backup | mobile export includes history and original audio; restore remains open (8.1) |

---

## 10. Android

**Opened with `feat/android-foundation` (24 sep 2026).** Android was deferred by `AGENTS.md`
and the prototype is an iPhone prototype, so nothing in either source says what Android
should do. What follows is what this branch chose to make the record run there, local-first,
without redesigning anything — and what it deliberately left undecided.

| # | Decision | Value | Where | Status |
|---|---|---|---|---|
| 10.1 | What Android can and cannot offer is one table, asked by the surface | `capabilitiesFor(Platform.OS)`; iOS answers are exactly what the shipping app assumed | `record/platform.ts` | invented |
| 10.2 | An iOS-only feature is **hidden** on Android, not explained | no sync section, no widget row, no icon picker; the gaps live here, not in the UI | `record/ui/Settings.tsx` | **decided** |
| 10.3 | ~~The voice circle is not drawn on Android~~ — **superseded by 10.14.** The circle is drawn with the same tap-to-start / tap-to-stop contract as iOS | | `record/ui/Edge.tsx`, `RecordList.tsx` | superseded |
| 10.4 | Back puts away one layer at a time, top-most first, and never writes | sync · share · widget · settings page · settings · years · correction · continuation · focus · standing · selection · then the system | `record/back.ts` | invented |
| 10.5 | The record is framed clear of the system bars by only what exceeds the design's allowance | 54 at the top, 34 at the bottom; a 48dp button bar lifts it 14 | `record/ui/systemInsets.tsx` | invented |
| 10.6 | The keyboard inset adds back the navigation bar React Native leaves out, less the frame's lift | `ime − systemBars` is what RN reports on API 30+ | `useKeyboardInset.ts` | inferred from RN's `ReactRootView` |
| 10.7 | Android prebuilds with no native Firebase when `google-services.json` is absent | only Remote Config is native, and a failed fetch already means "no gate" | `app.config.js`, `plugins/withFirebaseAppIosOnly.js` | invented |
| 10.8 | Four template permissions are blocked, and Play billing with them | `SYSTEM_ALERT_WINDOW`, `WRITE_SETTINGS`, external storage read/write; `com.android.vending.BILLING`, which `react-native-purchases` declares although Android never configures it | `app.json`, `initRevenueCat.ts` | invented |
| 10.9 | The device is called `this phone` where the platform will not name it | `Constants.deviceName` first, as on iOS | `RecordRoot.tsx` | invented |
| 10.10 | No update surface on Android — no notice, no forced screen, no `up to date` — until a live Play Store listing exists | `updateGate: false`; settings shows the version alone | `record/platform.ts`, `RecordRoot.tsx` | **decided** |
| 10.11 | Android loads plain-TrueType copies of the Archivo faces; iOS keeps the files it shipped | `assets/fonts/android/`, chosen by `fontAssets.android.ts` | `record/ui/fontAssets*.ts`, the generator | forced |
| 10.12 | The Android app always runs in night mode | `AppCompatDelegate.MODE_NIGHT_YES` in `MainApplication.onCreate` | `plugins/withAndroidNightMode.js` | forced |
| 10.13 | Android draws no default keyboard-focus highlight | `android:defaultFocusHighlightEnabled=false` on the app theme (API 26+); after a hardware key the focused record list was a grey slab until the next touch | `plugins/withAndroidNoFocusHighlight.js` | forced |
| 10.14 | Android words come only from a recogniser the phone shows cannot reach the network | API 33+; `config_defaultOnDeviceSpeechRecognitionService` belongs to a visible system app that neither requests nor holds `INTERNET`; it lists no online languages; the language is installed. Otherwise the recording is kept, `unavailable` | `modules/chinotto-voice/…/OnDevicePolicy.kt`, `OnDeviceGate.kt` | **decided** (user, 24 sep 2026: "on-device only; save audio without words where Android cannot guarantee it") |
| 10.15 | No language pack is downloaded on the person's behalf | an installed language, or an installed variant of the same language (`en-GB` phone, `en-US` pack) | `OnDevicePolicy.chooseLanguage` | invented |
| 10.16 | Android records 16 kHz mono AAC in the same `.m4a` container the Record already stores | `AudioRecord` `VOICE_RECOGNITION` → `MediaCodec` → `MediaMuxer`; the same PCM goes to the recogniser through a pipe | `AacFileWriter.kt`, `PcmFeed.kt` | invented |
| 10.17 | A read-back is thrown away if anything records while it runs | a recogniser that ignored our audio and opened the microphone would be transcribing the room | `VoiceCaptureModule.FileJob.watchMicrophone` | invented |
| 10.18 | Android's copy names Android and describes only Android | mic notices and the settings line say `android`; privacy says the words and recordings stay on the phone and exactly when speech becomes words; *why chinotto* is the chinotto.app manifesto less the widget, sync and desktop | `record/platform.ts` | invented — the iPhone keeps its submitted copy |

10.2 keeps the surface minimal: an Android settings page that lists what Android lacks would be
an internal compatibility checklist shown to the person. The gaps are recorded below instead.
Nothing core is removed by it — capture, the record, Find, standing, Focus, correction,
continuation, holding, removal and undo are all unchanged.

10.11 is forced, not chosen. The generated `.ttf` files are WOFF2 inside — the generator saves
the instancer's output with the WOFF2 source's flavour. CoreText reads that; Android's
`Typeface` does not, and instead of failing it silently draws Roboto. On an API 36 emulator
the whole record was Roboto while `getLoadedFonts()` listed all seventeen faces. Converting
the shared files would have changed the submitted iOS bundle, so Android gets its own
copies — glyph-for-glyph the same outlines, verified — and Metro's `.android.ts` resolution
keeps them out of the iOS bundle entirely.

10.12: `userInterfaceStyle: "dark"` needs `expo-system-ui` to reach Android, and that module
would also add a native iOS dependency. Without it, React Native's edge-to-edge setup takes the
navigation bar's appearance from the phone: on a light-mode phone, a light strip with grey
buttons under the ink field, seen with three-button navigation on the emulator. Night mode is
set for the Android application alone; the gesture handle and the status bar follow it.

10.10: every update surface names a store and offers to open it. There is no Play listing, and
an `update` that goes nowhere — or a URL invented to fill the gap — is worse than silence. Turn
it on only once the listing is public and its URL is in Remote Config's `androidStoreUrl`.

10.5 leaves the whole geometry the prototype's. Re-deriving every surface's padding for
Android would have been a second design; framing the whole record by the excess keeps one.

### What is not on Android yet

| | Why | What it would take |
|---|---|---|
| Words on every Android phone | recognition runs only where 10.14 passes: never below Android 13, never where the on-device service could reach the network, never without an installed language. Everywhere else a recording is kept without words | nothing from Chinotto — it follows the phone |
| Home widget | `expo-widgets` is iOS-only | A Glance or `AppWidgetProvider` widget and a bridge equivalent to `WidgetThoughtsBridge` |
| Alternate app icon | `AppIconModule` is Swift | Activity aliases — or nothing, since Android themes the monochrome layer itself |
| Update notice and forced update | no live Play Store listing | the listing, then `updateGate: true` (10.10) |
| Sync | not missing code — see below | the decisions below |

### Sync on Android — pending, and not this branch's to decide

The sync engine is platform-neutral (Firebase JS SDK, the SQLite outbox, the bridge), and on
Android it stays exactly as inert as on an iPhone that never signed in: capture queues, nothing
sends. What cannot be built without a ruling:

1. **Identity.** Android has no Sign in with Apple. The branch `feat/google-auth-account-linking`
   (5401ce2) has Google sign-in and Apple↔Google linking against the v1 UI; its credential and
   linking functions are portable, but wiring them decides how an existing Apple user's data
   reaches Android — sign in with Apple on Android via the web, link Google to the existing
   `uid`, or keep separate accounts. Existing Apple `uid`s must not change whichever is chosen.
2. **The Mac.** Desktop signs in with Apple only. An Android user on Google reaches a Mac only
   if the Mac adds Google or the user links Apple on Android — a Mac change either way.
3. **Entitlement.** On iOS the sync sheet runs the paywall before sign-in. Whether Android
   sells Chinotto Pro through Google Play, whether a purchase in one store unlocks the other,
   and whether the paywall precedes sign-in on Android, are undecided.

### Voice on Android — evaluated (24 sep 2026), then built on the second row (10.14)

The requirement is that the recording never leaves the phone, works offline, and becomes an
ordinary entry. Every engine that could transcribe it trades against that or against the app:

| Engine | API | Can audio leave the phone? | Offline | Record while transcribing | Size | Can it be verified here? |
|---|---|---|---|---|---|---|
| `SpeechRecognizer` (default) | 8+ | **yes** — `EXTRA_PREFER_OFFLINE` "may have no effect" (SDK Javadoc) | not guaranteed | no — it opens the mic itself | 0 | rejected |
| `createOnDeviceSpeechRecognizer` | 31+ (feeding our own audio via `EXTRA_AUDIO_SOURCE`: 33+) | governed by the phone maker's on-device service, not by Chinotto; the SDK says "on-device" and nothing about the network | by contract; language packs download first (`triggerModelDownload`, 33+) | 33+ only, and only if the service supports `EXTRA_AUDIO_SOURCE` | 0 | no — the API 36 AOSP emulator has no `RecognitionService` at all; needs a physical Pixel/Samsung |
| whisper.cpp in-process (`whisper.rn`, MIT; weights MIT) | 24+ | no — runs in Chinotto's process; checkable by per-UID traffic | yes | no live partials; transcribes after release | tiny q5_1 32 MB · base q5_1 60 MB (multilingual) | yes |
| Vosk in-process (`react-native-vosk`, MIT; models Apache-2.0) | 21+ | no | yes | yes, streaming | 31–45 MB **per language**; small-ru WER 23–32 % | yes |
| A model Chinotto already has | — | — | — | — | desktop has only a text-embedding model (MiniLM), no speech | — |

No engine satisfied privacy, offline, size and device coverage together, so the first pass
built nothing. The ruling that followed was the iPhone's rule: on-device only, and a
recording without words where that cannot be guaranteed. The second row is what shipped,
with the guarantee Android's documentation does not give checked on the phone instead
(10.14): the network isolation the platform enforces for a package without `INTERNET` —
which is also how Google describes Private Compute Core, where Pixel's on-device recogniser
lives — rather than the service's name. The AOSP emulator has no recognition service, so
there it records and never transcribes; recognition itself needs a physical phone.

The two iOS facts recorded here were since fixed on `main` (on-device only; erasure at the
permanent boundary) and merged into this branch.

## 11. Product review follow-up — 15 November 2026

The owner requested phased product improvements and optional Face ID / Touch ID protection.
The sequence and acceptance criteria are recorded in [Product improvement phases](product-improvements.md).

Word matching deliberately extends the original prototype to Unicode letters and combining
marks. English suffix heuristics do not run over non-ASCII words; common Russian and
Portuguese function words are excluded from evidence. Phrase highlighting must not consume
intervening letters as punctuation. The original English corpus parity remains checked.

Mobile Find remains literal search. Its supplementary suggestions require shared-word
evidence and are named as such. The prototype's unrelated fallback and cosmetic meaning
toggle are removed; no candidate is a valid result. These are implementation choices under
the approved search-quality phase, not a claim of multilingual semantic search.


### Record continuity — phase 2

Under the approved second phase, authored history and continuation edges travel in an additive
`record` field beside the existing text contract. Content-addressed immutable wordings preserve
causal ancestry and concurrent alternatives without trusting device clocks. A durable generation
protects an edit made during upload. Existing account IDs, entitlement and revocation checks stay
in place. Old-client edits with unknown history remain independent wordings; no revision is invented.

Audio and derived/personal state are not included. Oversized metadata stays pending locally rather
than losing history. Live updates use `updatedAt` so edits to old moments remain visible. Multiple
children of one parent belong to the same Line. The wire format, bounds, compatibility and required
cloud release checks are recorded in [Record continuity sync](record-sync.md).


### Find and first-week Returns — phase 3, 15 November 2026

Visible Find borrows the existing capture field and preserves an unfinished capture verbatim.
Leaving search restores that capture; no new navigation screen, onboarding gate or stored query
is added. Continue and Correct keep distinct promises at their actions.

The approved first-week phase replaces the former 180-day mobile / 30-day desktop Return age
with seven full days on both. A cause must be in the previous 48 hours, with at least three
shared words, an exact source key or a recent Line addition. An old quiet Line alone is not a
cause. Timing is shared: 20 hours globally, 30 days for the same moment, at most one open Return.
Held and removed moments are excluded; an open Return is withdrawn if its evidence disappears.
Selection waits for an idle visible edge and does not run behind Find or an unfinished capture.
The limits, retrieval differences and validation are recorded in `docs/product-improvements.md`.


### Device protection — phase 4, 15 November 2026

The owner's explicit request adds optional system authentication. The preference belongs to a
device, stays off by default and is not synced. Authentication is required to change it in either
direction. There is no Chinotto PIN. Protected history is withheld while new capture remains
available; date phrases and slash-prefixed wording in locked capture are saved as new wording.
Find's borrowed capture draft and unfinished correction/continuation fields survive the lock.

Native lifecycle code covers snapshots and invalidates read sessions. iPhone uses SDK 55's
Expo LocalAuthentication; Mac adds the matching objc2 LocalAuthentication bindings because
Sign in with Apple is a separate capability. Mac's native command allowlist denies private reads
from every window, including the legacy API. Incoming write-only sync maintenance remains
available; outgoing reads retry after unlock. Widgets are capture-only for as long as iPhone
protection is enabled, including while the app's own Record is open. Exports are plain copies
and require an active read session. This does not add encryption to storage or sync.


### Restore from archive — phase 5, 15 November 2026

The approved phase starts with Chinotto's own archive. Merge-only restore is the chosen first
version: existing IDs/wordings win and removed IDs are not revived. Original dates are kept;
source paths and child row numbers are not identities. Missing predecessors wait without
placeholder moments. More than five active holds blocks the import rather than silently
releasing something. A preview must be reviewed again after relevant local changes.

The SQLite recovery copy and journal protect the existing Record and interrupted audio
installation. Recovery copies remain on-device for manual recovery and have no automatic
retention/deletion policy in this phase. System file picking uses ExpoDocumentPicker on mobile
and the existing Tauri dialog plugin on Mac. Mobile adds fflate for streaming DEFLATE/CRC;
Expo's filesystem provides byte streams but no ZIP decoder. Native uses the existing zip crate.
These concrete missing capabilities justify the two mobile dependencies. Broader text imports,
complete app-state restoration and completed-import undo remain follow-ups. The full contract,
resource bounds and release acceptance are in [portable archives](record-archive.md).


### Phase 6 — appearance and enlarged reading

The owner requested a deliberate light appearance rather than a default white desktop. Use
`#eeeae1` mineral with graphite ink, warm neutral evidence/rules and sage only for live state.
Keep the ordinary dark palette and geometry. Desktop CSS and iPhone's palette share the values
in `lightPalette.json`; normal functional light text has a 4.5:1 contrast floor. Decorative
faint ink is not a status, hint or history action. A light Return uses a quiet stone rail.

Mobile starts dark, persists dark/light plus lifted contrast on this device, and applies the
choice without waiting before capture. Native keyboard/status appearance follows. At font
scale >=1.3, old text loses its clamp and uses a minimum width axis of 88; button targets grow
and wrap. macOS relaxes old-text compression at 130–140%. Nothing caps system text scaling.
Native theme changes are serialized; only the main Mac window owns app-wide appearance, so
transparent capture does not acquire an opaque host. These are local changes pending real
phone daylight/large-text and signed Mac main-window/capture acceptance.


### iOS scene lifecycle — physical-device check, 15 November 2026

A signed Release built with SDK 27 stopped in UIKit's
`UIApplicationEvaluateRuntimeIssueForNoSceneLifecycleAdoption` on the attached iPhone,
before JavaScript or database migration. Adopt one programmatic UIWindowScene, without
adding navigation or multiple Records. Keep the scene manifest aligned in app.json and the
committed Info.plist. Scene callbacks forward to the existing Expo app delegate so Record
privacy and subscriber lifecycles keep their existing paths. Cold links become React Native
launch options; warm URL/universal links use the existing linking handlers.

This follows [Apple's scene migration guidance](https://developer.apple.com/documentation/technotes/tn3187-migrating-to-the-uikit-scene-based-life-cycle).
It changes native launch compatibility, not product scope or the release version.


### Opening a protected Record — 15 November 2026

The owner requested a Chinotto animation instead of the blank frame around Face ID. The
native privacy cover now shows the existing full mark at 72pt, with a slow opacity breath on
the current window's dark or warm-light field. Reduce Motion keeps it still. The matching
React indicator spans authentication and the first authenticated Record read; capture stays
available while that read settles. Locking resets read readiness so a reopened Record does
not report an empty history before loading it.

There is no minimum display time, repeated launch lockup or added authentication step. The
native cover still conceals the entire Record synchronously and leaves only after the
existing foreground/epoch render acknowledgement. No private preview or text is drawn into
it. Cancellation ends the indicator immediately and preserves the capture draft for retry.

## One-shot thought reminders

Phase 1 adds a local reminder to an open thought on iPhone. The reader shows
`remind me` or the stored time. The existing bottom-sheet geometry puts the
selected time first, with the date and device scope beside it. Presets are one
hour from opening, 09:00 tomorrow, and 09:00 in seven calendar days. Custom time
uses the native date and time picker. Postpone moves the selected time by one
local calendar day. Once scheduled, the intent stores the chosen instant.
Travel displays that instant in the current device time zone.

The first request follows the chosen date. Denial offers iPhone Settings and
preserves the choice through that visit in the current app session. The first
phase keeps permission and management contextual. An in-app fallback and the
global notification preferences remain a separate phase. The app makes no
promises about delivery while system alerts are off, in Focus or in a scheduled
summary. Foreground delivery leaves the active Record alone.

Schema v10 adds device-local scheduling metadata only. Notification identifiers
are opaque and revision-specific. The OS sees the app name, generic body and
trigger, with no thought text. The existing device protection gates following a
tap. Cold and warm entry preserve capture text. A tap during a correction,
continuation, share, or sync sheet waits for that overlay to close.

One future intent per thought is reconciled against pending OS requests. Replacing
an intent retires its old identifier; a failed cancellation prevents arming a
second alert. Failed scheduling retains the time with an unavailable status and
can be retried before it passes. Past times are never rescheduled. Removing a thought
retires its alert and its intent; bringing back the thought requires deliberately
setting another reminder. Reminders are excluded from sync and Record archives.

The iOS port uses Expo Notifications 55.0.13, the version paired with this Expo
55.0.8 checkout, solely for local alert
permission, scheduling, cancellation and response handling. Android excludes
the notifications module and its application helper from native autolinking. The SwiftUI date editor uses the already linked
Expo UI module. On Mac, run `pod install` from `ios/` with the workspace's
existing CocoaPods toolchain to regenerate `Podfile.lock` for ExpoNotifications and ExpoApplication,
then build a development binary. Verify actual foreground/background delivery,
tap from cold and warm starts, permissions disabled in Settings, Face ID
cancellation and retry, VoiceOver, and the compact date picker in both appearances.

### Notification preferences

Phase 2 adds one Notifications row to the existing iPhone settings. The status
read from iOS and Chinotto’s reminder-alert pause are separate. A pause removes
pending delivery and retains the selected times. Existing future times can be
edited while paused. Resuming arms only future alerts. A failed native update
retains the preference and offers a retry.

Discreet previews default to “Open Chinotto”. Turning them off permits a generic
reminder sentence. A thought-level override can always be stricter than the
device default. Future pending requests are reconciled after a preview edit.
Neither choice places a date, title or excerpt from the Record in the alert.

When iOS permission or Chinotto alerts are off, a new time can deliberately be
saved in Chinotto without any OS request. Such an intent becomes ready in the
Scheduled reminders list at its chosen time. It never converts itself into an
alert. Opening a ready thought marks that return used. Upcoming times can be
edited and canceled through the same thought sheet and return to the list.

Scheduled reminders are inside Notifications. Existing device protection
gates the list and its first-line excerpts. Schema v11 adds an in-app delivery
choice and a per-thought preview override. Both the choices and the global
notification preference remain on the device. Quiet hours follow the device’s
Focus settings. Automatic Return alerts are outside this phase.

### Compact Return on the Record

The in-app Return shows the old thought’s month and elapsed time, with one line
of wording and two targets to open or let go. The existing capture field has
priority. The Return waits when the keyboard is active, a moment is selected,
recording is in progress, the app is in the background, or an overlay covers
the edge. The existing evidence and cooldown rules still apply.

Opening shows the date, original wording and grounded cause in the existing
reader. The focus target stays visible when it falls inside a folded span.
The reader recomputes the cause from current material and withdraws it if the
evidence disappears. Continue and Hold are available in the reader. Dismissal
is stored on tap, and Reduce Motion skips the invitation’s transition. This
uses the existing Return tables, protection boundary and Continuation model.

### Possible connections in the mobile reader

Observed Traces stay in the reader. Vocabulary-based suggestions appear only
on request. The reader shows one candidate with two dated excerpts and marks
shared words within each excerpt. Both excerpts lead back to their sources.
Dismissing a pair uses the existing local judgement table and applies in either
direction. The same pair stays dismissed after a restart. Existing Lines are
kept. This interaction reads the Record on-device and uses lexical overlap.
The ranking considers word overlap first and elapsed time to break ties.

### Quiet reading

A contextual quiet reading action changes the presentation of the current
reader for this visit. The same dated Line remains readable, with more space
between rows. Traces, reminders, editing verbs and Hold are put away. The
existing Continue field remains available. An open ring uses the current
recording accent only during this mode.

Exit quiet reading and platform Back restore the ordinary reader and its
previous scroll position. Both keep any unfinished continuation. Device
protection conceals the reader during relock and restores the authorized
quiet session and draft after unlock. The mode state lives in memory and
does not change notification or operating-system Focus settings.

### Similarity in meaning

On iOS 17 and later the reader checks up to 48 excerpts of at most 240 UTF-16
units after the lexical path finds none. Candidates are sampled across the
loaded Record and must be eligible for a new connection. Apple's
`NLContextualEmbedding` compares excerpts confidently recognized as the same
language. The first experiment uses normalized token pooling, minimum cosine
0.82 with a 0.05 lead over the next match, and 0.90 for a single comparable
excerpt. These are starting values for native quality checks. Vectors are
temporary. Language model assets can be requested on first use. The reader
withdraws suggestions when either analyzed excerpt or its eligibility changes.

### Opt-in Return alerts

The setting is device-local and initially off. It applies to a new evidenced
Return surfaced after enabling it. One discreet local alert can arrive four
hours after that Return surfaced, while the evidence is still within the
existing cause window. The alerts use a seven-day spacing limit. A change to
the words, Hold, dismissal, opening or opting out retires the pending alert.
On a tap the reader waits for authorized access and checks the Return again.
The existing settings explain how to schedule iPhone Focus by app. Recurrence
and restrictions on other apps are outside this interaction.

### Thought actions menu

On iOS 26 and later, the reader groups the available reminder, quiet reading,
and connection actions in its upper-right ellipsis menu. The trigger uses the
reader's ink and has a 44-point target. SwiftUI draws the open menu with the
system material and appearance. At larger text sizes, the header puts the
back button and menu on their own row so the date or Line heading can wrap.
The reader keeps inline actions on older iOS versions and Android. The menu
moves out of the way during quiet reading, editing, and writing a continuation.
Choosing a connection takes the reader to the existing result below the
thought, and reminder status messages stay in the reader.
