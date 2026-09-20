import AVFoundation
import Foundation
import React

/// Playing back retained voice audio.
///
/// Deliberately a sibling of `VoiceCaptureModule` rather than part of it: recording is the
/// load-bearing path and nothing here is allowed to reach into it. The two are mutually
/// exclusive on the surface — the record is behind a veil while somebody is speaking — so
/// they never contend for the audio session, and each configures only its own.
///
/// One player at a time. Starting a second playback stops the first, because two recordings
/// talking over each other is never what was meant, and the surface only ever shows one
/// thing as playing.
///
/// Paths arrive relative to the app's Documents directory, the same way they are given to
/// the recorder and stored in `voice_captures.audio_path`: iOS rewrites the container's
/// absolute path on reinstall, so an absolute path is a thing that expires.
@objc(AudioPlaybackModule)
final class AudioPlaybackModule: RCTEventEmitter, AVAudioPlayerDelegate {
  private static let finishedEvent = "AudioPlaybackFinished"
  private static let errorEvent = "AudioPlaybackError"

  private var player: AVAudioPlayer?
  /// What the current player belongs to, so a finish can say which moment stopped.
  private var playingId: String?

  override static func requiresMainQueueSetup() -> Bool { true }

  override func supportedEvents() -> [String]! {
    [AudioPlaybackModule.finishedEvent, AudioPlaybackModule.errorEvent]
  }

  // MARK: - API

  @objc(play:resolver:rejecter:)
  func play(
    options: NSDictionary,
    resolve: @escaping RCTPromiseResolveBlock,
    reject: @escaping RCTPromiseRejectBlock
  ) {
    guard
      let id = options["id"] as? String,
      let relativePath = options["path"] as? String
    else {
      reject("E_AUDIO_PLAYBACK", "play needs an id and a path", nil)
      return
    }

    // Whatever was playing stops without an event: it was replaced, not finished, and the
    // surface already knows because it asked for this one.
    teardown(deactivateSession: false)

    guard let url = documentsURL(for: relativePath) else {
      finish(id: id, code: "no_documents_directory")
      resolve(false)
      return
    }

    guard FileManager.default.fileExists(atPath: url.path) else {
      // The row said there was audio and there is not. The surface draws `audio gone` from
      // its own check, and this is the same answer arriving the other way.
      finish(id: id, code: "audio_missing")
      resolve(false)
      return
    }

    do {
      let session = AVAudioSession.sharedInstance()
      // `.playback` rather than `.playAndRecord`: nothing is being recorded, and this is
      // somebody's own voice being played back deliberately, so it belongs at full volume
      // through the speaker rather than the earpiece.
      try session.setCategory(.playback, mode: .spokenAudio, options: [])
      try session.setActive(true, options: [])

      let made = try AVAudioPlayer(contentsOf: url)
      made.delegate = self
      guard made.prepareToPlay(), made.play() else {
        teardown(deactivateSession: true)
        finish(id: id, code: "could_not_play")
        resolve(false)
        return
      }
      player = made
      playingId = id
      resolve(true)
    } catch {
      teardown(deactivateSession: true)
      finish(id: id, code: "could_not_play", message: error.localizedDescription)
      resolve(false)
    }
  }

  @objc func stop() {
    // A stop asked for by somebody is not a finish: they already know it stopped, and
    // saying so again would race the next thing they press.
    teardown(deactivateSession: true)
  }

  // MARK: - Delegate

  func audioPlayerDidFinishPlaying(_ player: AVAudioPlayer, successfully flag: Bool) {
    let id = playingId
    teardown(deactivateSession: true)
    if let id {
      finish(id: id, code: flag ? nil : "decode_failed")
    }
  }

  func audioPlayerDecodeErrorDidOccur(_ player: AVAudioPlayer, error: Error?) {
    let id = playingId
    teardown(deactivateSession: true)
    if let id {
      finish(id: id, code: "decode_failed", message: error?.localizedDescription)
    }
  }

  // MARK: - Lifecycle

  override func invalidate() {
    teardown(deactivateSession: true)
    super.invalidate()
  }

  // MARK: - Internals

  private func teardown(deactivateSession: Bool) {
    player?.stop()
    player?.delegate = nil
    player = nil
    playingId = nil
    if deactivateSession {
      // Best effort: another category owner may object, and that is not this module's
      // problem to solve — it has already stopped.
      try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    }
  }

  /// Reports that this moment is no longer playing, and why when there is a why.
  private func finish(id: String, code: String? = nil, message: String? = nil) {
    if let code {
      sendEvent(
        withName: AudioPlaybackModule.errorEvent,
        body: ["id": id, "code": code, "message": message ?? ""]
      )
    }
    sendEvent(withName: AudioPlaybackModule.finishedEvent, body: ["id": id])
  }

  private func documentsURL(for relativePath: String) -> URL? {
    guard
      let documents = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first
    else { return nil }
    return documents.appendingPathComponent(relativePath)
  }
}
