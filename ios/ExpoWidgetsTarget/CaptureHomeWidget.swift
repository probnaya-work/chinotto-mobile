import WidgetKit
import SwiftUI

// Matches `ios/Chinotto/Images.xcassets/SplashScreenBackground.colorset` (#0A0A0E).
private let CHINOTTO_BRAND_DARK = Color(
  red: 0.0392156862745098,
  green: 0.0392156862745098,
  blue: 0.0549019607843137
)
private let CHINOTTO_BRAND_ELEVATED = Color(
  red: 0.0549019607843137,
  green: 0.0509803921568627,
  blue: 0.0823529411764706
)
private let WIDGET_THOUGHTS_APP_GROUP_ID = "group.com.chinotto.mobile"
private let WIDGET_THOUGHTS_KEY = "chinotto_widget_recent_thoughts_v1"

/// Mid stop of app headline text gradient (`theme.ts` `chinottoHeadlineTextGradient`); widget-only mark tint.
private let chinottoLogoMarkCore = Color(red: 198 / 255, green: 206 / 255, blue: 1).opacity(0.92)
private let chinottoLogoMarkLifted = Color(red: 198 / 255, green: 206 / 255, blue: 1).opacity(0.96)
private let chinottoLogoMarkGlow = Color(red: 198 / 255, green: 206 / 255, blue: 1).opacity(0.22)

/// Capture header trio (all sizes): more air logo→title, title + tagline tighter together.
private let smallLogoToCaptureGap: CGFloat = 18
private let smallCaptureToTaglineGap: CGFloat = 2
private let smallLogoSize: CGFloat = 21
private let smallLogoToTextGap: CGFloat = 16

/// Medium information block: up to 2 newest thoughts (payload sorted newest-first).
private let mediumThoughtsVisibleMax = 2
private let mediumHeaderToThoughtsGap: CGFloat = 16
private let mediumHeaderTextSize: CGFloat = 19

// Shared “thought plaque” chrome (medium right column + large tray) — same fill/stroke/radius.
private let thoughtPlaqueCornerRadius: CGFloat = 20
private let thoughtPlaqueFillOpacity: Double = 0.042
private let thoughtPlaqueStrokeOpacity: Double = 0.06
private let thoughtPlaqueStrokeWidth: CGFloat = 0.75
// Medium plaque insets — tuned; do not change when adjusting large-only layout.
private let mediumThoughtPlaqueEdgeV: CGFloat = 12
private let mediumThoughtPlaqueEdgeH: CGFloat = 12
private let mediumThoughtPlaqueRowSpacing: CGFloat = 10

