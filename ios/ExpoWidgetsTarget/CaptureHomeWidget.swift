import WidgetKit
import SwiftUI

private let WIDGET_THOUGHTS_APP_GROUP_ID = "group.com.chinotto.mobile"
private let WIDGET_THOUGHTS_KEY = "chinotto_widget_recent_thoughts_v1"

/// The widget's palette, taken from "Chinotto - Identity" — the medium widget and the
/// "small widget · 2×2" panel, which draws the light appearance too.
///
/// The mark carries no tint of its own and no glow: the inventory row for this file withdraws
/// the periwinkle triple. Periwinkle survives in the product only on the sync dot.
private enum WidgetInk {
  /// #e6e6e3 on the dark field, #1b1b1d on paper. The mark, `capture`, the ring affordance.
  static func ink(_ scheme: ColorScheme) -> Color {
    scheme == .light
      ? Color(red: 27 / 255, green: 27 / 255, blue: 29 / 255)
      : Color(red: 230 / 255, green: 230 / 255, blue: 227 / 255)
  }

  /// #8f8e89 / #6b6a66. The tagline, the time, a thought held at arm's length.
  static func meta(_ scheme: ColorScheme) -> Color {
    scheme == .light
      ? Color(red: 107 / 255, green: 106 / 255, blue: 102 / 255)
      : Color(red: 143 / 255, green: 142 / 255, blue: 137 / 255)
  }

  /// #5f5e5a. The `16:42 · ` prefix, a step below meta. The design draws it on dark only.
  static func faint(_ scheme: ColorScheme) -> Color {
    scheme == .light
      ? Color(red: 143 / 255, green: 143 / 255, blue: 143 / 255)
      : Color(red: 95 / 255, green: 94 / 255, blue: 90 / 255)
  }

  /// The sync dot, and the only periwinkle left in the product. It marks liveness, not
  /// success: an offline record is not an error and lights nothing.
  static func live(_ scheme: ColorScheme) -> Color {
    scheme == .light
      ? Color(red: 91 / 255, green: 98 / 255, blue: 160 / 255)
      : Color(red: 154 / 255, green: 160 / 255, blue: 200 / 255)
  }

  /// #141416 / #f2f1ec — the tile itself.
  static func surface(_ scheme: ColorScheme) -> Color {
    scheme == .light
      ? Color(red: 242 / 255, green: 241 / 255, blue: 236 / 255)
      : Color(red: 20 / 255, green: 20 / 255, blue: 22 / 255)
  }
}

/// The design's type: `capture` at 17, its second line at 11, a thought at 12.
private let widgetActionTextSize: CGFloat = 17
private let widgetSecondaryTextSize: CGFloat = 11
private let widgetThoughtTextSize: CGFloat = 12

/// The capture affordance — a ring with a dot, 1.5pt stroke. 34pt on the small tile where the
/// whole tile answers to it, 30pt in the medium header.
private let smallCaptureRingSize: CGFloat = 34
private let smallCaptureRingDot: CGFloat = 8
private let mediumCaptureRingSize: CGFloat = 30
private let mediumCaptureRingDot: CGFloat = 7

/// A ring with a dot at its centre. The design gives it no fill and no label.
private struct CaptureRing: View {
  let size: CGFloat
  let dot: CGFloat
  let scheme: ColorScheme

  var body: some View {
    ZStack {
      Circle()
        .stroke(WidgetInk.ink(scheme), lineWidth: 1.5)
        .frame(width: size, height: size)
      Circle()
        .fill(WidgetInk.ink(scheme))
        .frame(width: dot, height: dot)
    }
    .frame(width: size, height: size)
  }
}

/// `capture`, and the line under it. Lower case: the product's own voice, per the lockup.
private struct CaptureHeading: View {
  let secondary: String
  let scheme: ColorScheme

  var body: some View {
    VStack(alignment: .leading, spacing: 2) {
      Text("capture")
        .font(.system(size: widgetActionTextSize))
        .tracking(-0.17) // −0.01em at 17pt
        .foregroundStyle(WidgetInk.ink(scheme))
        .lineLimit(1)
      Text(secondary)
        .font(.system(size: widgetSecondaryTextSize))
        .foregroundStyle(WidgetInk.meta(scheme))
        .lineLimit(1)
    }
  }
}

