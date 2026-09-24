import AVFoundation
import Foundation
import React
import Speech
import UIKit

/// On-device voice capture: `AVAudioEngine` buffers written to disk, and fed to
/// `SFSpeechRecognizer` on the way past.
///
/// **The audio is the canonical material; the transcript is derived from it.** That ordering
/// is the whole design of this module and is not an implementation preference:
///
///   * the file is opened and written from the same tap that feeds the recogniser, so a
///     recording exists from the first buffer, before transcription can succeed or fail;
///   * every exit path — manual stop, silence, timeout, interruption, recogniser error —
///     closes the file and reports where it is;
///   * if the recogniser never starts, or dies halfway, the recording is unaffected and is
///     still reported. A transcription failure must never lose what somebody said.
///
/// **Recognition happens on this iPhone or not at all.** Apple's recogniser sends audio to
/// Apple's servers unless a request both *requires* on-device recognition and is made on a
/// recogniser that *supports* it — the flag alone is ignored where support is missing. So
/// every recognition task in this file is created by `onDeviceTask`, which refuses to create
/// one unless both are true, and a request only exists once its task does: without a local
/// recogniser no buffer is ever handed to Speech, and the recording simply has no words yet.
/// `__tests__/voiceOnDeviceOnly.test.ts` reads this file to keep it that way.
///
/// The microphone and speech recognition are separate permissions and are treated as such.
/// Without the microphone nothing can be recorded; without speech recognition — denied,
/// restricted, or unsupported for the language — the recording is made anyway.
///
/// Default `continuous` mode: listen until manual stop (max ~5 min).
@objc(VoiceCaptureModule)
final class VoiceCaptureModule: RCTEventEmitter {
  private static let stateEvent = "VoiceCaptureState"
  private static let partialEvent = "VoiceCapturePartial"
  private static let finalEvent = "VoiceCaptureFinal"
  private static let errorEvent = "VoiceCaptureError"

  /// Serializes taps, recognition callbacks, and timers.
  private let workQueue = DispatchQueue(label: "com.chinotto.mobile.voicecapture")

  private var engine: AVAudioEngine?

  /// The retained recording. Canonical material — see the type comment.
  private var audioFile: AVAudioFile?
  /// Path relative to the app's Documents directory. iOS rewrites the absolute container
  /// path on reinstall, so an absolute path recorded today can be wrong tomorrow.
  private var audioRelativePath: String?
  private var recordedFrames: AVAudioFramePosition = 0
  private var recordedSampleRate: Double = 0
  private var audioWriteFailure: String?

  private var request: SFSpeechAudioBufferRecognitionRequest?
  private var task: SFSpeechRecognitionTask?
  private var recognizer: SFSpeechRecognizer?
  /// What happened to recognition in this session, reported with the final event:
  /// `on_device` · `unavailable` · `denied` · `failed`. See `Recognition`.
  private var recognition = Recognition.unavailable

  /// A retained recording being read back as words (`transcribeFile`). One at a time.
  private var fileTask: SFSpeechRecognitionTask?

  private var maxTimer: DispatchSourceTimer?
  private var didEmitFinal = false

  private var lastTranscript = ""
  private var committedTranscript = ""
  private var heardSpeech = false
  private var silenceSeconds: Double = 0
  private var isListening = false
  private var isFinalizing = false
  private var continuousMode = true
  private var recognitionRestartCount = 0

  /// Continuous (GPT-style): manual stop; cap at 5 min. Burst: 10s max, ~1.25s silence after speech.
  private var maxDurationSeconds: TimeInterval = 300
  private var silenceStopSeconds: TimeInterval = 0
  private let burstMaxDurationSeconds: TimeInterval = 10
  private let burstSilenceStopSeconds: TimeInterval = 1.25
  private let idleNoSpeechSeconds: TimeInterval = 45
  private let maxRecognitionRestarts = 48
  private let speechRmsThreshold: Float = 0.022
  private let silenceRmsThreshold: Float = 0.012

