# Architecture

High-level overview of the Chinotto mobile app.

## Stack

- **Expo SDK 58 / React Native 0.88 / React 19.3** — iOS and Android app shells
- **TypeScript** — UI and business logic
- **SQLite (`expo-sqlite`)** — local storage and search

## Data model

The current Record stores **fragments** with immutable capture time, correction history, continuations, encounters and retained voice audio. The older `entries` table remains as a compatibility bridge for the deployed text sync contract. Capture requires no folders or documents.

## Local-first

SQLite on your device is the source of truth for capture and search. Entry text is not sent to analytics.

**Optional sync on iOS:** when Firebase is configured and you sign in with Apple, text can sync with Chinotto desktop. Current clients also sync correction history and continuation links through additive [Record metadata](record-sync.md). Original audio remains local. Android has no sync setup.

## Project layout

```
record/       Record model, storage, voice and one-surface UI
storage/      Legacy entry repository and database boot
sync/         Background Firestore push/pull
widgets/      iPhone widget content and capture/thought deep links
ios/          Committed native app, extensions and ThoughtMeaning bridge
docs/         Public documentation
```

Maintainer-only specs and release checklists stay local (not in the public tree).

## Capture and sync

The UI saves fragments locally first. The bridge mirrors text into legacy entries for optional sync. The durable metadata channel carries authored history and links beside that legacy text. Sync runs in the background and never blocks typing.

The reader's optional connection lookup prefers visible word evidence. On iOS 17 and later it can also compare short passages through the device's Natural Language framework. The native module returns similarity scores and the reader displays the corresponding current originals. There is no model index to update during capture.

## Reader actions and local notifications

On iOS 26 and later, the native SwiftUI thought actions menu opens reminders, quiet reading, and connection lookup. Earlier iOS versions and Android retain the available inline actions. Both entry points use the same reader and connection model.

One-shot reminders store device-local intents and reconcile them with pending iOS notifications through `record/reminders.ts`. Notification preferences can pause those reminders or retain a time for in-app use. The independent opt-in Return-alert policy in `record/returnAlerts.ts` schedules a discreet alert four hours after a newly surfaced, evidenced Return, with at least seven days between scheduled alert times. Opening, dismissing, holding, or invalidating the Return retires its alert on reconciliation.

Notification responses and widget thought links use the existing reader entry path. They wait for authorized reading and for active editing or overlays to close, while preserving unfinished capture. Reminder intents and notification preferences stay out of sync and portable archives. See [privacy](privacy.md) for alert contents.

## Updates

Production builds check the App Store for updates. An in-app update screen may appear when a newer version is available (Firebase Remote Config policy).


## Optional device protection

Device protection is off by default and local to each installation. System authentication opens
private reading and is required to enable or disable the setting; new capture remains available.
A native lifecycle cover protects previews before JavaScript can react. Backgrounding invalidates
the current read session, and successful answers from an older session cannot reopen it. Unsaved
wording remains in memory across a lock. This is an application access boundary, not database,
backup, export or cloud encryption. See [phase 4 verification](product-improvements.md#phase-4-local-result--15-november-2026)
for the remaining physical-device checks.


## Portable archives

Settings previews a validated Chinotto ZIP before restoring absent moment IDs. SQLite writes
are transactional and preceded by a consistent recovery copy. Original audio is staged,
verified and journaled independently; startup cleans interrupted installs before orphan audio
recovery. Imports preserve the durable model and regenerate local paths/indexes. See the
[archive contract](record-archive.md) for bounds, merge policy and compatibility.
