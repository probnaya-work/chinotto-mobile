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
      let view = UIView(frame: window.bounds)
      view.backgroundColor = UIColor(red: 20 / 255, green: 20 / 255, blue: 22 / 255, alpha: 1)
      view.autoresizingMask = [.flexibleWidth, .flexibleHeight]
      view.isAccessibilityElement = true
      view.accessibilityLabel = "Chinotto"
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
