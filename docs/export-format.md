# Mobile Record export

Settings → Export the Record prepares a ZIP entirely on the phone, then opens the system share interface. It requires no network, account or subscription. The temporary ZIP is removed after the share interface closes or preparation fails. A dedicated cache directory holds ZIP and SQLite snapshot files; the next launch retries cleanup of any abandoned files, without touching an active share. The user controls where a shared copy goes.

The archive is `chinotto-record/` with:

- `README.txt` — a short explanation of the contents and privacy implications.
- `record.txt` — moments from oldest to newest, using the desktop export's readable `date · method · origin` heading and current wording.
- `record.jsonl` — one UTF-8 JSON object per live moment, oldest first. Each object has `version: 1`, the fragment id, current wording, immutable capture time, capture method and origin, correction metadata and full earlier wording rows, continuations, holds, encounters, voice metadata and transcript state, trace judgements and wording conflicts. `audio` gives the archive path and measured byte count when an original recording is present. A previously known missing recording has no `audio` file and is marked by `voice_capture.audio_missing`.
- `archived.jsonl` — older user-authored material preserved during migration, if any.
- `audio/<encoded-id>.m4a` — each retained original recording, with the id percent-encoded as a safe portable filename.

ZIP entries use UTF-8 filenames and the standard uncompressed ZIP method. Audio is copied in bounded chunks and is not duplicated in a staging directory. A missing recording that the Record had not already marked missing stops preparation rather than producing an apparently complete archive. The exporter checks measured free device space when the platform reports it and reports write errors. ZIP's classic 4 GiB and 65,535-file limits produce explicit errors.

The SQLite backup freezes one logical Record state before writing begins. Both text representations and the audio manifest read that snapshot in bounded pages, while capture can continue in the live database. Original audio is copied later from its retained file, without a long database transaction. A missing recording, or one whose size or modification time changes while copied, stops the export; the ZIP is discarded. Audio files are treated as immutable after recording. This is a portable export for reading and external tools, **not** a restorable Chinotto backup.
