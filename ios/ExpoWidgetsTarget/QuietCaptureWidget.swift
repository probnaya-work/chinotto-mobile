import SwiftUI
import WidgetKit

/// A capture entrance with no access to the Record or shared thought payloads.
struct QuietCaptureWidget: Widget {
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: "QuietCaptureWidget", provider: QuietCaptureTimeline()) { entry in
      QuietCaptureWidgetView(date: entry.date)
    }
    .configurationDisplayName("Chinotto Quiet")
    .description("Write or speak a thought from your Home Screen.")
    .supportedFamilies([.systemMedium, .systemLarge])
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
  @Environment(\.widgetFamily) private var family

  private let quietURL = URL(string: "chinotto://quiet")!
  private let textURL = URL(string: "chinotto://capture")!
  private let voiceURL = URL(string: "chinotto://capture?mode=voice")!

  private var large: some View {
    VStack(alignment: .leading, spacing: 0) {
      HStack(alignment: .firstTextBaseline) {
        Link(destination: quietURL) {
          Text("Chinotto")
            .font(.headline)
            .foregroundStyle(WidgetInk.ink(scheme))
            .frame(minHeight: 44)
        }
        .accessibilityLabel("Open in-app Quiet capture")
        Spacer(minLength: 12)
        Text(date, format: .dateTime.month(.abbreviated).day())
          .font(.system(size: 12))
          .foregroundStyle(WidgetInk.meta(scheme))
          .lineLimit(1)
      }

      Spacer(minLength: 16)

      HStack(alignment: .center, spacing: 12) {
        Link(destination: textURL) {
          Text("What arrived?")
            .font(.system(.title, design: .serif))
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
    .widgetURL(textURL)
  }

  @ViewBuilder private var background: some View {
    if family == .systemMedium {
      RadialGradient(colors: [
        Color(red: 0.32, green: 0.38, blue: 0.28),
        Color(red: 0.20, green: 0.25, blue: 0.19),
        Color(red: 0.09, green: 0.10, blue: 0.09),
      ], center: UnitPoint(x: 0.80, y: 0.5), startRadius: 0, endRadius: 245)
    } else {
      WidgetInk.surface(scheme)
    }
  }

  @ViewBuilder private var content: some View {
    if family == .systemMedium {
      QuietMediumFace(date: date, textURL: textURL, voiceURL: voiceURL)
        .widgetURL(textURL)
    } else {
      large
    }
  }

  var body: some View {
    if #available(iOSApplicationExtension 17.0, *) {
      content.containerBackground(for: .widget) { background }
    } else {
      content.background(background)
    }
  }
}

/// The Search Results artwork at widget scale. Only the two capture targets are interactive.
private struct QuietMediumFace: View {
  let date: Date
  let textURL: URL
  let voiceURL: URL
  @Environment(\.widgetRenderingMode) private var renderingMode
  @ScaledMetric(relativeTo: .title) private var promptSize: CGFloat = 34

  private let ink = Color(red: 0.94, green: 0.93, blue: 0.90)
  private let byline = Color(red: 0.74, green: 0.78, blue: 0.72)

  var body: some View {
    GeometryReader { geometry in
      let diameter = min(86, geometry.size.height * 0.69, geometry.size.width * 0.29)
      HStack(spacing: 12) {
        Link(destination: textURL) {
          VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 4) {
              ChinottoLogoMark(size: 12, scheme: .dark)
              Text("CHINOTTO").tracking(0.4)
            }
            .font(.system(size: 10, weight: .medium, design: .monospaced))
            Spacer(minLength: 3)
            Text(date, format: .dateTime.day().month(.abbreviated))
              .textCase(.uppercase)
              .font(.system(size: 11, design: .monospaced))
            VStack(alignment: .leading, spacing: -5) {
              Text("What")
              Text("arrived?")
            }
            .font(.custom("Archivo-540-94", fixedSize: min(promptSize, geometry.size.height * 0.29)))
            .tracking(-0.6)
            .foregroundStyle(ink)
            .lineLimit(1)
            .minimumScaleFactor(0.8)
            .padding(.top, 3)
            Spacer(minLength: 2)
          }
          .foregroundStyle(byline)
          .padding(.leading, 3)
          .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
          .contentShape(Rectangle())
        }
        .accessibilityLabel("What arrived? Write a thought")

        Link(destination: voiceURL) {
          Circle()
            .fill(LinearGradient(colors: [
              Color(red: 0.76, green: 0.82, blue: 0.71),
              Color(red: 0.62, green: 0.70, blue: 0.58),
            ], startPoint: .topLeading, endPoint: .bottomTrailing))
            .overlay { Circle().strokeBorder(.white.opacity(0.23), lineWidth: 0.7) }
            .shadow(color: .black.opacity(0.24), radius: 2, y: 2)
            .overlay {
              Circle().fill(renderingMode == .fullColor ? Color(red: 0.13, green: 0.16, blue: 0.12) : .primary)
                .frame(width: diameter * 0.12, height: diameter * 0.12)
            }
            .frame(width: diameter, height: diameter)
            .contentShape(Circle())
        }
        .accessibilityLabel("Record a thought")
        .background {
          ZStack {
            ForEach([1.50, 1.86, 2.37, 2.91], id: \.self) { factor in
              Circle().stroke(byline.opacity(0.32 / factor), lineWidth: 0.65)
                .frame(width: diameter * factor, height: diameter * factor)
            }
          }
          .accessibilityHidden(true)
          .allowsHitTesting(false)
        }
        .padding(.trailing, 7)
      }
      .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
  }
}
