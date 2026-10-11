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

**Optional sync on iOS:** when Firebase is configured and you sign in with Apple, text can sync with Chinotto desktop. Original audio and correction history remain local. Android has no sync setup.

## Project layout

```
record/       Record model, storage, voice and one-surface UI
storage/      Legacy entry repository and database boot
sync/         Background Firestore push/pull
docs/         Public documentation
```

Maintainer-only specs and release checklists stay local (not in the public tree).

## Capture and sync

The UI saves fragments locally first. The bridge mirrors text into legacy entries for optional sync. Sync runs in the background and never blocks typing.

## Updates

Production builds check the App Store for updates. An in-app update screen may appear when a newer version is available (Firebase Remote Config policy).
