PROBNAYA / CHINOTTO
INSTRUMENT

Independent Computational Laboratory

# Chinotto

A pocket for thoughts, encounters, and what comes back.

Chinotto Mobile is a minimal companion to Chinotto desktop — built for capturing thoughts the moment they appear.

Capture them instantly — without projects, folders, or workspaces.  
Structure can come later — when you revisit on desktop.

Local-first. Capture and local reading work offline.
Optional sync with Chinotto desktop on iOS (Chinotto Pro).

The iPhone 3.0.1 release adds [Chinotto Quiet](docs/quiet.md). See the [release notes](docs/release-notes.md) for its scope and verification status.

## Download (iOS)

[App Store](https://apps.apple.com/us/app/chinotto/id6761345307)

## Features

- Capture thoughts instantly
- One continuous Record, with original capture dates
- Find remembered words or move through dates, months and years
- Continue adds a linked moment dated now; Correct keeps earlier wording
- Follow Lines and revisit older moments when recent writing gives them a reason to return
- Request possible connections through shared words or on-device similarity in meaning on supported iPhones
- Set one-shot thought reminders, manage notification preferences, and opt in to discreet Return alerts (iOS)
- Quiet reading puts secondary controls away; iOS 26 groups thought actions in a system menu
- Bring a page or selected text into the Record from another app (iOS)
- The standard Home Screen widget opens recent thoughts in the reader
- The medium and large Chinotto Quiet widgets open text or voice capture and keep past entries private. Add one to a Focus page to return there after using Messages or Chinotto.
- Voice capture with retained original audio and on-device transcription where available
- Optional Face ID or device-code protection for reading, with capture still available
- Dark or warm light appearance, system text size and lifted contrast
- Optional sync of words, dates, Lines and wording history with Chinotto on Mac (iOS)

The upcoming Android app receives the shared Record and runtime improvements alongside its existing local capture and on-device voice. Its preparation is tracked separately from the iOS release in the [release notes](docs/release-notes.md#android--in-preparation-unpublished).

## Data ownership

- **Local storage** — the Record starts on your device in SQLite
- **Export** — a user-initiated ZIP of the Record, correction history and original audio; no account or subscription needed
- **Restore** — preview a Chinotto archive and add missing moments without duplicating existing ones; a local recovery copy precedes the merge
- **Account deletion** — when signed in for sync, remove cloud data from Settings → Account

See [Privacy](docs/privacy.md) for local storage, optional sync, and analytics.

## Updates

New versions ship through the App Store. The app may prompt when a newer version is available.

## Documentation

- [Privacy](docs/privacy.md)
- [Architecture](docs/architecture.md)
- [Development](docs/development.md)
- [Release notes](docs/release-notes.md)
- [Record archives](docs/record-archive.md)
- [Record sync](docs/record-sync.md)
- [Implementation and verification history](docs/product-improvements.md)

## Related

- [Chinotto desktop](https://github.com/probnaya-work/chinotto) — primary thinking surface
- [Chinotto website](https://github.com/probnaya-work/chinotto-site) — product information