/// The design is explicit: the small tile's mark "holds the 22pt rung — it does not shrink
/// with the tile, or the ring closes up."
private let smallLogoSize: CGFloat = 22

// Large-only: logo, header↔tray gap, plaque inner rhythm (edge padding ≥ row spacing).
private let largeLogoSize: CGFloat = 30

// Logo scale: small baseline 18 → medium (unchanged).
private let mediumLogoSize: CGFloat = 22

/// Default tap for non-`Link` areas. App also handles `chinotto://capture?mode=voice` and `chinotto://thought/<id>`.
private let captureDeepLink = URL(string: "chinotto://capture")!

struct CaptureHomeWidget: Widget {
  let name: String = "CaptureHomeWidget"

  var body: some WidgetConfiguration {
    StaticConfiguration(kind: name, provider: TimelineProvider()) { _ in
      CaptureHomeWidgetView()
    }
    .configurationDisplayName("Chinotto")
    .description("Open capture to jot a thought.")
    .supportedFamilies([.systemSmall, .systemMedium, .systemLarge])
  }
}

private struct TimelineProvider: WidgetKit.TimelineProvider {
  func placeholder(in context: Context) -> Entry {
    Entry(date: Date())
  }

  func getSnapshot(in context: Context, completion: @escaping (Entry) -> Void) {
    completion(Entry(date: Date()))
  }

  func getTimeline(in context: Context, completion: @escaping (Timeline<Entry>) -> Void) {
    let now = Date()
    // Fallback refresh when the app has not called reload (e.g. long idle). App still reloads on save.
    let next = Calendar.current.date(byAdding: .minute, value: 45, to: now) ?? now
    completion(Timeline(entries: [Entry(date: now)], policy: .after(next)))
  }
}

private struct Entry: TimelineEntry {
  let date: Date
}

// MARK: - Root

private struct CaptureHomeWidgetView: View {
  @Environment(\.widgetFamily) private var family
  /// The design draws both appearances; the tile follows the one it is placed in.
  @Environment(\.colorScheme) private var scheme

  private var state: WidgetState {
    readWidgetState()
  }

  private var thoughts: [WidgetThought] { state.thoughts }
  private var syncOn: Bool { state.syncOn }

