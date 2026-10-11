# Privacy

Chinotto Mobile is **local-first**. Your thoughts stay on your device in SQLite. Capture and search work without any network connection.

## Your data

- **Record text** is stored on the device by default. With optional sync on iOS, text is also stored in the synced copy. It is not sent to analytics or included in crash-style telemetry.
- **Export** — Settings can prepare a portable ZIP of the local Record, including correction history and retained audio. It works offline and opens the system share interface. It is a copy, not a restorable app backup.
- **Account deletion** — when signed in for sync, Settings → Account → Delete Account removes your cloud data and Firebase account. Local entries on the device are kept.

## Voice

- **On iPhone, transcription runs only on the iPhone.** Chinotto uses Apple's speech recognition with on-device recognition required, and only when the iPhone supports it for the language. When it does not, or when speech recognition is not allowed, the recording is kept without a transcript and nothing is sent anywhere; it is read back on the device later, once, if local recognition becomes available.
- **Recordings stay in the app's local data** and are not part of sync; only the transcribed text syncs. iCloud Backup may include the app's local data.
- **Removing a voice entry** deletes its recording and transcript from this iPhone once the few seconds to bring it back have passed.

### On Android

- **Recordings are made and kept on the phone**, in the app's own storage, whatever happens to recognition.
- **Words come only from Android's on-device recogniser, and only where the phone shows it cannot reach the network**: Android 13 or later, the system's on-device recognition service is a system app without the `INTERNET` permission, it reports no online languages, and the language is already installed. Chinotto never uses Android's default recogniser, which may send audio to a server, and never downloads a language on your behalf.
- **Otherwise the recording is kept without words** and nothing is sent anywhere; it is read back on the phone later, once, if all of the above becomes true.
- **The microphone is the only permission**, asked for the first time you tap the circle.
- **Removing a voice entry** deletes its recording and transcript from the phone once the few seconds to bring it back have passed.
- There is no sync on Android: nothing you write or say leaves the phone.

## Optional sync

When you enable sync and sign in with Apple, entries can sync with Chinotto desktop via Firebase. Sync is optional; the app remains fully usable without it.

Removing a moment erases its wording, history, relationships and derived material on this device after the eight-second undo window. If sync is on, the removal reaches your other signed-in devices; original audio stays local to the device that recorded it and is erased there. The cloud copy is marked removed, but its text remains in cloud storage until you delete the cloud account.

## Analytics (opt-in)

Analytics are **off by default**. You can turn them on or off in Settings → Privacy.

When enabled, Chinotto sends only simple event names and numbers — for example “entry created” with the text length, or “search used” with the number of results. It never sends:

- the text of your thoughts
- your search query
- personal identifiers

Analytics help understand how the app is used. You can turn them off at any time in Settings.