// Large-only: logo, header↔tray gap, plaque inner rhythm (edge padding ≥ row spacing).
private let largeLogoSize: CGFloat = 30
private let largeHeaderToTraySpacing: CGFloat = 20
private let largeHeaderDividerOpacity: Double = 0.1
private let largeHeaderDividerBottomSpacing: CGFloat = 20
private let largeThoughtPlaqueEdgeV: CGFloat = 10
private let largeThoughtPlaqueEdgeH: CGFloat = 16
private let largeThoughtRowSpacing: CGFloat = 6
private let largeThoughtLinkVerticalPad: CGFloat = 4
private let largeThoughtRowMinHeight: CGFloat = 31

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

  private var thoughts: [WidgetThought] {
    readWidgetThoughts()
  }

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
    .padding(paddingInsets)
    .widgetURL(captureDeepLink)

    if #available(iOSApplicationExtension 17.0, *) {
      content.containerBackground(for: .widget) {
        widgetBackground
      }
    } else {
      content.background(widgetBackground)
    }
  }

  private var paddingInsets: EdgeInsets {
    switch family {
    case .systemSmall:
      return EdgeInsets(top: 14, leading: 16, bottom: 14, trailing: 16)
    case .systemMedium:
      return EdgeInsets(top: 14, leading: 10, bottom: 14, trailing: 10)
    case .systemLarge:
      // Bottom at least side inset so the tray never feels clipped at the foot.
      return EdgeInsets(top: 17, leading: 17, bottom: 17, trailing: 17)
    default:
      return EdgeInsets(top: 14, leading: 16, bottom: 14, trailing: 16)
    }
  }

  // MARK: Small — same shell as before spec: logo + Capture + tagline

  private var smallLayout: some View {
    VStack(alignment: .leading, spacing: 0) {
      ChinottoLogoMark(size: smallLogoSize)
      Spacer().frame(height: smallLogoToTextGap)
      captureTitle(fontSize: 26)
      Spacer().frame(height: smallCaptureToTaglineGap)
      supportingLine
      Spacer(minLength: 0)
    }
  }

  // MARK: Medium — top capture header + soft thoughts container below

  private var mediumLayout: some View {
    VStack(alignment: .leading, spacing: 0) {
      HStack(alignment: .center, spacing: 10) {
        ChinottoLogoMark(size: mediumLogoSize, brandLift: true)

        mediumCaptureActionLine
      }
      .frame(maxWidth: .infinity, alignment: .leading)

      Spacer().frame(height: mediumHeaderToThoughtsGap)

      Group {
        if thoughts.isEmpty {
          mediumSoftInformationContainer {
            emptyThoughtsHintMedium
          }
        } else {
          mediumSoftInformationContainer {
            VStack(alignment: .leading, spacing: mediumThoughtPlaqueRowSpacing) {
              ForEach(Array(thoughts.prefix(mediumThoughtsVisibleMax).enumerated()), id: \.element.id) { index, thought in
                if index > 0 {
                  Rectangle()
                    .fill(Color.white.opacity(0.08))
                    .frame(height: thoughtPlaqueStrokeWidth)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.vertical, 1)
                }
                thoughtLinkLine(
                  thought: thought,
                  fontSize: mediumThoughtFontSize(index: index),
                  weight: index == 0 ? .medium : .regular,
                  foregroundOpacity: mediumThoughtForegroundOpacity(index: index),
                  design: .rounded
                )
              }
            }
          }
        }
      }
      .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }
  }

  private func mediumThoughtFontSize(index: Int) -> CGFloat {
    switch index {
    case 0: return 14.5
    default: return 13.5
    }
  }

  private func mediumThoughtForegroundOpacity(index: Int) -> Double {
    switch index {
    case 0: return 0.98
    default: return 0.82
    }
  }

  private var emptyThoughtsHintMedium: some View {
    Text("No thoughts yet")
      .font(.system(size: 11, weight: .regular, design: .rounded))
      .foregroundStyle(Color(red: 154 / 255, green: 154 / 255, blue: 167 / 255).opacity(0.32))
      .lineLimit(1)
      .frame(maxWidth: .infinity, alignment: .leading)
  }

  private var mediumCaptureActionLine: some View {
    HStack(alignment: .firstTextBaseline, spacing: 4) {
      Text("Capture")
        .font(.system(size: mediumHeaderTextSize, weight: .semibold))
        .foregroundStyle(Color.white.opacity(0.97))
        .lineLimit(1)
        .minimumScaleFactor(0.88)

      Text("your thought")
        .font(.system(size: mediumHeaderTextSize - 2, weight: .regular))
        .foregroundStyle(Color.white.opacity(0.7))
        .lineLimit(1)
        .minimumScaleFactor(0.88)
    }
  }

  private var largeCaptureActionLine: some View {
    HStack(alignment: .center, spacing: 5) {
      Text("Capture")
        .font(.system(size: 27, weight: .semibold))
        .foregroundStyle(Color.white.opacity(0.97))
        .lineLimit(1)
        .minimumScaleFactor(0.88)

      Text("your thought")
        .font(.system(size: 24, weight: .regular))
        .foregroundStyle(Color.white.opacity(0.7))
        .lineLimit(1)
        .minimumScaleFactor(0.88)
    }
  }

  /// Same plaque chrome as large tray (fill + hairline stroke, continuous radius).
  private func mediumSoftInformationContainer<Content: View>(
    @ViewBuilder content: () -> Content
  ) -> some View {
    content()
      .frame(maxWidth: .infinity, alignment: .leading)
      .padding(.horizontal, mediumThoughtPlaqueEdgeH)
      .padding(.vertical, mediumThoughtPlaqueEdgeV)
      .background(thoughtPlaqueBackground)
      .frame(maxHeight: .infinity, alignment: .topLeading)
  }

  private var thoughtPlaqueBackground: some View {
    RoundedRectangle(cornerRadius: thoughtPlaqueCornerRadius, style: .continuous)
      .fill(Color.white.opacity(thoughtPlaqueFillOpacity))
      .overlay(
        RoundedRectangle(cornerRadius: thoughtPlaqueCornerRadius, style: .continuous)
          .stroke(Color.white.opacity(thoughtPlaqueStrokeOpacity), lineWidth: thoughtPlaqueStrokeWidth)
      )
  }

  // MARK: Large — capture header + inset tray (как до soft-glass обёртки)

  private var largeLayout: some View {
    GeometryReader { geo in
      let maxLines = largeThoughtLineBudget(for: geo.size.height)
      let visibleCount = min(maxLines, thoughts.count)
      let visible = Array(thoughts.prefix(visibleCount))

      VStack(alignment: .leading, spacing: 0) {
        Spacer(minLength: 0)

        VStack(alignment: .leading, spacing: 0) {
          VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .center, spacing: 10) {
              ChinottoLogoMark(size: largeLogoSize, brandLift: true)
              largeCaptureActionLine
            }
          }
          .padding(.bottom, largeHeaderToTraySpacing)

          Rectangle()
            .fill(Color.white.opacity(largeHeaderDividerOpacity))
            .frame(height: thoughtPlaqueStrokeWidth)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.bottom, largeHeaderDividerBottomSpacing)

          if visible.isEmpty {
            emptyThoughtsHint
              .frame(maxWidth: .infinity, alignment: .leading)
          } else {
            largeThoughtsTray(rows: visible)
          }
        }

        Spacer(minLength: 0)
      }
      .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }
  }

  /// How many rows to show on large (newest-first payload).
  private func largeThoughtLineBudget(for totalHeight: CGFloat) -> Int {
    switch totalHeight {
    case ..<268:
      return 4
    case ..<312:
      return 5
    default:
      return 6
    }
  }

  private func largeThoughtsTray(rows: [WidgetThought]) -> some View {
    VStack(alignment: .leading, spacing: 0) {
      ForEach(Array(rows.enumerated()), id: \.element.id) { index, row in
        if index > 0 {
          Spacer()
            .frame(height: largeThoughtRowSpacing)
        }
        Link(destination: URL(string: "chinotto://thought/\(row.id)")!) {
          Text(row.text)
            .font(.system(size: index == 0 ? 14.5 : 13.5, weight: index == 0 ? .medium : .regular, design: .rounded))
            .foregroundStyle(
              Color(red: 224 / 255, green: 224 / 255, blue: 234 / 255)
                .opacity(index == 0 ? 0.94 : 0.78)
            )
            .lineLimit(1)
            .truncationMode(.tail)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.vertical, largeThoughtLinkVerticalPad)
            .frame(minHeight: largeThoughtRowMinHeight, alignment: .center)
        }
        .buttonStyle(.plain)
      }
    }
    .padding(.horizontal, largeThoughtPlaqueEdgeH)
    .padding(.vertical, largeThoughtPlaqueEdgeV)
    .background(thoughtPlaqueBackground)
  }

  /// One tappable thought: single line + ellipsis (URLs / long text handled upstream).
  private func thoughtLinkLine(
    thought: WidgetThought,
    fontSize: CGFloat,
    weight: Font.Weight,
    foregroundOpacity: Double,
    design: Font.Design = .default
  ) -> some View {
    Link(destination: URL(string: "chinotto://thought/\(thought.id)")!) {
      Text(thought.text)
        .font(.system(size: fontSize, weight: weight, design: design))
        .foregroundStyle(Color(red: 228 / 255, green: 228 / 255, blue: 236 / 255).opacity(foregroundOpacity))
        .lineLimit(1)
        .truncationMode(.tail)
        .frame(maxWidth: .infinity, alignment: .leading)
    }
    .buttonStyle(.plain)
  }

  private func captureTitle(fontSize: CGFloat) -> some View {
    Text("Capture")
      .font(.system(size: fontSize, weight: .bold))
      .tracking(-0.35)
      .foregroundStyle(Color(red: 240 / 255, green: 240 / 255, blue: 245 / 255))
      .lineLimit(1)
      .minimumScaleFactor(0.85)
  }

  private var supportingLine: some View {
    Text("your thought")
      .font(.system(size: 12, weight: .regular))
      .foregroundStyle(Color(red: 150 / 255, green: 150 / 255, blue: 162 / 255).opacity(0.88))
      .lineLimit(1)
  }

  private var emptyThoughtsHint: some View {
    Text("No thoughts yet")
      .font(.system(size: 11, weight: .regular, design: .rounded))
      .foregroundStyle(Color(red: 154 / 255, green: 154 / 255, blue: 167 / 255).opacity(0.34))
      .lineLimit(1)
  }

  @ViewBuilder
  private var widgetBackground: some View {
    ZStack {
      LinearGradient(
        colors: [CHINOTTO_BRAND_ELEVATED, CHINOTTO_BRAND_DARK],
        startPoint: .bottomTrailing,
        endPoint: .topLeading
      )
      LinearGradient(
        colors: [
          Color(red: 106 / 255, green: 124 / 255, blue: 194 / 255).opacity(0.12),
          Color.clear,
        ],
        startPoint: .bottomTrailing,
        endPoint: UnitPoint(x: 0.26, y: 0.22)
      )
      RadialGradient(
        colors: [
          Color(red: 156 / 255, green: 172 / 255, blue: 1.0).opacity(0.06),
          Color.clear,
        ],
        center: UnitPoint(x: 0.82, y: 0.82),
        startRadius: 2,
        endRadius: 92
      )
    }
  }
}

