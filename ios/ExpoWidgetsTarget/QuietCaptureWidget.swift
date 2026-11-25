import SwiftUI
import WidgetKit

/// A capture entrance with no access to the Record or shared thought payloads.
struct QuietCaptureWidget: Widget {
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: "QuietCaptureWidget", provider: QuietCaptureTimeline()) { entry in
      QuietCaptureWidgetView(date: entry.date)
    }
    .configurationDisplayName("Chinotto Quiet")
    .description("Open Quiet, write a thought, or capture one by voice.")
    .supportedFamilies([.systemLarge])
  }
}

private struct QuietCaptureEntry: TimelineEntry {
  let date: Date
}

private struct QuietCaptureTimeline: TimelineProvider {
  func placeholder(in context: Context) -> QuietCaptureEntry {
    QuietCaptureEntry(date: Date())
  }

  func getSnapshot(in context: Context, completion: @escaping (QuietCaptureEntry) -> Void) {
    completion(QuietCaptureEntry(date: Date()))
  }

  func getTimeline(in context: Context, completion: @escaping (Timeline<QuietCaptureEntry>) -> Void) {
    let now = Date()
    let calendar = Calendar.current
    let today = calendar.startOfDay(for: now)
    // Supply future midnights so the date changes even if a reload is deferred by iOS.
    let midnights = (1...7).compactMap { calendar.date(byAdding: .day, value: $0, to: today) }
    let entries = ([now] + midnights).map { QuietCaptureEntry(date: $0) }
    completion(Timeline(entries: entries, policy: .atEnd))
  }
}

private struct QuietCaptureWidgetView: View {
  let date: Date
  @Environment(\.colorScheme) private var scheme

  private let quietURL = URL(string: "chinotto://quiet")!
  private let textURL = URL(string: "chinotto://capture")!
  private let voiceURL = URL(string: "chinotto://capture?mode=voice")!

  private var content: some View {
    VStack(alignment: .leading, spacing: 0) {
      HStack(alignment: .firstTextBaseline) {
        Text("Chinotto")
          .font(.system(size: 16, weight: .medium))
          .foregroundStyle(WidgetInk.ink(scheme))
        Spacer(minLength: 12)
        Text(date, format: .dateTime.month(.abbreviated).day())
          .font(.system(size: 12))
          .foregroundStyle(WidgetInk.meta(scheme))
          .lineLimit(1)
      }

      Link(destination: quietURL) {
        HStack(alignment: .firstTextBaseline, spacing: 10) {
          Text("Open Quiet")
            .font(.system(.largeTitle, design: .serif))
          Image(systemName: "arrow.right")
            .font(.title2.weight(.light))
            .accessibilityHidden(true)
        }
        .lineLimit(1)
        .minimumScaleFactor(0.7)
        .padding(.top, 44)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
        .contentShape(Rectangle())
      }
      .foregroundStyle(WidgetInk.ink(scheme))
      .accessibilityLabel("Open Quiet")

      HStack(alignment: .center, spacing: 12) {
        Link(destination: textURL) {
          Text("What arrived?")
            .font(.system(.title3, design: .serif))
            .lineLimit(1)
            .minimumScaleFactor(0.75)
            .frame(minHeight: 44, alignment: .leading)
            .contentShape(Rectangle())
        }
        .accessibilityLabel("What arrived? Write a thought")

        Spacer(minLength: 0)

        Link(destination: voiceURL) {
          Image(systemName: "mic")
            .font(.system(size: 23, weight: .regular))
            .frame(width: 44, height: 44)
            .contentShape(Rectangle())
        }
        .accessibilityLabel("Record a thought")
      }
      .foregroundStyle(WidgetInk.ink(scheme))
    }
    .padding(8)
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    .widgetURL(quietURL)
  }

  var body: some View {
    if #available(iOSApplicationExtension 17.0, *) {
      content.containerBackground(for: .widget) { WidgetInk.surface(scheme) }
    } else {
      content.background(WidgetInk.surface(scheme))
    }
  }
}
