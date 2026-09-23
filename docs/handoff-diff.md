# Handoff diff — working mobile prototype → `feat/chinotto-next-mobile`

Compares the **working Claude Design mobile prototype** (`Chinotto Mobile.dc.html` +
`chinotto-data.js`, project `5e00e5ee-ab7f-4897-aaf8-56a067e2ade9`) against the mobile app as
it stood on `main` at `c8e90b7`.

Source-of-truth order from this point:
**working mobile prototype** → **desktop Record semantics** → resolved product direction →
existing mobile infrastructure.

## Method

The prototype was read in full — its `class Component extends DCLogic` (state, transitions,
`STY`, `item()`, `band()`, `utilityVals()`, `renderVals()`), its whole template, and the
shared `chinotto-data.js`. The desktop repository was read as a **read-only** reference:
`src-tauri/src/db/schema_v2.sql`, `migrate.rs`, `bridge.rs`, `docs/handoff-diff.md` and
`docs/unspecified-decisions.md`. The current mobile app was read from `storage/`, `sync/`,
`types/`, `screens/`, `components/`, `widgets/`, `share/`, `linking/` and `monetization/`.

**`chinotto-data.js` is headed "shared by desktop and mobile".** Both prototypes run the same
`bandsFor()`, `traces()`, `returnFor()`, `suggestContinuation()`, `parseAnchor()` and
word-matching code. The model layer is deliberately one model, and this branch treats it that
way: where mobile and desktop can mean the same thing, they do.

---

## 1. Conflicts — flagged, and how each was resolved

### 1.1 The launch lockup vs. "capture is never gated" — **DECIDED**

The prototype holds a full-screen lockup for `launchHold` (prop default **1.9s**; the code's
own fallback is 2.6s) on every mount, then plays a 520ms exit. `AGENTS.md`'s golden rule is
that the app opens directly into capture and *"nothing may re-introduce a gate before
typing"*.

Taken literally, the prototype adds up to 1.9 seconds to every open. That is exactly the
recurring friction the golden rule exists to prevent.

**DECIDED: cold start only, non-blocking.** The lockup plays on a genuine cold start and is
skipped entirely on warm resume. It is `pointerEvents="none"`, the capture field is mounted
and focused underneath it from the first frame, and **any touch dismisses it at once**. The
identity moment survives; the tax does not.

### 1.2 The record is unbounded, on a phone

`bandsFor()` emits every fragment with no per-tier caps and no "N more" affordance, exactly as
on desktop. Desktop decided (their §1.1) to render every band and window the rendering.

Mobile inherits the decision and not the mechanism: there is no DOM to window. The record is
rendered as a single **inverted, virtualized list** of pre-flattened rows (band labels are
rows, not containers), so the surface is exactly what the prototype draws and only the mounted
window is bounded. See `record/ui/` and decision 1.2 in `unspecified-decisions.md`.

### 1.3 `esc` is a desktop artifact in a phone prototype

The prototype registers a global `keydown` handler and unwinds a ladder on `Escape`:
recording → widget → sync → settings → editing → years → focus → selected → input → anchor.
A phone has no `esc`. The ladder is real and is preserved, but it is driven by the iOS back
gesture, the drawn `‹ edge` affordances and the sheet dismissals rather than by a key.

### 1.4 The prototype's `returnFor()` is corpus-specific

`returnFor()` first looks for two specific sentences in the demo corpus and only falls back to
a generic shared-run search. The fallback is the real rule. The implementation uses desktop's
`returns.rs` semantics plus their §1.3 decision: every surviving trigger states a
because-clause, and `interval` is dropped because it has no reason to give.

### 1.5 `walk the states` must not ship

The sync sheet carries a `prototype · walk the states` control that jumps between off / paid /
on / offline / sign-in expired / two wordings. It is a prototype affordance for walking a
demo, and it is **not implemented at all** — not shipped, and not hidden behind a flag. The
six states are reachable from real state, which is the only way they are worth testing.

### 1.6 Unresolved content the prototype draws

`[price]`, `[saving]`, `[trial]` in the plan rows, and `14 min` on the shared article. The
prototype states outright that *"price and trial terms are unresolved content — the layout
holds the longest plausible line."* Real values come from RevenueCat; reading time is not
derivable offline and is not implemented. The layout holds the longest plausible line.

### 1.7 "apple id only" vs. shipped Google sign-in

The sync sheet says *"apple id only. chinotto never sees a password"*. The copy stands **on
iOS**, where Apple is the only provider. *Correction (24 sep 2026):* this entry originally said
the shipped app signs in with Google on Android. It does not — Google sign-in and account
linking exist only on the unmerged branch `feat/google-auth-account-linking` (5401ce2), and
`main` has no Google provider anywhere. Android does not offer sync set-up at all; see
`unspecified-decisions.md` §10. Flagged so the sentence is not mistaken for a cross-platform
product statement.

### 1.8 Removal publishes before the undo window closes — **data integrity**

