# Chinotto Mobile — AGENTS.md

## Product Context

Chinotto is a minimal thinking tool.

This is NOT a notes app.

Core principles:
- **Instant capture** — On every return visit, the app opens directly into capture (input-first, as soon as boot allows). Nothing may re-introduce a “learning” or setup gate before typing.
- No organization before thinking
- No folders, tags, or categories
- **Minimal friction** — No repeated teaching, no tip-of-the-day, no mandatory tours, and no extra decisions at the moment of capture.

Mobile app role:
- Capture-first
- Input is the primary UI
- Thinking happens on desktop

**Platform priority (this repo):** **iOS first** — ship-quality UX and sync (Sign in with Apple) target iPhone; **Android parity is deferred**. **Windows and Linux** desktop apps are **planned later** (desktop lives outside this repo). Product source of truth: `docs/internal/product/product-spec.md`. External overview: `docs/internal/product/product-brief.md`.

**Sync documentation:** **Wire contract** — `docs/internal/sync/sync.md` (this repo). **Desktop** implementation and ops — Chinotto repo `docs/internal/sync.md` (https://github.com/AleksandrMalinin/chinotto/blob/main/docs/internal/sync.md). **Ship alignment** — `docs/internal/sync/sync-release-checklist.md`, mirrored in `chinotto-app` (update both when criteria change). Log mobile implementation tweaks in `docs/internal/sync/sync.md` § Changelog.

Golden rule:
> If a feature slows down capturing a thought → do not implement it.

Interpretation for agents: judge **recurring** friction (every open, every new thought). After a brief brand splash, capture is immediate; avoid anything that **regularly** delays input.

---

## Package management

- **pnpm** is the only supported package manager for this repo.
- **Do not** use npm or yarn (no `npm install`, `yarn install`, or lockfiles from those tools).

Use:
- `pnpm install`
- `pnpm add <pkg>`
- `pnpm test`

---

## Testing policy (STRICT)

- **Every new feature MUST include tests.**
- Tests must be written **immediately after** implementing the feature (same change set when practical).
- **Jest** is the testing framework.

### Scope

**Unit tests**

- Storage layer: entry repository, DB initialization and queries.
- Sync layer: queue, retry logic (when those modules exist).

**Basic component tests**

- Capture input behavior (e.g. value changes, submit callback).
- Capture / submit flow at the screen level where it adds confidence without brittle UI assertions.

### Avoid

- Snapshot-heavy tests as the main form of coverage.
- Over-testing visual styling or layout pixels.

### Goal

Reliability and safe refactors **without** slowing down iteration.

---

## Tech Stack Rules

### React Native / Expo

- ALWAYS use latest stable Expo SDK
- Do NOT use outdated examples or deprecated APIs
- Prefer Expo-managed or Expo-compatible libraries

Current constraints:
- Expo SDK must support widgets (>= SDK version where widgets are available, e.g. SDK 55+)
- Use modern React Native patterns (functional components, hooks)

---

## Dependency Policy

When choosing libraries:

- Prefer:
  - Actively maintained
  - Expo-compatible
  - Minimal and lightweight

- Avoid:
  - Deprecated libraries
  - Libraries requiring heavy native setup (unless absolutely necessary)
  - Overly complex abstractions

---

## Source of Truth (VERY IMPORTANT)

When generating code or making decisions:

1. ALWAYS prioritize:
   - Official documentation
   - Latest stable APIs

2. NEVER rely on:
   - Old blog posts
   - StackOverflow answers older than 2 years (unless verified)
   - Deprecated patterns

3. If unsure:
   - Explicitly state uncertainty
   - Propose 2 options

---

## Architecture Principles

- Local-first by default
- Offline must always work
- Sync must be async and non-blocking

- Keep architecture:
  - Flat
  - Simple
  - Extendable

Avoid:
- Premature abstractions
- Over-engineered layers
- Complex state management (no Redux unless truly needed)

### Where things live (`feat/chinotto-next-mobile` onward)

`index.ts` → `RecordRoot.tsx` → `record/`. There is no navigator: the Record is one surface
with an edge at the bottom, and focus, the years, settings, sync, the share sheet and the
update gate are overlays on it.

| | |
|---|---|
| `record/schema.ts`, `migrate.ts` | the durable model and the `PRAGMA user_version` ladder |
| `record/store.ts` | every write, and where the invariants are enforced |
| `record/bridge.ts` | the temporary boundary to legacy `entries` — **meant to be deleted** |
| `record/model/` | banding, words, traces, returns, lines, anchors, find. No SQL, no React |
| `record/ui/` | the surface, and `tokens.ts` / `type.ts` / `tiers.ts` |
| `record/__testsupport__/prototype/` | the design prototype's own model code, vendored |

Two rules that are not style preferences:

1. **`record/model/` is pure.** Banding and matching are functions over `Material[]`, which
   is what lets `prototypeParity.test.ts` diff them against the prototype's own JavaScript
   over its 2 000-fragment corpus. Do not reach into the database from there.
2. **The bridge degrades, never fabricates.** It sends the parts of a fragment that fit into
   `{id, text, created_at}` and leaves the rest behind. It does not invent a capture method,
   flatten a Continue into the moment it continues, or turn an incoming text change into a
   revision. See `docs/handoff-diff.md` §6.

The v1 tables (`entries`, `user_themes`, `entry_themes`, the sync outboxes) and every
`sync/` module that speaks to them are **kept on purpose** while desktop and mobile still
meet over the legacy contract. Do not drop them.

Decisions the design did not specify are recorded in `docs/unspecified-decisions.md` rather
than made silently. Add to it rather than inheriting a value as if it were designed.

---

## UX Constraints

**Onboarding (precise):**

- **In bounds:** Optional one-time **brand splash** only; then straight to capture. Empty stream can show light copy / motion (same shell as capture), not a separate onboarding flow.
- **Out of bounds:** Repeatable onboarding on launch, multi-screen product tours, version tip carousels, “complete setup” wizards before capture, or any pattern that **regularly** delays input.

**Still avoid:**

- Tutorial series, feature walkthroughs, or progressive disclosure that fires on every session
- Multi-step UX for **routine** capture
- Unnecessary buttons

**Input (on capture screen):**

- Immediately focused on open
- No avoidable delay before typing
- Central element

---

## Sync Philosophy

- Save locally first
- Sync later
- Never block UI

---

## Explicit Non-Goals

Do NOT implement:

- Folders
- Tags
- Categories
- Complex editing UI
- Settings screens (unless critical)

---

## Code Expectations

- Clean, readable code
- No unused abstractions
- Minimal dependencies
- Clear separation of concerns (UI / storage / sync)

---

## Red Flags (Stop and reconsider)

If you are about to implement:

- Navigation stacks
- Complex global state
- Multiple screens for simple flows (beyond brand splash → capture)
- Heavy UI components
- **EntryThoughtSheet layout changes** without reading `.cursor/rules/entry-thought-sheet-layout.mdc` (flex dismiss + sheet last child; never `KeyboardAvoidingView` / `absolute` / `translateY` on shell)

→ STOP and propose a simpler alternative

---

## Behavior Expectations for Agent

When generating solutions:

- Prefer simplest working version
- Explain tradeoffs briefly
- Avoid overbuilding

If something feels overcomplicated:
→ suggest a simpler version

---

## Git safety (STRICT)

Uncommitted work is not in git history. **Discarding it is permanent.**

- **Never** run `git reset --hard`, `git checkout -- <paths>` across the whole tree, `git restore .`, `git clean -fd`, or any command that **throws away uncommitted changes** unless the user **explicitly** asked for that exact destructive outcome and understood that local edits will be lost.
- **Never** use “align with `origin`”, “fix divergence”, or “undo my amend” as a reason to wipe the working tree. Prefer `git fetch` + **`git reset --soft`** to match a remote tip while keeping the index, or **`git stash push -u`** first, or **ask** the user what to do with uncommitted files.
- If the goal is only to move `HEAD` without touching files, use options that preserve the working tree and say so in the reply.

---

## Version Awareness

Before implementing:

- Ensure compatibility with latest Expo SDK
- Verify APIs are current
- Avoid deprecated packages

If a feature requires a specific SDK version:
→ explicitly mention it

**iOS App Store / TestFlight version + build:** this repo commits **`ios/`**. Bumping **`app.json` alone does not update `CFBundleShortVersionString`** in `ios/Chinotto/Info.plist`. Follow **`docs/internal/release/ios-app-store-version-bump.md`** (and Cursor skill **`ios-version-app-store-release`**) whenever you change marketing version or build number for store submission.

---

## Final Principle

Chinotto is about reducing friction, not adding features.

Every decision must protect:
- speed
- simplicity
- clarity