// MARK: - Payload

private struct WidgetThoughtPayload: Decodable {
  let thoughts: [WidgetThought]
}

private struct WidgetThought: Decodable, Identifiable {
  let id: String
  let text: String
}

private func readWidgetThoughts() -> [WidgetThought] {
  guard
    let defaults = UserDefaults(suiteName: WIDGET_THOUGHTS_APP_GROUP_ID),
    let raw = defaults.string(forKey: WIDGET_THOUGHTS_KEY),
    let data = raw.data(using: .utf8)
  else {
    return []
  }

  do {
    let payload = try JSONDecoder().decode(WidgetThoughtPayload.self, from: data)
    return payload.thoughts.filter { !$0.id.isEmpty && !$0.text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
  } catch {
    return []
  }
}

private struct ChinottoLogoMark: View {
  let size: CGFloat
  /// Medium / Large only: subtle lift without changing Small’s default look.
  var brandLift: Bool = false

  private var markColor: Color {
    brandLift ? chinottoLogoMarkLifted : chinottoLogoMarkCore
  }

  var body: some View {
    ZStack {
      // Drawn on a 64-unit grid. NOTE: these are the superseded four-dot proportions
      // (r6@20, r5@22/42,34, r4@44, stroke 2); the current mark is three dots receding
      // down a column (r8@23, r4.5@38, r2.5@47.5, stroke 3) — see assets/chinotto-icon.svg.
      // The widget has not been redrawn to it.
      Circle()
        .stroke(markColor, lineWidth: max(1.2, size * 0.032))
        .frame(width: size * 0.875, height: size * 0.875)

      Circle()
        .fill(markColor)
        .frame(width: size * 0.1875, height: size * 0.1875)
        .offset(y: -size * 0.1875)

      Circle()
        .fill(markColor)
        .frame(width: size * 0.15625, height: size * 0.15625)
        .offset(x: -size * 0.15625, y: size * 0.03125)

      Circle()
        .fill(markColor)
        .frame(width: size * 0.15625, height: size * 0.15625)
        .offset(x: size * 0.15625, y: size * 0.03125)

      Circle()
        .fill(markColor)
        .frame(width: size * 0.125, height: size * 0.125)
        .offset(y: size * 0.1875)
    }
    .frame(width: size, height: size, alignment: .center)
    .shadow(color: brandLift ? chinottoLogoMarkGlow : .clear, radius: 6, x: 0, y: 0)
  }
}