Mobile's `deleteEntry` hard-deletes locally and enqueues a tombstone immediately. Desktop
flagged the same thing (their §1.5) and it blocks their quiet line: an 8-second `bring back`
can reinstate a fragment on the Mac that the phone has already destroyed for everyone.

Mobile owns the other half. Removal is now **soft** (`fragments.removed_at`) with the publish
**deferred** through `pending_removals` until the window has passed. `bring back` inside the
window deletes the pending row and clears `removed_at`, and nothing ever reaches Firestore.

### 1.9 Recall themes are user material — **data integrity**

`user_themes` holds labels and keywords a person typed, and `entry_themes` records where they
filed things. The new model has no themes. Retiring the concept without keeping the material
would be a loss, not a migration.

Resolved: the material is copied verbatim into `archived_material` (canonical, inside the
database, cannot fail) and written to a readable file when a filesystem is available. **The v1
theme tables are not dropped** — they stay until the transition is over.

### 1.10 The mobile prototype draws no export — **pending, not accepted**

Desktop has `export_record` and `back up now`. The mobile prototype's settings has seven
sections and none of them is export. This branch does **not** treat that as a decision that
the Record may not leave the phone. It is recorded as a pending surface
(`docs/unspecified-decisions.md` §8.1) and the material it would need —
`archived_material`, retained audio, `fragment_revisions` — is all in place.

---

## 1b. What has and has not been run

The JavaScript is verified: 445 tests, a clean typecheck, a Metro bundle of 1 001 modules,
and a migration exercised against a 3 000-entry v1 database written to disk, closed, and
reopened the way an upgrade actually does it.

**The app has not been run.** `xcodebuild` fails compiling `Pods/RevenueCat` under Xcode 27
— every error inside that one pod, none in Chinotto's code or any other dependency. See
`docs/unspecified-decisions.md` §8.11. Everything in the dogfood checklist is therefore
unobserved, and the surface has never been seen at 1× on a phone.

## 2. Already matches, or is directly reusable

- **Sync engine shape.** Queue, tombstone outbox, ingest suppression, backfill paging,
  `isSyncAccessBlocked`, theme outboxes. The transport is sound; what travels over it changes.
- **Monetization.** RevenueCat, `syncEntitlement`, `syncAccessPolicy`, `paywallConfig` map onto
  the prototype's plan rows and `restore a purchase` without redesign.
- **Auth.** Apple sign-in and account linking already match "one sign-in, so the mac knows
  it's you".
- **System plumbing.** App group `group.com.chinotto.mobile`, `expo-sharing` activation rules
  (text, up to 5 web URLs / pages), the `expo-widgets` target, `chinotto://` and
  `applinks:getchinotto.app`, and the deep-link parsers in `widgets/` and `linking/`.
- **Update gate.** `resolveUpdateGate` already produces soft/forced, which is exactly the
  prototype's `updateState`.
- **Native voice bridge.** `NativeVoiceCapture` gives partial and final transcripts. It is
  kept — but it becomes the *derived* half of voice, not the whole of it (§4).

## 3. Behaves differently

1. **Bands, not a fixed tier stack.** The prototype opens a new band whenever the level
   changes, so a tier can appear more than once and reading order is strictly chronological.
2. **The edge is the product.** One surface with capture pinned to the bottom, `column-reverse`
   above it. The current app's stream/sheet/echo/temporal-rack model is replaced entirely.
3. **Find is a mode of the capture field** (`/`), filtering the record live underneath — not
   `StreamSearchField` and not a separate surface.
4. **Standing is entered by typing a date** into the capture field (`march 2024`, `2019`,
   `today`, `now`), and bands re-level relative to where you stand.
5. **Two taps, not a sheet.** First tap selects a D0 row and reveals an inline 44px verb row;
   second tap opens focus. `EntryThoughtSheet` has no counterpart.
6. **Correction keeps the earlier wording** and never moves the moment in time.
7. **Continue appends a new dated moment** to a Line. It never edits the earlier one, and a
   Line is the transitive closure of `continuations` — not a field, not a folder, not a name.
8. **Hold replaces nothing that exists** on mobile (pins never shipped here), and sits *above*
   the record rather than inside it.
9. **Removal is soft, with a real 8-second undo** in the quiet edge (§1.8).
10. **Settings is reached by pulling down from the top edge**, not from a tab or a button.

## 4. Voice — the largest single semantic change

Today mobile runs iOS speech recognition and keeps **only the transcript**. The audio is never
retained. Desktop's model is the opposite way round and is the durable one:

> The AUDIO is the primary source and the only canonical part. Capture cannot fail, so a voice
> fragment exists the moment recording stops, whether or not anything is ever transcribed.

This branch implements that on mobile:

- audio is written to `chinotto/audio/<id>.m4a` **before** transcription is attempted;
- a transcription failure loses nothing — the fragment exists, the audio is there, and
  `voice_transcripts.state` says `failed`;
- a person correcting a transcript edits the **fragment body**, which goes through
  `fragment_revisions` like any other wording, and never touches the audio or
  `voice_transcripts`;
