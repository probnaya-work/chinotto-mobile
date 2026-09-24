# Privacy

Chinotto Mobile is **local-first**. Your thoughts stay on your device in SQLite. Capture and search work without any network connection.

## Your data

- **Entry text** is stored locally only. It is not sent to analytics or included in crash-style telemetry.
- **Account deletion** — when signed in for sync, Settings → Account → Delete Account removes your cloud data and Firebase account. Local entries on the device are kept.

## Voice

- **On iPhone, transcription runs only on the iPhone.** Chinotto uses Apple's speech recognition with on-device recognition required, and only when the iPhone supports it for the language. When it does not, or when speech recognition is not allowed, the recording is kept without a transcript and nothing is sent anywhere; it is read back on the device later, once, if local recognition becomes available.
- **Recordings stay in the app's local data** and are not part of sync; only the transcribed text syncs. iCloud Backup may include the app's local data.
- **Removing a voice entry** deletes its recording and transcript from this iPhone once the few seconds to bring it back have passed.

### On Android

- **Recordings are made and kept on the phone**, in the app's own storage, whatever happens to recognition.
- **Words come only from Android's on-device recogniser, and only where the phone shows it cannot reach the network**: Android 13 or later, the system's on-device recognition service is a system app without the `INTERNET` permission, it reports no online languages, and the language is already installed. Chinotto never uses Android's default recogniser, which may send audio to a server, and never downloads a language on your behalf.
- **Otherwise the recording is kept without words** and nothing is sent anywhere; it is read back on the phone later, once, if all of the above becomes true.
- **The microphone is the only permission**, asked for the first time you hold the circle.
- **Removing a voice entry** deletes its recording and transcript from the phone once the few seconds to bring it back have passed.
- There is no sync on Android: nothing you write or say leaves the phone.

## Optional sync

When you enable sync and sign in with Apple, entries can sync with Chinotto desktop via Firebase. Sync is optional; the app remains fully usable without it.

## Analytics (opt-in)

Analytics are **off by default**. On first launch you may see a one-time prompt; you can change the setting later in Settings → Privacy.

When enabled, Chinotto sends only simple event names and numbers — for example “entry created” with the text length, or “search used” with the number of results. It never sends:

- the text of your thoughts
- your search query
- personal identifiers

Analytics help understand how the app is used. You can turn them off at any time in Settings.