  override static func requiresMainQueueSetup() -> Bool { true }

  override func supportedEvents() -> [String]! {
    [Self.stateEvent, Self.partialEvent, Self.finalEvent, Self.errorEvent]
  }

  override init() {
    super.init()
    NotificationCenter.default.addObserver(
      self,
      selector: #selector(handleResignActive),
      name: UIApplication.willResignActiveNotification,
      object: nil
    )
    NotificationCenter.default.addObserver(
      self,
      selector: #selector(handleInterruption),
      name: AVAudioSession.interruptionNotification,
      object: nil
    )
  }

  deinit {
    NotificationCenter.default.removeObserver(self)
  }

  @objc private func handleResignActive() {
    workQueue.async { [weak self] in
      self?.finalizeCapture(reason: "background", errorToEmit: nil)
    }
  }

  @objc private func handleInterruption(_ notification: Notification) {
    guard
      let value = notification.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt,
      let type = AVAudioSession.InterruptionType(rawValue: value),
      type == .began
    else { return }
    workQueue.async { [weak self] in
      self?.finalizeCapture(reason: "interruption", errorToEmit: nil)
    }
  }

  // MARK: - React API

  @objc(start:resolver:rejecter:)
  func start(
    _ options: NSDictionary?,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    workQueue.async { [weak self] in
      guard let self else { return }
      if self.isListening {
        DispatchQueue.main.async { resolve(nil) }
        return
      }

      // The microphone is the only permission a recording needs. Speech recognition is
      // asked for afterwards, and only decides whether this recording also gets words.
      self.requestMicrophone { granted in
        guard granted else {
          let message = "Microphone access is not authorized."
          DispatchQueue.main.async {
            reject("E_VOICE_PERMISSION", message, nil)
            self.emitError(code: "permission_denied", message: message)
          }
          return
        }

        let localeIdentifier = options?["locale"] as? String
        let locale = localeIdentifier.map { Locale(identifier: $0) } ?? Locale.current
        self.resolveRecognizer(locale: locale, mayAsk: true) { speechRec, status in
          self.workQueue.async {
            self.startSession(
              options: options,
              recognizer: speechRec,
              recognition: status,
              resolve: resolve,
              reject: reject
            )
          }
        }
      }
    }
  }

  @objc func stop() {
    workQueue.async { [weak self] in
      self?.finalizeCapture(reason: "manual", errorToEmit: nil)
    }
  }

  /// Reads a retained recording back as words, on this iPhone only.
  ///
  /// Resolves `{ status, text? }`, never rejects for a recognition outcome:
  /// `ok` · `no_speech` · `unavailable` · `denied` · `failed` · `busy` · `missing`.
  /// Never asks for a permission — a retry happens in the background, and a prompt is only
  /// ever raised by somebody holding the circle.
  @objc(transcribeFile:resolver:rejecter:)
  func transcribeFile(
    _ relativePath: NSString,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    workQueue.async { [weak self] in
      guard let self else { return }
      let answer: (String, String?) -> Void = { status, text in
        var body: [String: Any] = ["status": status]
        if let text { body["text"] = text }
        DispatchQueue.main.async { resolve(body) }
      }

      // A live recording owns the recogniser and the audio session; a retry can wait.
      if self.isListening || self.fileTask != nil {
        answer("busy", nil)
        return
      }
      guard let url = self.retainedAudioURL(relativePath as String) else {
        answer("missing", nil)
        return
      }

      self.resolveRecognizer(locale: Locale.current, mayAsk: false) { speechRec, status in
        self.workQueue.async {
          guard let speechRec, status == .onDevice else {
            answer(status == .denied ? "denied" : "unavailable", nil)
            return
          }
          if self.isListening || self.fileTask != nil {
            answer("busy", nil)
            return
          }

          let fileRequest = SFSpeechURLRecognitionRequest(url: url)
          fileRequest.shouldReportPartialResults = false

          var settled = false
          let settle: (String, String?) -> Void = { status, text in
            // Called on `workQueue` only.
            guard !settled else { return }
            settled = true
            self.fileTask?.cancel()
            self.fileTask = nil
            answer(status, text)
          }

          let task = Self.onDeviceTask(recognizer: speechRec, request: fileRequest) { result, error in
            self.workQueue.async {
              if let result, result.isFinal {
                let text = result.bestTranscription.formattedString
                  .trimmingCharacters(in: .whitespacesAndNewlines)
                settle(text.isEmpty ? "no_speech" : "ok", text.isEmpty ? nil : text)
                return
              }
              if let error {
                let ns = error as NSError
                // 1110: no speech detected in the audio. A real answer, not a failure.
                if ns.domain == "kAFAssistantErrorDomain", ns.code == 1110 {
                  settle("no_speech", nil)
                } else {
                  settle("failed", nil)
                }
              }
            }
          }
          guard let task else {
            answer("unavailable", nil)
            return
          }
          self.fileTask = task

          // A recogniser that never answers must not hold the next retry hostage.
          self.workQueue.asyncAfter(deadline: .now() + 120) {
            if self.fileTask === task { settle("failed", nil) }
          }
        }
      }
    }
  }

