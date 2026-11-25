import Foundation
import MessageUI
import React
import UIKit

/// The system owns recipients, contact selection and Send. Chinotto reads none of them.
@objc(QuietMessageModule)
final class QuietMessageModule: NSObject, MFMessageComposeViewControllerDelegate {
  private var pending: RCTPromiseResolveBlock?
  private weak var composer: MFMessageComposeViewController?

  @objc static func requiresMainQueueSetup() -> Bool { true }

  @objc(compose:resolver:rejecter:)
  func compose(_ body: String, resolve: @escaping RCTPromiseResolveBlock,
               reject: @escaping RCTPromiseRejectBlock) {
    DispatchQueue.main.async { [weak self] in
      guard let self else { resolve("failed"); return }
      guard self.pending == nil else { resolve("busy"); return }
      guard MFMessageComposeViewController.canSendText() else {
        resolve("unavailable")
        return
      }
      guard let presenter = RCTPresentedViewController(),
            presenter.viewIfLoaded?.window != nil, !presenter.isBeingDismissed else {
        resolve("failed")
        return
      }
      let controller = MFMessageComposeViewController()
      controller.body = body
      // No recipients are supplied. Only the person using the system UI can select them.
      controller.messageComposeDelegate = self
      controller.modalPresentationStyle = .fullScreen
      self.pending = resolve
      self.composer = controller
      presenter.present(controller, animated: true)
    }
  }

  func messageComposeViewController(_ controller: MFMessageComposeViewController,
                                    didFinishWith result: MessageComposeResult) {
    guard controller === composer else { return }
    let outcome: String
    switch result {
    case .cancelled: outcome = "cancelled"
    case .sent: outcome = "sent" // Accepted by the composer, NOT a delivery receipt.
    case .failed: outcome = "failed"
    @unknown default: outcome = "failed"
    }
    controller.dismiss(animated: true) { [weak self] in
      let resolve = self?.pending
      self?.pending = nil
      self?.composer = nil
      resolve?(outcome)
    }
  }
}
