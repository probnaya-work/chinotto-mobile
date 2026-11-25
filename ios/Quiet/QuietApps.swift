import FamilyControls
import Foundation
import ManagedSettings
import WidgetKit

// Both the app and its Control Center extension use this named store.
// Its restriction is the source of truth, including after a cold launch.
enum QuietApps {
  static let controlKind = "com.chinotto.mobile.quiet-apps"
  private static let store = ManagedSettingsStore(named: .init("chinotto-quiet"))
  private static let defaults = UserDefaults(suiteName: "group.com.chinotto.mobile")
  private static let selectionKey = "quiet-app-selection-v1"

  static var enabled: Bool { !(store.application.blockedApplications ?? []).isEmpty }

  static var authorized: Bool {
    let status = AuthorizationCenter.shared.authorizationStatus
    if #available(iOS 26.4, *), status == .approvedWithDataAccess { return true }
    return status == .approved
  }

  static func selection() throws -> FamilyActivitySelection {
    guard let defaults else { throw QuietError.storage }
    guard let data = defaults.data(forKey: selectionKey) else { return FamilyActivitySelection() }
    return try JSONDecoder().decode(FamilyActivitySelection.self, from: data)
  }

  static func save(_ selection: FamilyActivitySelection) throws {
    guard authorized else { throw QuietError.permission }
    guard !enabled else { throw QuietError.active }
    guard selection.categoryTokens.isEmpty, selection.webDomainTokens.isEmpty,
          selection.applicationTokens.count <= 50 else { throw QuietError.appsOnly }
    guard let defaults else { throw QuietError.storage }
    defaults.set(try JSONEncoder().encode(selection), forKey: selectionKey)
  }

  static func setEnabled(_ value: Bool) throws {
    if value {
      guard authorized else { throw QuietError.permission }
      let apps = try selection().applications
      guard !apps.isEmpty else { throw QuietError.empty }
      store.application.blockedApplications = apps
    } else {
      // Always allow recovery, even after loss of permission or an unreadable selection.
      store.clearAllSettings()
    }
    if #available(iOS 18, *) { ControlCenter.shared.reloadControls(ofKind: controlKind) }
  }

  enum QuietError: LocalizedError {
    case storage, permission, active, appsOnly, empty
    var errorDescription: String? {
      switch self {
      case .storage: return "Couldn’t access your saved selection. Open Quiet guide in Chinotto and choose apps again."
      case .permission: return "Open Quiet guide in Chinotto to allow Screen Time access."
      case .active: return "Turn Quiet off before changing your apps."
      case .appsOnly: return "Select up to 50 individual apps. Expand a category to choose its apps and leave websites unselected."
      case .empty: return "Open Quiet guide in Chinotto and choose apps first."
      }
    }
  }
}