  var body: some View {
    let content = Group {
      switch family {
      case .systemSmall:
        smallLayout
      case .systemMedium:
        mediumLayout
      case .systemLarge:
        largeLayout
      default:
        smallLayout
      }
    }
    .unredacted()
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    .widgetURL(captureDeepLink)

    if #available(iOSApplicationExtension 17.0, *) {
      content.containerBackground(for: .widget) {
        widgetBackground
      }
    } else {
      content.background(widgetBackground)
    }
  }


  // MARK: Small — "Chinotto - Identity", the 2x2 panel
  //
  // "no record text fits here at a size worth reading, so the small widget drops it rather
  // than truncating: the mark, the action, the time of the last one, and a tap target the
  // whole tile answers to." The mark stays at 22pt; only the room around it shrinks.

  private var smallLayout: some View {
    VStack(alignment: .leading, spacing: 0) {
      HStack(alignment: .top, spacing: 0) {
        ChinottoLogoMark(size: smallLogoSize, scheme: scheme)
        Spacer(minLength: 0)
        if syncOn {
          Circle()
            .fill(WidgetInk.live(scheme))
            .frame(width: 6, height: 6)
            // The design sets it 8 below the mark's top edge rather than level with it.
            .padding(.top, 8)
        }
      }

      Spacer(minLength: 0)

      HStack(alignment: .bottom, spacing: 10) {
        CaptureHeading(secondary: lastThoughtLine, scheme: scheme)
          .frame(maxWidth: .infinity, alignment: .leading)
          .layoutPriority(1)
        CaptureRing(size: smallCaptureRingSize, dot: smallCaptureRingDot, scheme: scheme)
      }
    }
  }

  /// `16:42 · last`, or just `last` when the payload carries no time.
  private var lastThoughtLine: String {
    guard let newest = thoughts.first else { return "nothing yet" }
    guard let time = newest.clockTime else { return "last" }
    return "\(time) · last"
  }

  // MARK: Medium — "Chinotto - Identity", the home-screen panel
  //
  // Header: the mark, `capture` over `it lands, and stays`, and the ring on the right. Under
  // it, one recent thought at 12pt with its time in faint. gap 16 between the two.

  private var mediumLayout: some View {
    VStack(alignment: .leading, spacing: 16) {
      HStack(alignment: .top, spacing: 12) {
        ChinottoLogoMark(size: mediumLogoSize, scheme: scheme)
        CaptureHeading(secondary: "it lands, and stays", scheme: scheme)
        Spacer(minLength: 0)
        CaptureRing(size: mediumCaptureRingSize, dot: mediumCaptureRingDot, scheme: scheme)
      }
      .frame(maxWidth: .infinity, alignment: .leading)

      if let newest = thoughts.first {
        thoughtLine(newest)
      } else {
        Text("nothing here yet")
          .font(.system(size: widgetThoughtTextSize))
          .foregroundStyle(WidgetInk.faint(scheme))
          .lineLimit(1)
      }

      Spacer(minLength: 0)
    }
  }

  /// `16:42 · the return should only come back if it can show me why` — the time a step below
  /// the words, so the words are what you read.
  private func thoughtLine(_ thought: WidgetThought, lineLimit: Int = 2) -> some View {
    Link(destination: URL(string: "chinotto://thought/\(thought.id)")!) {
      Group {
        if let time = thought.clockTime {
          // `foregroundColor` rather than `foregroundStyle`: the latter only returns a
          // concatenable Text from iOS 17, and this extension deploys lower.
          Text(verbatim: "\(time) · ").foregroundColor(WidgetInk.faint(scheme))
            + Text(thought.text).foregroundColor(WidgetInk.meta(scheme))
        } else {
          Text(thought.text).foregroundColor(WidgetInk.meta(scheme))
        }
      }
      .font(.system(size: widgetThoughtTextSize))
      .lineSpacing(widgetThoughtTextSize * 0.35)
      .lineLimit(lineLimit)
      .multilineTextAlignment(.leading)
      .frame(maxWidth: .infinity, alignment: .leading)
    }
    .buttonStyle(.plain)
  }

  // MARK: Large — not drawn in the Identity project.
  //
  // Derived, not designed: the medium header verbatim, then the same thought line repeated.
  // Nothing here invents a treatment the design does not state.

  private var largeLayout: some View {
    VStack(alignment: .leading, spacing: 16) {
      HStack(alignment: .top, spacing: 12) {
        ChinottoLogoMark(size: largeLogoSize, scheme: scheme)
        CaptureHeading(secondary: "it lands, and stays", scheme: scheme)
        Spacer(minLength: 0)
        CaptureRing(size: mediumCaptureRingSize, dot: mediumCaptureRingDot, scheme: scheme)
      }
      .frame(maxWidth: .infinity, alignment: .leading)

      if thoughts.isEmpty {
        Text("nothing here yet")
          .font(.system(size: widgetThoughtTextSize))
          .foregroundStyle(WidgetInk.faint(scheme))
          .lineLimit(1)
      } else {
        VStack(alignment: .leading, spacing: 12) {
          ForEach(thoughts.prefix(5)) { thought in
            thoughtLine(thought, lineLimit: 2)
          }
        }
      }

      Spacer(minLength: 0)
    }
  }

  /// The tile itself. "Chinotto - Identity" draws it flat — the periwinkle gradients that
  /// used to sit under it are not part of the identity.
  private var widgetBackground: some View {
    WidgetInk.surface(scheme)
  }
}

// MARK: - Payload

private struct WidgetThoughtPayload: Decodable {
  let thoughts: [WidgetThought]
  /// Absent in a payload written by an older build, which reads as "not live".
  let syncOn: Bool?
}

private struct WidgetThought: Decodable, Identifiable {
  let id: String
  let text: String
  /// ISO-8601, written by `widgetThoughtsBridge.ts`. Optional so a payload from an older
  /// build still decodes; without it the line simply carries no time.
  let createdAt: String?

