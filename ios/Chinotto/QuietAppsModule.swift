import FamilyControls
import React
import SwiftUI

@objc(QuietAppsModule)
final class QuietAppsModule: NSObject {
  @objc static func requiresMainQueueSetup() -> Bool { true }

  @objc(open:rejecter:)
  func open(_ resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    Task { @MainActor in
      guard let presenter = RCTPresentedViewController(), presenter.viewIfLoaded?.window != nil,
            !(presenter is UIHostingController<QuietAppsView>), !presenter.isBeingDismissed else {
        reject("presentation", "Couldn’t open Quiet. Try again.", nil)
        return
      }
      presenter.present(UIHostingController(rootView: QuietAppsView()), animated: true) {
        resolve(nil)
      }
    }
  }
}

private struct QuietAppsView: View {
  @Environment(\.dismiss) private var dismiss
  @Environment(\.scenePhase) private var phase
  @ObservedObject private var authorization = AuthorizationCenter.shared
  @State private var active = false
  @State private var requesting = false
  @State private var count = 0
  @State private var draft = FamilyActivitySelection()
  @State private var picking = false
  @State private var notice: String?

  var body: some View {
    NavigationStack {
      Form {
        Section {
          Text("Temporarily hide apps from your iPhone. They can’t be opened while Quiet is on.")
          if QuietApps.authorized {
            Button("Choose apps (\(count))") {
              draft = (try? QuietApps.selection()) ?? FamilyActivitySelection()
              picking = true
            }.disabled(active)
          } else {
            Button(requesting ? "Requesting access…" : "Allow Screen Time access") {
              Task { await requestAccess() }
            }.disabled(requesting)
          }
          Button(active ? "Turn Quiet off" : "Turn Quiet on") {
            do { try QuietApps.setEnabled(!active); notice = nil; refresh() }
            catch { notice = error.localizedDescription }
          }.disabled(!active && (!QuietApps.authorized || count == 0))
        } footer: {
          Text("Keep Chinotto available so you can turn Quiet off here. You can also revoke its access in Settings → Screen Time.")
        }
        if let notice { Text(notice).accessibilityLabel(notice) }
        if #available(iOS 18, *) {
          Section("Control Center") {
            Text("Open Control Center, tap +, then Add a Control. Choose Chinotto Quiet. You can switch Quiet on and off there.")
          }
        }
      }
      .navigationTitle("Quiet apps")
      .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } } }
      .onAppear { refresh() }
      .onChange(of: phase) { value in if value == .active { refresh() } }
      .onChange(of: authorization.authorizationStatus) { _ in refresh() }
      .sheet(isPresented: $picking) {
        NavigationStack {
          FamilyActivityPicker(selection: $draft)
            .navigationTitle("Choose individual apps")
            .toolbar {
              ToolbarItem(placement: .cancellationAction) { Button("Cancel") { picking = false } }
              ToolbarItem(placement: .confirmationAction) {
                Button("Save") {
                  do { try QuietApps.save(draft); notice = nil }
                  catch { notice = error.localizedDescription }
                  picking = false
                  refresh()
                }
              }
            }
        }
      }
    }
  }

  private func refresh() {
    active = QuietApps.enabled
    do { count = try QuietApps.selection().applicationTokens.count }
    catch { count = 0; notice = QuietApps.QuietError.storage.localizedDescription }
  }

  @MainActor private func requestAccess() async {
    requesting = true
    defer { requesting = false }
    do {
      try await authorization.requestAuthorization(for: .individual)
      notice = QuietApps.authorized ? nil : "Screen Time access is off. You can retry here."
    } catch {
      notice = "Couldn’t enable Screen Time access. " + error.localizedDescription
    }
    refresh()
  }
}
