import Foundation
import NaturalLanguage
import React

@objc(ThoughtMeaning)
final class ThoughtMeaning: NSObject {
  private let queue = DispatchQueue(label: "app.chinotto.thought-meaning", qos: .userInitiated)
  private var preparing = Set<String>()
  private var retryAfter: [String: TimeInterval] = [:]

  @objc(score:candidates:resolver:rejecter:)
  func score(
    _ source: String,
    candidates: [String],
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter _: @escaping RCTPromiseRejectBlock
  ) {
    queue.async {
      guard #available(iOS 17.0, *), candidates.count <= 48,
        source.utf16.count <= 240, candidates.allSatisfy({ $0.utf16.count <= 240 })
      else { resolve(nil); return }
      resolve(self.compare(source, candidates: candidates))
    }
  }

  @available(iOS 17.0, *)
  private func compare(_ source: String, candidates: [String]) -> [String: Any]? {
    guard let language = language(of: source), let model = NLContextualEmbedding(language: language)
    else { return nil }

    let recognizer = NLLanguageRecognizer()
    let comparable = candidates.map { candidate in
      recognizer.reset()
      recognizer.processString(candidate)
      return recognizer.languageHypotheses(withMaximum: 1)[language, default: 0] >= 0.65
    }
    guard comparable.contains(true) else { return nil }
    guard model.hasAvailableAssets else {
      return prepare(model) ? ["preparing": true] : nil
    }

    do {
      try model.load()
      defer { model.unload() }
      guard let query = try vector(source, model: model, language: language) else { return nil }
      let deadline = ProcessInfo.processInfo.systemUptime + 2.5
      var scores: [Any] = []
      for (text, canCompare) in zip(candidates, comparable) {
        guard ProcessInfo.processInfo.systemUptime < deadline else { return nil }
        let other = canCompare ? try vector(text, model: model, language: language) : nil
        if let other, other.count == query.count {
          let cosine = zip(query, other).reduce(0.0) { total, pair in total + pair.0 * pair.1 }
          scores.append(max(-1.0, min(1.0, cosine)))
        } else {
          scores.append(NSNull())
        }
      }
      return ["scores": scores]
    } catch {
      return nil
    }
  }

  @available(iOS 17.0, *)
  private func prepare(_ model: NLContextualEmbedding) -> Bool {
    let id = model.modelIdentifier
    if preparing.contains(id) { return true }
    guard ProcessInfo.processInfo.systemUptime >= retryAfter[id, default: 0] else { return false }
    preparing.insert(id)
    // The system fetches language-model assets. Only the model identifier stays in scope here.
    model.requestAssets { [weak self] _, _ in
      guard let self else { return }
      self.queue.async {
        self.preparing.remove(id)
        self.retryAfter[id] = ProcessInfo.processInfo.systemUptime + 60
      }
    }
    return true
  }

  private func language(of text: String) -> NLLanguage? {
    let recognizer = NLLanguageRecognizer()
    recognizer.processString(text)
    guard let language = recognizer.dominantLanguage,
      recognizer.languageHypotheses(withMaximum: 1)[language, default: 0] >= 0.65
    else { return nil }
    return language
  }

  @available(iOS 17.0, *)
  private func vector(_ text: String, model: NLContextualEmbedding, language: NLLanguage) throws -> [Double]? {
    let result = try model.embeddingResult(for: text, language: language)
    var sum = Array(repeating: 0.0, count: model.dimension)
    var lastTokenEnd = result.string.startIndex
    var invalid = false
    result.enumerateTokenVectors(in: result.string.startIndex..<result.string.endIndex) { token, range in
      guard token.count == sum.count else { invalid = true; return false }
      for index in sum.indices { sum[index] += token[index] }
      lastTokenEnd = range.upperBound
      return true
    }
    // The evidence on screen must be the passage the model compared, even at its token limit.
    guard !invalid, result.string[lastTokenEnd...].allSatisfy({ $0.isWhitespace }) else { return nil }
    let norm = sqrt(sum.reduce(0.0) { $0 + $1 * $1 })
    guard norm > 0, norm.isFinite else { return nil }
    return sum.map { $0 / norm }
  }
}
