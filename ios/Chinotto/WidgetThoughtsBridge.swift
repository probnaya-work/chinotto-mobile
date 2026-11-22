import Foundation
import UIKit
import React
import WidgetKit

@objc(WidgetThoughtsBridge)
final class WidgetThoughtsBridge: NSObject {
  private static let appGroupId = "group.com.chinotto.mobile"
  private static let thoughtsKey = "chinotto_widget_recent_thoughts_v1"
  @objc var methodQueue: DispatchQueue { DispatchQueue.main }

  @objc
  static func requiresMainQueueSetup() -> Bool {
    false
  }

  @objc(protectionEnabled:rejecter:)
  func protectionEnabled(_ resolve: RCTPromiseResolveBlock, rejecter reject: RCTPromiseRejectBlock) {
    resolve(UserDefaults(suiteName: Self.appGroupId)?.bool(forKey: RecordPrivacyGuard.protectionKey) ?? true)
  }

  @objc(setRecentThoughts:resolver:rejecter:)
  func setRecentThoughts(
    _ json: String,
    resolver resolve: RCTPromiseResolveBlock,
    rejecter reject: RCTPromiseRejectBlock
  ) {
    guard let defaults = UserDefaults(suiteName: Self.appGroupId) else {
      reject("no_app_group", "Unable to open app group user defaults", nil)
      return
    }
    // Native enforcement also rejects refreshes queued before protection was enabled.
    if defaults.bool(forKey: RecordPrivacyGuard.protectionKey) {
      defaults.removeObject(forKey: Self.thoughtsKey)
    } else {
      defaults.set(json, forKey: Self.thoughtsKey)
    }
    WidgetCenter.shared.reloadAllTimelines()
    resolve(nil)
  }
}

// The privacy cover must render even while React is waiting for system authentication.
// Match Mark.tsx's full rung; opacity alone gives it a quiet breath, without a timed gate.
private final class RecordPrivacyCover: UIView {
  private let mark = CAShapeLayer()

  init(frame: CGRect, style: UIUserInterfaceStyle) {
    super.init(frame: frame)
    autoresizingMask = [.flexibleWidth, .flexibleHeight]
    let light = style == .light
    backgroundColor = light
      ? UIColor(red: 238 / 255, green: 234 / 255, blue: 225 / 255, alpha: 1)
      : UIColor(red: 20 / 255, green: 20 / 255, blue: 22 / 255, alpha: 1)
    let ink = light
      ? UIColor(red: 52 / 255, green: 51 / 255, blue: 45 / 255, alpha: 1)
      : UIColor(red: 212 / 255, green: 211 / 255, blue: 206 / 255, alpha: 1)

    // One compound filled path: a fine ring and three descending dots.
    let path = UIBezierPath(ovalIn: CGRect(x: 3, y: 3, width: 58, height: 58))
    path.append(UIBezierPath(ovalIn: CGRect(x: 5, y: 5, width: 54, height: 54)))
    for (y, radius) in [(23.0, 8.0), (38.0, 4.5), (47.5, 2.5)] {
      path.append(UIBezierPath(ovalIn: CGRect(x: 32 - radius, y: y - radius,
                                            width: radius * 2, height: radius * 2)))
    }
    mark.path = path.cgPath
    mark.fillRule = .evenOdd
    mark.fillColor = ink.cgColor
    mark.bounds = CGRect(x: 0, y: 0, width: 64, height: 64)
    mark.setAffineTransform(CGAffineTransform(scaleX: 1.125, y: 1.125))
    layer.addSublayer(mark)
    isAccessibilityElement = true
    accessibilityLabel = "Chinotto"
    accessibilityViewIsModal = true
    NotificationCenter.default.addObserver(self, selector: #selector(updateMotion),
      name: UIAccessibility.reduceMotionStatusDidChangeNotification, object: nil)
    updateMotion()
  }

  required init?(coder: NSCoder) { return nil }

  deinit { NotificationCenter.default.removeObserver(self) }

  override func layoutSubviews() {
    super.layoutSubviews()
    CATransaction.begin()
    CATransaction.setDisableActions(true)
    mark.position = CGPoint(x: bounds.midX, y: bounds.midY)
    CATransaction.commit()
  }

