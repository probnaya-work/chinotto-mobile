import AppIntents

@available(iOS 18, *)
struct SetQuietAppsIntent: SetValueIntent {
  static var title: LocalizedStringResource = "Set Chinotto Quiet"
  @available(iOS 27, *)
  static var allowedExecutionTargets: IntentExecutionTargets { .main }

  @Parameter(title: "Quiet") var value: Bool

  func perform() async throws -> some IntentResult {
    try QuietApps.setEnabled(value)
    return .result()
  }
}