  /// `16:42`, in the reader's own locale and clock.
  var clockTime: String? {
    guard let createdAt else { return nil }
    // Both spellings occur in the wild: SQLite rows written with and without milliseconds.
    let date = WidgetThought.isoFractional.date(from: createdAt)
      ?? WidgetThought.isoPlain.date(from: createdAt)
    guard let date else { return nil }
    return WidgetThought.clock.string(from: date)
  }

  private static let isoFractional: ISO8601DateFormatter = {
    let f = ISO8601DateFormatter()
    f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    return f
  }()

  private static let isoPlain = ISO8601DateFormatter()

  private static let clock: DateFormatter = {
    let f = DateFormatter()
    f.setLocalizedDateFormatFromTemplate("j:mm")
    return f
  }()
}

/// What the app last wrote to the shared group: the recent thoughts, and whether sync is live.
private struct WidgetState {
  let thoughts: [WidgetThought]
  let syncOn: Bool

  static let empty = WidgetState(thoughts: [], syncOn: false)
}

private func readWidgetState() -> WidgetState {
  guard
    let defaults = UserDefaults(suiteName: WIDGET_THOUGHTS_APP_GROUP_ID),
    let raw = defaults.string(forKey: WIDGET_THOUGHTS_KEY),
    let data = raw.data(using: .utf8)
  else {
    return .empty
  }

  do {
    let payload = try JSONDecoder().decode(WidgetThoughtPayload.self, from: data)
    let thoughts = payload.thoughts.filter {
      !$0.id.isEmpty && !$0.text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }
    return WidgetState(thoughts: thoughts, syncOn: payload.syncOn ?? false)
  } catch {
    return .empty
  }
}

/// The Chinotto mark at the widget's rung.
///
/// "Chinotto - Identity" asset 05 is a ladder, not one drawing: ≥40px is three dots at
/// stroke 2.5, 24–39px is two dots at stroke 3.5, ≤20px is one dot at stroke 6. Each step is
/// drawn rather than scaled, and picking the wrong rung is the only way to get this wrong.
///
/// The widget takes the **two-dot rung**, which the Identity project states for this surface
/// directly: "the widget takes the 22pt rung — two dots — because the ring's thin stroke
/// breaks in a widget's dimmed render." Every size below (21, 22, 30) sits in that band, so
/// there is no second rung to choose here.
///
/// Ratios are the design's 64-unit geometry divided by 64: ring r28 stroke 3.5, a dot of r9
/// centred at y=23, and a dot of r5 centred at y=40.
private struct ChinottoLogoMark: View {
  let size: CGFloat
  let scheme: ColorScheme

  // Ring: r28 of 64 is a diameter of 0.875; stroke 3.5 of 64.
  private static let ringDiameter: CGFloat = 0.875
  private static let ringStroke: CGFloat = 3.5 / 64

  // Upper dot: r9 at y=23 — diameter 18/64, centre (23 - 32)/64 above the middle.
  private static let upperDotDiameter: CGFloat = 18.0 / 64
  private static let upperDotOffset: CGFloat = -9.0 / 64

  // Lower dot: r5 at y=40 — diameter 10/64, centre (40 - 32)/64 below the middle.
  private static let lowerDotDiameter: CGFloat = 10.0 / 64
  private static let lowerDotOffset: CGFloat = 8.0 / 64

  var body: some View {
    ZStack {
      Circle()
        .stroke(WidgetInk.ink(scheme), lineWidth: size * Self.ringStroke)
        .frame(width: size * Self.ringDiameter, height: size * Self.ringDiameter)

      Circle()
        .fill(WidgetInk.ink(scheme))
        .frame(width: size * Self.upperDotDiameter, height: size * Self.upperDotDiameter)
        .offset(y: size * Self.upperDotOffset)

      Circle()
        .fill(WidgetInk.ink(scheme))
        .frame(width: size * Self.lowerDotDiameter, height: size * Self.lowerDotDiameter)
        .offset(y: size * Self.lowerDotOffset)
    }
    .frame(width: size, height: size, alignment: .center)
  }
}