- audio never travels over the legacy sync contract, which cannot carry it;
- when the file is looked for and is not there, `audio_missing` is set and the interface says
  the audio is gone rather than pretending it still has it.

### 1.11 Retained audio: mobile re-encodes where desktop does not

Both repositories independently arrived at the same voice model — the tap writes the file,
the recogniser is a second consumer, the fragment is created from the recording, a failed
transcript is a failed *reading*. The formats differ: desktop keeps the input's own format
in a `.caf`, mobile encodes AAC into an `.m4a`.

Desktop's reasoning — a canonical source should not already be a derivation — is about the
model rather than the platform. Mobile diverges because eleven megabytes a minute is not
something a phone can absorb without a retention policy, and there is no retention policy.

**Flagged as the one open cross-repo semantic disagreement on this branch**, with the
alternatives, in `docs/unspecified-decisions.md` §4.3.

## 5. Data model — what mobile had, and what it has now

v1 mobile was `entries {id, text, created_at}` with no `user_version` and no migration
framework. Everything else was bolted beside it.

| Concept | v1 mobile | Now |
|---|---|---|
| Correction | destructive in-place `UPDATE` | `fragment_revisions`, append-only; `captured_at` immutable |
| Continue | none | `continuations`, chain not graph |
| Capture method | unknown | `capture_method` + `capture_origin` (incl. `widget`, `share`) |
| Voice | transcript only | `voice_captures` (canonical) + `voice_transcripts` (derived) |
| URLs | plain text | `encounters` with byte-exact `url_raw` and offline `url_key` |
| Removal | hard delete, immediate publish | soft + `pending_removals`, 8s window |
| Hold | absent | `holds`, released rows kept |
| Traces | echo heuristics | `traces` (derived) + `trace_judgements` (canonical) |
| Returns | absent | `returns` + `return_evidence` |
| Devices | absent | `this_device` |
| Conflicts | last write wins, silently | `wording_conflicts`, asks rather than resolves |
| Themes | live, synced | archived verbatim; tables retained, product retired |

**Migration ladder** (`record/migrate.ts`, `PRAGMA user_version`, forward-only, idempotent,
one transaction per step, v1 tables read and never dropped):

1. the v1 schema, owned here so boot and migration cannot drift
2. the Record schema + `entries` → `fragments`
3. mark the theme archive owed
4. `this_device`
5. FTS5, guarded — a build without it falls back to LIKE

Tested against a generated 2 000-entry, six-year v1 database with blank rows, a 10 000+
character body, a tracking-parameter URL, unicode and emoji, engagement edit counts, and sync
work in flight. The fixture caught a real bug on the first run: SQLite's `TRIM()` strips
spaces only, so whitespace-only v1 rows were being imported as blank fragments.

## 6. Sync compatibility while the two contracts differ

Same principle as desktop's `bridge.rs`, in the other direction:

> The Record is canonical. `entries` survives only because the deployed apps and the Firestore
> protocol speak it. The bridge **degrades** — it sends the parts that fit and leaves the rest
> behind — and never **fabricates**.

Concretely, and from P0 rather than P10:

- the fragment id **is** the legacy entry id, which makes it the idempotency token both ways;
- a Continue mirrors out as **its own** legacy entry, never appended to the earlier one;
- an incoming remote text change is **not** synthesised into a revision — it is a
  `wording_conflicts` row, and the record keeps showing the local wording until asked;
- audio, encounters, holds, traces, returns and revision history stay local;
- a local removal is soft here and a tombstone there, published only after the undo window;
- a remote tombstone soft-removes here rather than destroying.

## 7. Legacy surfaces this replaces

`EntryThoughtSheet`, `EntryReadSheet`, `StreamFlowPanel`, `StreamSearchField`,
`StreamBackToNowPill`, `HomeDepthRecall`, `RecentList`, `SearchThemeChips`,
`ThoughtThreadPanel`, `CaptureContinuationHint`, `CaptureInput`, `CaptureMicRail`,
`VoiceCaptureControl`, `SheetEditVoiceDock`, `InterfaceGuide*`, `AnalyticsOptInModal`,
`EnableSyncModal`, `GestureDiscoverHint`, `AmbientBackground`, `BrandSplash*`, `ChinottoLogo`,
`introRadialBlob`, `components/echo/*`, `components/temporal/*`, `components/gesture/*`,
`components/stream/*`, `components/thoughtSheet/*`, and the five `screens/`.

**P12 removes them only once their replacement works.** Nothing in `storage/` or `sync/` that
the deployed contract depends on is dropped in this branch.

## 8. Identity and iOS system surfaces

Every shipped raster is still the old mark. The new mark is a ring with three dots receding
down a column, ink `#e6e6e3` on `#141416`, each rung drawn rather than scaled. In scope here:
the app icon and its two variants (dark, light — `ios tints and android themes these two on
their own`), the launch lockup, the widget's mark, the share surface's mark, and the splash.

`NSMicrophoneUsageDescription` is currently *"...to turn a short spoken thought into text on
your device"*, which describes transcription. With retained audio it is no longer accurate and
is rewritten to say that the recording is kept.
