import AppIntents
import SwiftUI
import WidgetKit

@available(iOS 18, *)
struct QuietAppsControl: ControlWidget {
  struct Provider: ControlValueProvider {
    let previewValue = false
    func currentValue() async throws -> Bool { QuietApps.enabled }
  }

  var body: some ControlWidgetConfiguration {
    StaticControlConfiguration(kind: QuietApps.controlKind, provider: Provider()) { enabled in
      ControlWidgetToggle("Quiet", isOn: enabled, action: SetQuietAppsIntent()) { on in
        Label(on ? "On" : "Off", systemImage: on ? "moon.fill" : "moon")
      }
    }
    .displayName("Chinotto Quiet")
    .description("Hide or restore the apps you selected in Chinotto.")
  }
}
