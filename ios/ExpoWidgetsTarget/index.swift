import WidgetKit
import SwiftUI

@main
struct ExportWidgets0: WidgetBundle {
  var body: some Widget {
    CaptureHomeWidget()
    QuietCaptureWidget()
    #if DEBUG
    if #available(iOS 18, *) { QuietAppsControl() }
    #endif
  }
}
