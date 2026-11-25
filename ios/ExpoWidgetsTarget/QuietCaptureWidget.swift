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
  @Environment(\.widgetFamily) private var family
  @Environment(\.widgetRenderingMode) private var renderingMode
  @ScaledMetric(relativeTo: .title) private var headline: CGFloat = 34

  private let quietURL = URL(string: "chinotto://quiet")!
  private let textURL = URL(string: "chinotto://capture")!
  private let voiceURL = URL(string: "chinotto://capture?mode=voice")!
  private let ink = Color(red: 0.965, green: 0.957, blue: 0.929)
  private let sage = Color(red: 0.718, green: 0.788, blue: 0.667)
  private let charcoal = Color(red: 0.098, green: 0.110, blue: 0.102)

  private var large: Bool { family == .systemLarge }

  private var brand: some View {
    HStack(spacing: 4) {
      ChinottoLogoMark(size: 12, scheme: .dark)
      Text("CHINOTTO").tracking(0.4)
    }
    .font(.system(size: large ? 12 : 10, weight: .medium, design: .monospaced))
  }

  private var background: some View {
    RadialGradient(colors: [Color(red: 0.22, green: 0.277, blue: 0.208), charcoal],
                   center: UnitPoint(x: 0.80, y: large ? 0.72 : 0.50),
                   startRadius: 0, endRadius: large ? 330 : 245)
  }

  private func voiceDisc(diameter: CGFloat) -> some View {
    Link(destination: voiceURL) {
      Circle()
        .fill(LinearGradient(colors: [Color(red: 0.77, green: 0.83, blue: 0.70), sage],
                             startPoint: .topLeading, endPoint: .bottomTrailing))
        .overlay { Circle().strokeBorder(.white.opacity(0.24), lineWidth: 0.7) }
        .shadow(color: .black.opacity(0.24), radius: 2, y: 2)
        .overlay {
          Circle().fill(renderingMode == .fullColor ? charcoal : Color.primary)
            .frame(width: diameter * 0.12, height: diameter * 0.12)
        }
        .frame(width: diameter, height: diameter)
        .contentShape(Circle())
    }
    .accessibilityLabel("Record a thought")
    .background {
      ZStack {
        ForEach([1.50, 1.86, 2.37, 2.91], id: \.self) { factor in
          Circle().stroke(sage.opacity(0.32 / factor), lineWidth: 0.65)
            .frame(width: diameter * factor, height: diameter * factor)
        }
      }
      .accessibilityHidden(true)
      .allowsHitTesting(false)
    }
  }

  private var largeHeader: some View {
    HStack {
      Link(destination: quietURL) { brand.frame(minHeight: 44) }
        .accessibilityLabel("Open in-app Quiet capture")
      Spacer()
      Text(date, format: .dateTime.month(.abbreviated).year())
        .textCase(.uppercase)
        .font(.system(.caption, design: .monospaced))
    }
  }

  private var content: some View {
    GeometryReader { geometry in
      let diameter = min(large ? 101 : 86, geometry.size.height * 0.69, geometry.size.width * 0.31)
      VStack(alignment: .leading, spacing: 0) {
        if large {
          largeHeader
          QuietWeek(date: date, sage: sage, charcoal: charcoal)
            .padding(.top, 8)
          Spacer(minLength: 10)
        }
        HStack(spacing: 12) {
          Link(destination: textURL) {
            VStack(alignment: .leading, spacing: 0) {
              if !large {
                brand
                Spacer(minLength: 3)
                Text(date, format: .dateTime.day().month(.abbreviated))
                  .textCase(.uppercase)
                  .font(.system(size: 11, design: .monospaced))
              }
              VStack(alignment: .leading, spacing: -5) {
                Text("What")
                Text("arrived?")
              }
              .font(.custom("Archivo-540-94", fixedSize: min(headline * (large ? 1.26 : 1), geometry.size.height * 0.29)))
              .tracking(-0.6)
              .lineLimit(1)
              .minimumScaleFactor(0.75)
              .padding(.top, 3)
              if !large { Spacer(minLength: 2) }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .contentShape(Rectangle())
          }
          .accessibilityLabel("What arrived? Write a thought")
          voiceDisc(diameter: diameter)
            .padding(.trailing, 7)
        }
        .padding(.bottom, large ? 15 : 0)
      }
      .padding(.leading, 3)
      .foregroundStyle(ink)
      .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
    .widgetURL(textURL)
  }

  var body: some View {
    if #available(iOSApplicationExtension 17.0, *) {
      content.containerBackground(for: .widget) { background }
    } else {
      content.background(background)
    }
  }
}

private struct QuietWeek: View {
  let date: Date
  let sage: Color
  let charcoal: Color
  @Environment(\.calendar) private var calendar
  @Environment(\.widgetRenderingMode) private var renderingMode

  var body: some View {
    if let week = calendar.dateInterval(of: .weekOfYear, for: date) {
      let days = (0..<7).compactMap { calendar.date(byAdding: .day, value: $0, to: week.start) }
      HStack(spacing: 0) {
        ForEach(days, id: \.self) { day in
          let today = calendar.isDate(day, inSameDayAs: date)
          VStack(spacing: 7) {
            Text(day, format: .dateTime.weekday(.narrow))
            Text(day, format: .dateTime.day())
              .fontWeight(today ? .bold : .regular)
              .frame(maxWidth: .infinity, minHeight: 22)
              .foregroundStyle(today && renderingMode == .fullColor ? charcoal : .primary)
              .background { if today { Capsule().fill(sage) } }
          }
          .frame(maxWidth: .infinity)
        }
      }
      .font(.system(.caption, design: .monospaced))
      .environment(\.colorScheme, .dark)
      .accessibilityElement(children: .ignore)
      .accessibilityLabel(Text(date, format: .dateTime.weekday(.wide).month(.wide).day().year()))
    }
  }
}
