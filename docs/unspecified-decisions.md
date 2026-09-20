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
| 4.5 | Releasing under `0.8s` drops the recording silently, file and all | `0.8s` | `record/voice.ts` | from the prototype |
| 4.6 | Retained audio is deleted only when a removal is finally published | — | `record/voice.ts` | invented |
| 4.7 | No retention cap or budget on recorded audio | — | — | **pending** |
| 4.8 | A recording that could not be written still yields a moment, from the transcript alone | — | `record/voice.ts` | invented |
| 4.9 | A write failure mid-recording keeps what already reached disk and stops | — | `VoiceCaptureModule.swift` | invented |
| 4.10 | Audio missing at settle time is recorded as `audio_missing` immediately | — | `record/voice.ts` | invented |
| 4.11 | The machine transcript fills the body only while `correction_count == 0` | — | `record/store.ts` | **product rule** |
| 4.12 | Microphone state is only ever learned by trying — never probed, never assumed | — | `RecordRoot.tsx` | inherited (desktop 12.6) |
| 4.13 | A recording with no words says which — `listening back…` / `couldn't transcribe · the audio is safe` | — | `record/ui/MomentRow.tsx` | inherited (desktop, `FragmentRow`) |

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
| 8.1 | **Export / backup of the Record** | Desktop has `export_record` and `back up now`. The mobile prototype draws no export, and this branch does not read that silence as "the Record may not leave the phone". The material is all in place (`archived_material`, retained audio, `fragment_revisions`); the surface is not designed. |
| 8.2 | Retained-audio budget | See 4.7. A phone can fill up, and nothing yet tells anyone that. No number is invented here because any of them — a size cap, an age cap, "keep the last N" — is a product decision about deleting somebody's own recordings, and a canonical source should not be discarded to save space without being asked. |
| 8.3 | Reading time on a shared article (`14 min`) | Not derivable offline; unresolved content in the prototype. |
| 8.4 | Price, saving and trial copy | RevenueCat supplies them; the prototype states they are unresolved and the layout holds the longest plausible line. |
| 8.5 | Android parity for the new surface | `AGENTS.md` defers it and the prototype is an iPhone prototype. The Android sign-in path is untouched, not redesigned. |
| 8.6 | Wording history on the sync wire | See 6.7. Needs both repositories. |
| 8.7 | ~~The plan rows, `continue with apple`, `restore a purchase` and account deletion~~ — **joined.** The sheet now loads the real offering and shows only what the store said; `continue` runs `openSyncPurchaseFlow` with the existing product identifiers and the `Chinotto Pro` entitlement; `restore` runs `restorePurchases` and tells apart "nothing to restore" from "could not ask"; `continue with apple` runs `enableAppleSyncWithFirebase` followed by the same post-sign-in sequence the shipping app sends (queue, tombstones, themes, backfill, access mirror, in that order); `stop` mirrors `active: false` before signing out; and `delete for good` runs the v1 deletion including the reauthentication Firebase demands after the Firestore data is already gone. **Still unverified:** a real purchase, a real restore against a real Apple ID, and a real Sign in with Apple, none of which can be exercised on a simulator without a sandbox account — see the device checklist. |
| 8.8 | ~~The cloud device collection~~ — **built, with one stated limit.** Devices live at `users/{uid}/devices/{deviceId}`, beside `users/{uid}/entries`, so a desktop that knows nothing about them is unaffected. Identity is generated once and never regenerated; `last seen` is a server timestamp written only by the device itself, so a device that has never checked in is not listed rather than given an invented time; nothing reports an online state, because a heartbeat a minute apart cannot tell "here" from "was here fifty seconds ago". Removing writes `revokedAt` rather than deleting, because a deleted row is indistinguishable from one that never existed and the device would re-register. **What revocation is not:** the revoked device reads its own row and stops — through `isSyncAccessBlocked()`, so the queue, both outboxes and ingest all honour it — but Firestore's deployed rules still permit any signed-in client to write its own user's entries. It is enforcement by agreement. Making it a real boundary means a security-rules change that checks the caller's device row, which is a backend deployment this app cannot do to itself. |
| 8.9 | **Light appearance — the control is gone, not the idea** | There is one palette in `tokens.ts`, the prototype draws no light screen, and the choice did not survive a relaunch. So `system · light · dark` was a control that selected an appearance the app cannot render, and `system` in particular promised to follow a phone it could not follow. Settings now states the one appearance there is and offers nothing. When a light appearance is actually designed, this becomes a choice again — and the home-screen icon's light variant stays, because iOS renders that one for real. |
| 8.10 | **`lift contrast in bright light` — removed for the same reason** | The control was drawn and stated its state; there were no token deltas behind it, so turning it on changed nothing. Removed with the appearance control rather than left as a switch that does nothing. |
| 8.11 | ~~Nothing on this branch has been seen running on a device or simulator~~ — **superseded.** RevenueCat was upgraded to 10.10.0 (`fix(ios): upgrade RevenueCat for Xcode 27`), the build succeeds, and the branch has now been driven on an iPhone 17 simulator: cold launch, capture, multiline capture and its cap, keyboard open/close including interactive dismissal, Find, Focus, Continue, Correction with its revision, voice capture with its permission prompt, and a retained recording that could not be transcribed. Still unseen: a physical device, and everything in 8.7. |
| 8.12 | **Whether a recording that is silent should still become a moment** | On the simulator there is no audio input, and a four-second hold produced no fragment while a twenty-five-second one produced `couldn't transcribe · the audio is safe`. Those two outcomes cannot be told apart here: "the app discards silence" and "the simulator produced no samples" look identical without a real microphone. The retention rule itself is verified — audio survived a transcription failure — but the silent case needs a device. |
| 8.13 | ~~Retained audio cannot be played~~ — **done.** A sibling native module (`AudioPlaybackModule`) plays a moment back through `AVAudioPlayer`, behind an injected port so the rules are testable without a device: one thing at a time, the mark follows the sound rather than the tap, and a recording that has gone is written down as gone rather than appearing to play silence. Verified on the simulator against CoreAudio's own log — a 25.4-second file played for 25.44 seconds and the mark returned by itself. It is a separate module from the recorder on purpose: recording is the load-bearing path and nothing about hearing a recording again reaches into it. |
| 8.14 | **Nothing sweeps orphaned audio — and nothing should yet** | Retained audio is deleted when a recording is too short to keep and when a removal is finally published; there is no pass for a file whose fragment never came to exist. That should not happen any more — it was a symptom of the voice controller being rebuilt mid-recording (see `fix(voice): stop replacing the recorder while it is recording`) — but the two files it left on the test simulator are the proof that it can, and nothing would find them. **Automatic deletion is deliberately not implemented.** A file with no fragment is not evidence that the audio is safe to delete: a capture can be between the native side persisting it and the database transaction that records it, and in that window the file is the only copy of what somebody said. An age-only heuristic cannot tell that window apart from an orphan, and deleting canonical material on a guess is the one failure this design is built to prevent. Whatever rule eventually does this needs a durable notion of capture state and ownership — something the record itself can be asked, that survives a force-kill — rather than a timer. Left open on purpose, for design rather than for a passing fix. |
| 8.15 | ~~Haptics~~ — **preserved, and deliberately not extended.** The shipping app fires exactly one impact, `ImpactFeedbackStyle.Light`, behind one stored preference, at the moment a thought is persisted — its own comment says "not on keypress or failed save". That is kept, at the four places a moment now lands: typed, spoken, continued, shared. Its five other call sites belonged to v1 surfaces that no longer exist (a search chrome toggle, a month rack, a sheet opening, a temporal boundary); they are **not** reassigned to whatever the new surface does in roughly the same place, because a haptic moved to a different event is a different haptic. v1 had no toggle for this and neither does this — the key, the default (on) and the behaviour are the same, so an upgrading install keeps whatever it already chose. |
| 8.16 | **Sign in with Apple, a completed purchase, and everything downstream of them** | Verified as far as a simulator without a sandbox Apple ID allows: the offering loads and shows real prices and a real trial (`$29.99` a year, `save 38%` computed from the real monthly, `1-week free trial` from the store's own introductory offer); `restore` reaches StoreKit and returns `no purchases found for this apple id`; `continue` reaches StoreKit and a cancel is treated as a decision, not a failure. **Not verified:** a purchase that completes, an entitlement becoming active, Sign in with Apple, and therefore everything behind it — sync actually turning on, the device list against a real Firestore, and revocation across two devices. The paywall gates sign-in, so with no entitlement the Apple step cannot be reached from the interface at all; this is the shipping app's behaviour, not a new one. All of it needs a sandbox Apple ID on a real device. |
| 8.17 | **The Share extension's last step cannot be verified on a simulator** | Everything up to it was: the extension is built into the bundle as a PlugIn, appears in the system share sheet with the right identity, is invoked by sharing a URL from Safari, and hands off and opens the app. What it cannot do there is deliver the payload, because that travels through the app group `group.com.chinotto.mobile` — and a simulator build is signed ad-hoc with no team, so Xcode strips the entitlements and the group does not exist. The entitlement is declared correctly in `ios/Chinotto/Chinotto.entitlements` and in the extension's own; the intake itself (`record/share.ts`) is covered by tests over URL-only, URL-with-selection and text-only payloads. It resolves on the signed device build. |

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
| No export surface yet | `export_record` + backup | **pending**, not decided (8.1) |