  @objc private func updateMotion() {
    mark.removeAnimation(forKey: "breath")
    guard !UIAccessibility.isReduceMotionEnabled else { return }
    let breath = CAKeyframeAnimation(keyPath: "opacity")
    breath.values = [0.52, 1.0, 0.52]
    breath.keyTimes = [0, 0.5, 1]
    breath.timingFunctions = [CAMediaTimingFunction(name: .easeInEaseOut),
                              CAMediaTimingFunction(name: .easeInEaseOut)]
    breath.duration = 1.8
    breath.repeatCount = .infinity
    mark.add(breath, forKey: "breath")
  }
}

// Kept in the existing bridge source so both the committed project and prebuild include it.
// UIKit covers the window synchronously; React acknowledges the safe foreground render.
final class RecordPrivacyGuard {
  static let shared = RecordPrivacyGuard()
  static let protectionKey = "chinotto_record_protection_v1"
  private let defaults = UserDefaults(suiteName: "group.com.chinotto.mobile")!
  private(set) var epoch = 0
  private(set) var locked: Bool
  private var cover: UIView?
  weak var window: UIWindow?
  var enabled: Bool { defaults.bool(forKey: Self.protectionKey) }

  private init() {
    locked = UserDefaults(suiteName: "group.com.chinotto.mobile")!.bool(forKey: Self.protectionKey)
  }

  func conceal() {
    guard enabled, let window else { return }
    window.rootViewController?.view.accessibilityElementsHidden = true
    if cover == nil {
      let view = RecordPrivacyCover(frame: window.bounds, style: window.traitCollection.userInterfaceStyle)
      window.addSubview(view)
      cover = view
    }
    if let cover { window.bringSubviewToFront(cover) }
  }

  func background() {
    epoch += 1
    if enabled { locked = true; conceal() }
  }

  func snapshot() -> [String: Any] {
    ["enabled": enabled, "locked": locked, "epoch": epoch]
  }

  func complete(_ action: String, epoch expected: Int) throws {
    guard expected == epoch, UIApplication.shared.applicationState != .background else {
      throw NSError(domain: "RecordPrivacy", code: 1)
    }
    switch action {
    case "enable", "disable":
      let enable = action == "enable"
      if enable != enabled { epoch += 1 }
      defaults.set(enable, forKey: Self.protectionKey)
      // Erase the cache before asking WidgetKit to replace its rendered timeline.
      defaults.removeObject(forKey: "chinotto_widget_recent_thoughts_v1")
      defaults.synchronize()
      WidgetCenter.shared.reloadAllTimelines()
    case "unlock": break
    default: throw NSError(domain: "RecordPrivacy", code: 2)
    }
    locked = false
  }

  func rendered(_ expected: Int) {
    guard expected == epoch, UIApplication.shared.applicationState == .active else { return }
    window?.rootViewController?.view.accessibilityElementsHidden = false
    cover?.removeFromSuperview()
    cover = nil
  }
}

@objc(RecordPrivacy)
final class RecordPrivacy: NSObject {
  @objc static func requiresMainQueueSetup() -> Bool { true }
  @objc var methodQueue: DispatchQueue { DispatchQueue.main }

  @objc(state:rejecter:)
  func state(_ resolve: RCTPromiseResolveBlock, rejecter reject: RCTPromiseRejectBlock) {
    resolve(RecordPrivacyGuard.shared.snapshot())
  }

  @objc(complete:epoch:resolver:rejecter:)
  func complete(_ action: String, epoch: Int, resolver resolve: RCTPromiseResolveBlock, rejecter reject: RCTPromiseRejectBlock) {
    do {
      try RecordPrivacyGuard.shared.complete(action, epoch: epoch)
      resolve(RecordPrivacyGuard.shared.snapshot())
    } catch { reject("privacy_stale", "The app was locked. Try again.", error) }
  }

  @objc(rendered:resolver:rejecter:)
  func rendered(_ epoch: Int, resolver resolve: RCTPromiseResolveBlock, rejecter reject: RCTPromiseRejectBlock) {
    RecordPrivacyGuard.shared.rendered(epoch)
    resolve(nil)
  }
}
