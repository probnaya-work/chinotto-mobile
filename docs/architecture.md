# Architecture

High-level overview of the Chinotto mobile app.

## Stack

- **Expo (React Native)** — iOS and Android app shells
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
docs/         Public documentation
```

Maintainer-only specs and release checklists stay local (not in the public tree).

## Capture and sync

The UI saves fragments locally first. The bridge mirrors text into legacy entries for optional sync. The durable metadata channel carries authored history and links beside that legacy text. Sync runs in the background and never blocks typing.

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
