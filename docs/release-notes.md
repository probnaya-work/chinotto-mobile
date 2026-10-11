# iOS 2.1.0 (build 42) — internal TestFlight candidate

- Export a portable ZIP of the local Record, including correction history and retained original audio. Export works offline; import and restore are not part of this release.
- Keep local capture available without an account. When optional sync is enabled, a removal on either device erases the local content on the other device. Pending offline deletions remain queued through restart and reconnect.
- Keep voice transcription across pauses and preserve recordings when words are unavailable. The first tap prepares microphone and speech permissions; a later deliberate tap starts recording. Locked capture and discard remain available.
- Improve Settings accessibility and wording, selected-row controls on narrow screens, and launch presentation. Add an expandable interaction reference in Settings for Find, voice, Continue, Correct, and date navigation.

Find continues to use the existing interaction. The separate Find affordance study is not included in the production surface.