  /// Whether this iPhone can read speech back as words locally right now, for the current
  /// language. Asks nothing: `not_determined` means nobody has held the circle yet.
  @objc(localRecognitionStatus:rejecter:)
  func localRecognitionStatus(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    if SFSpeechRecognizer.authorizationStatus() == .notDetermined {
      resolve("not_determined")
      return
    }
    resolveRecognizer(locale: Locale.current, mayAsk: false) { _, status in
      DispatchQueue.main.async {
        switch status {
        case .onDevice: resolve("available")
        case .denied: resolve("denied")
        default: resolve("unavailable")
        }
      }
    }
  }

  // MARK: - Permissions

  private func requestMicrophone(completion: @escaping (Bool) -> Void) {
    if #available(iOS 17.0, *) {
      AVAudioApplication.requestRecordPermission { granted in completion(granted) }
    } else {
      AVAudioSession.sharedInstance().requestRecordPermission { granted in completion(granted) }
    }
  }

  /// What recognition can be done for `locale`, on this iPhone.
  ///
  /// Hands back a recogniser only when speech recognition is authorised **and** the
  /// recogniser supports on-device recognition **and** is available now. Anything else is a
  /// complete answer — the recording is made either way.
  ///
  /// `mayAsk` raises the speech prompt when nobody has answered it yet. Only a capture does
  /// that: speech recognition is asked for when it is about to be used, never in passing.
  private func resolveRecognizer(
    locale: Locale,
    mayAsk: Bool,
    completion: @escaping (SFSpeechRecognizer?, Recognition) -> Void
  ) {
    let decide: (SFSpeechRecognizerAuthorizationStatus) -> Void = { status in
      guard status == .authorized else {
        completion(nil, .denied)
        return
      }
      guard
        let speechRec = SFSpeechRecognizer(locale: locale),
        speechRec.supportsOnDeviceRecognition,
        speechRec.isAvailable
      else {
        completion(nil, .unavailable)
        return
      }
      completion(speechRec, .onDevice)
    }

    let status = SFSpeechRecognizer.authorizationStatus()
    if status == .notDetermined, mayAsk {
      SFSpeechRecognizer.requestAuthorization { answered in decide(answered) }
    } else {
      decide(status)
    }
  }

  /// **The only way a recognition task is created in this module.**
  ///
  /// Returns nil — and so no task, and no request that anything is appended to — unless the
  /// recogniser supports on-device recognition and the request requires it. Apple ignores
  /// `requiresOnDeviceRecognition` where support is missing, so setting the flag is not
  /// enough on its own: the support check is what makes the flag mean anything.
  static func onDeviceTask(
    recognizer: SFSpeechRecognizer,
    request: SFSpeechRecognitionRequest,
    resultHandler: @escaping (SFSpeechRecognitionResult?, Error?) -> Void
  ) -> SFSpeechRecognitionTask? {
    guard recognizer.supportsOnDeviceRecognition else { return nil }
    request.requiresOnDeviceRecognition = true
    guard request.requiresOnDeviceRecognition else { return nil }
    return recognizer.recognitionTask(with: request, resultHandler: resultHandler)
  }

  /// A retained recording's location, only when it is one of ours and is there.
  ///
  /// Paths arrive from JavaScript and are relative to Documents. Anything that is not a
  /// plain file directly under `chinotto/audio/` is refused rather than normalised.
  private func retainedAudioURL(_ relativePath: String) -> URL? {
    let prefix = "chinotto/audio/"
    guard relativePath.hasPrefix(prefix) else { return nil }
    let name = String(relativePath.dropFirst(prefix.count))
    guard
      !name.isEmpty,
      !name.contains("/"),
      !name.hasPrefix("."),
      name.range(of: "^[A-Za-z0-9._-]+$", options: .regularExpression) != nil
    else { return nil }

    let directory = documentsDirectory.appendingPathComponent(prefix, isDirectory: true)
      .standardizedFileURL
    let url = directory.appendingPathComponent(name).standardizedFileURL
    guard url.deletingLastPathComponent().path == directory.path else { return nil }
    guard FileManager.default.fileExists(atPath: url.path) else { return nil }
    return url
  }

  // MARK: - Session

  private func startSession(
    options: NSDictionary?,
    recognizer speechRec: SFSpeechRecognizer?,
    recognition status: Recognition,
    resolve: @escaping RCTPromiseResolveBlock,
    reject: @escaping RCTPromiseRejectBlock
  ) {
    if isListening {
      DispatchQueue.main.async { resolve(nil) }
      return
    }
    lastTranscript = ""
    committedTranscript = ""
    heardSpeech = false
    silenceSeconds = 0
    isFinalizing = false
    didEmitFinal = false
    recognitionRestartCount = 0
    audioFile = nil
    audioRelativePath = nil
    recordedFrames = 0
    recordedSampleRate = 0
    audioWriteFailure = nil
    request = nil
    task = nil

    if let continuous = options?["continuous"] as? Bool {
      continuousMode = continuous
    } else {
      continuousMode = true
    }
    if continuousMode {
      maxDurationSeconds = 300
      silenceStopSeconds = 0
    } else {
      maxDurationSeconds = burstMaxDurationSeconds
      silenceStopSeconds = burstSilenceStopSeconds
    }

    // No local recogniser is not a reason to refuse to listen. It means this recording
    // has no words yet — which the record already knows how to say.
    recognizer = speechRec
    recognition = status

    do {
      let session = AVAudioSession.sharedInstance()
      try session.setCategory(
        .playAndRecord,
        mode: .measurement,
        options: [.duckOthers, .interruptSpokenAudioAndMixWithOthers]
      )
      try session.setActive(true, options: .notifyOthersOnDeactivation)
    } catch {
      DispatchQueue.main.async {
        reject("E_VOICE_CAPTURE", error.localizedDescription, error)
        self.emitError(code: "audio_session", message: error.localizedDescription)
      }
      return
    }

    let audioEngine = AVAudioEngine()
    engine = audioEngine
    let input = audioEngine.inputNode
    let format = input.outputFormat(forBus: 0)

    // Opened BEFORE the recogniser, so the recording is already under way by the time
    // anything can go wrong with transcription. A failure here is reported and does not
    // stop the capture: hearing yourself back later is better than nothing, but not being
    // able to speak at all is worse than either.
    if let fileName = options?["audioFileName"] as? String {
      openAudioFile(named: fileName, sourceFormat: format)
    }

    input.removeTap(onBus: 0)
    input.installTap(onBus: 0, bufferSize: 1024, format: format) { [weak self] buffer, _ in
      self?.workQueue.async {
        self?.processAudioBuffer(buffer)
      }
    }

    if let speechRec, !attachRecognitionTask(to: speechRec) {
      // Could not start locally. The recording goes ahead without words.
      recognizer = nil
      recognition = .unavailable
    }

    do {
      try audioEngine.start()
    } catch {
      tearDownAudioSilently()
      DispatchQueue.main.async {
        reject("E_VOICE_CAPTURE", error.localizedDescription, error)
        self.emitError(code: "start_failed", message: error.localizedDescription)
      }
      return
    }

    isListening = true
    startMaxDurationTimer()

    DispatchQueue.main.async {
      self.sendEvent(withName: Self.stateEvent, body: ["state": "listening"])
      resolve(nil)
    }
  }

  private func startMaxDurationTimer() {
    maxTimer?.cancel()
    let timer = DispatchSource.makeTimerSource(queue: workQueue)
    timer.schedule(deadline: .now() + maxDurationSeconds)
    timer.setEventHandler { [weak self] in
      self?.finalizeCapture(reason: "max_duration", errorToEmit: nil)
    }
    timer.resume()
    maxTimer = timer
  }

  // MARK: - Audio + recognition

  private func processAudioBuffer(_ buffer: AVAudioPCMBuffer) {
    guard isListening, !isFinalizing else { return }

    // The recording first, and unconditionally. `request` may be nil because the recogniser
    // failed or was torn down mid-session; that must not cost the audio.
    writeToAudioFile(buffer)

    // Only a request that `onDeviceTask` accepted exists; without one nothing reaches
    // Speech. Silence and idle handling below run either way.
    request?.append(buffer)

    let rms = rmsFloat(buffer)
    let sampleRate = buffer.format.sampleRate
    guard sampleRate > 0 else { return }
    let dt = Double(buffer.frameLength) / sampleRate

    if rms >= speechRmsThreshold {
      heardSpeech = true
      silenceSeconds = 0
    } else if continuousMode {
      if !heardSpeech {
        silenceSeconds += dt
        if silenceSeconds >= idleNoSpeechSeconds {
          finalizeCapture(reason: "idle", errorToEmit: nil)
        }
      }
    } else if heardSpeech, rms < silenceRmsThreshold, silenceStopSeconds > 0 {
      silenceSeconds += dt
      if silenceSeconds >= silenceStopSeconds {
        finalizeCapture(reason: "silence", errorToEmit: nil)
      }
    }
  }

  private func processRecognition(result: SFSpeechRecognitionResult?, error: Error?) {
    if let result {
      guard isListening else { return }
      let live = result.bestTranscription.formattedString
      if !live.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
        heardSpeech = true
        silenceSeconds = 0
      }
      let display = composeDisplayTranscript(live: live)
      lastTranscript = display
      DispatchQueue.main.async {
        self.sendEvent(withName: Self.partialEvent, body: ["text": display])
      }

      if result.isFinal {
        if continuousMode {
          commitSegment(live)
          if !restartRecognitionTask() {
            finalizeCapture(reason: "segment_end", errorToEmit: nil)
          }
        } else {
          finalizeCapture(reason: "final", errorToEmit: nil)
        }
        return
      }
    }

    if let error {
      if !isListening { return }
      let ns = error as NSError
      if ns.domain == "kAFAssistantErrorDomain", ns.code == 216 { return }
      if ns.domain == "kAFAssistantErrorDomain", ns.code == 203 { return }
      if continuousMode, isRecoverableRecognitionError(ns), restartRecognitionTask() {
        return
      }
      recognition = .failed
      finalizeCapture(reason: "recognition_error", errorToEmit: error)
    }
  }

  /// Keeps mic/engine running; starts a fresh recognition request for the next phrase.
  private func restartRecognitionTask() -> Bool {
    guard continuousMode, isListening, !isFinalizing, let speechRec = recognizer else { return false }
    guard recognitionRestartCount < maxRecognitionRestarts else { return false }
    recognitionRestartCount += 1

    task?.cancel()
    task = nil
    request?.endAudio()
    request = nil

    // If the next phrase cannot be recognised locally, the recording carries on without it
    // rather than ending: the audio is what matters, and the words so far are kept.
    if !attachRecognitionTask(to: speechRec) {
      recognizer = nil
    }
    return true
  }

  /// Starts a recognition task on a fresh request — through `onDeviceTask`, and only then
  /// keeps the request, so a buffer is appended to nothing that is not on-device.
  private func attachRecognitionTask(to speechRec: SFSpeechRecognizer) -> Bool {
    let speechRequest = SFSpeechAudioBufferRecognitionRequest()
    speechRequest.shouldReportPartialResults = true

    let newTask = Self.onDeviceTask(recognizer: speechRec, request: speechRequest) {
      [weak self] result, error in
      self?.workQueue.async {
        self?.processRecognition(result: result, error: error)
      }
    }
    guard let newTask else {
      request = nil
      task = nil
      return false
    }
    request = speechRequest
    task = newTask
    return true
  }

  private func composeDisplayTranscript(live: String) -> String {
    let liveTrim = live.trimmingCharacters(in: .whitespacesAndNewlines)
    if committedTranscript.isEmpty { return liveTrim }
    if liveTrim.isEmpty { return committedTranscript }
    return committedTranscript + " " + liveTrim
  }

  private func commitSegment(_ text: String) {
    let segment = text.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !segment.isEmpty else { return }
    if committedTranscript.isEmpty {
      committedTranscript = segment
    } else {
      committedTranscript += " " + segment
    }
    lastTranscript = committedTranscript
  }

  private func isRecoverableRecognitionError(_ error: NSError) -> Bool {
    guard error.domain == "kAFAssistantErrorDomain" else { return false }
    switch error.code {
    case 1110, 209, 301: // no speech / retryable phrase boundaries
      return true
    default:
      return false
    }
  }

  private func rmsFloat(_ buffer: AVAudioPCMBuffer) -> Float {
    guard let data = buffer.floatChannelData else { return 0 }
    let n = Int(buffer.frameLength)
    if n == 0 { return 0 }
    var sum: Float = 0
    let channel = data[0]
    for i in 0..<n {
      let s = channel[i]
      sum += s * s
    }
    return sqrt(sum / Float(n))
  }

  // MARK: - Teardown

  private func finalizeCapture(reason: String, errorToEmit: Error?) {
    guard isListening, !isFinalizing else { return }
    isFinalizing = true
    isListening = false

    maxTimer?.cancel()
    maxTimer = nil

    if let input = engine?.inputNode { input.removeTap(onBus: 0) }
    engine?.stop()
    engine = nil

    request?.endAudio()
    request = nil

    task?.cancel()
    task = nil
    recognizer = nil

    try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)

    let audio = closeAudioFile()

    let text = lastTranscript
    lastTranscript = ""
    committedTranscript = ""
    heardSpeech = false
    silenceSeconds = 0
    recognitionRestartCount = 0

    emitFinalIfNeeded(text: text, reason: reason, audio: audio)

    DispatchQueue.main.async {
      if let errorToEmit {
        self.emitError(code: "recognition_error", message: errorToEmit.localizedDescription)
      }
      self.sendEvent(withName: Self.stateEvent, body: ["state": "idle"])
    }

    isFinalizing = false
  }

  /// Only for a session that never started. Anything that recorded goes through
  /// `finalizeCapture`, which reports its audio.
  private func tearDownAudioSilently() {
    _ = closeAudioFile()
    maxTimer?.cancel()
    maxTimer = nil
    if let input = engine?.inputNode { input.removeTap(onBus: 0) }
    engine?.stop()
    engine = nil
    request?.endAudio()
    request = nil
    task?.cancel()
    task = nil
    recognizer = nil
    try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    isListening = false
    isFinalizing = false
  }

  private func emitFinalIfNeeded(text: String, reason: String, audio: RetainedAudio?) {
    guard !didEmitFinal else { return }
    didEmitFinal = true
    var payload: [String: Any] = [
      "text": text,
      "reason": reason,
      "recognition": recognition.rawValue,
    ]
    if let audio {
      payload["audioPath"] = audio.relativePath
      payload["durationMs"] = audio.durationMs
    }
    if let failure = audioWriteFailure {
      payload["audioFailure"] = failure
    }
    DispatchQueue.main.async {
      self.sendEvent(withName: Self.finalEvent, body: payload)
    }
  }

  // MARK: - Retained audio

  /// What recognition did for a session, as JavaScript is told it.
  enum Recognition: String {
    /// Recognised on this iPhone (`requiresOnDeviceRecognition`, on a recogniser that supports it).
    case onDevice = "on_device"
    /// Not supported or not available for this language on this iPhone. No task was made.
    case unavailable
    /// Speech recognition is not authorised. No task was made.
    case denied
    /// Recognised on this iPhone until the recogniser failed. The audio is unaffected.
    case failed
  }

  struct RetainedAudio {
    let relativePath: String
    let durationMs: Int
  }

  private var documentsDirectory: URL {
    FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
  }

  /// Opens the recording. AAC in an m4a container, at the input's own sample rate and
  /// channel count, so nothing is resampled on the way in.
  private func openAudioFile(named relativePath: String, sourceFormat: AVAudioFormat) {
    let url = documentsDirectory.appendingPathComponent(relativePath)
    do {
      try FileManager.default.createDirectory(
        at: url.deletingLastPathComponent(),
        withIntermediateDirectories: true
      )
      let settings: [String: Any] = [
        AVFormatIDKey: kAudioFormatMPEG4AAC,
        AVSampleRateKey: sourceFormat.sampleRate,
        AVNumberOfChannelsKey: Int(sourceFormat.channelCount),
      ]
      audioFile = try AVAudioFile(
        forWriting: url,
        settings: settings,
        commonFormat: sourceFormat.commonFormat,
        interleaved: sourceFormat.isInterleaved
      )
      audioRelativePath = relativePath
      recordedSampleRate = sourceFormat.sampleRate
    } catch {
      // Capture continues without a recording rather than refusing to listen.
      audioFile = nil
      audioRelativePath = nil
      audioWriteFailure = error.localizedDescription
    }
  }

  private func writeToAudioFile(_ buffer: AVAudioPCMBuffer) {
    guard let file = audioFile else { return }
    do {
      try file.write(from: buffer)
      recordedFrames += AVAudioFramePosition(buffer.frameLength)
    } catch {
      // Stop writing, keep what is already on disk, and say what happened. A full volume
      // mid-sentence should cost the rest of the sentence, not the whole recording.
      audioFile = nil
      audioWriteFailure = error.localizedDescription
    }
  }

  /// Closes the file and returns where it is. Nil when nothing was ever recorded.
  private func closeAudioFile() -> RetainedAudio? {
    let path = audioRelativePath
    let frames = recordedFrames
    let rate = recordedSampleRate

    // AVAudioFile finalises the container when the last reference goes.
    audioFile = nil
    audioRelativePath = nil
    recordedFrames = 0
    recordedSampleRate = 0

    guard let path, frames > 0, rate > 0 else { return nil }
    return RetainedAudio(
      relativePath: path,
      durationMs: Int((Double(frames) / rate) * 1000.0)
    )
  }

  private func emitError(code: String, message: String) {
    sendEvent(withName: Self.errorEvent, body: ["code": code, "message": message])
  }
}
