import XCTest

/// Runs against an installed build. Never enters a recipient or taps Send in Messages.
final class QuietScenarioTests: XCTestCase {
  private let app = XCUIApplication(bundleIdentifier: "com.chinotto.mobile")
  private func element(_ label: String) -> XCUIElement {
    app.descendants(matching: .any).matching(identifier: label).firstMatch
  }
  private func capture(_ name: String) {
    let attachment = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
    attachment.name = name
    attachment.lifetime = .keepAlways
    add(attachment)
  }
  private func openQuiet() {
    app.launch()
    let entry = element("Enter Quiet")
    XCTAssertTrue(entry.waitForExistence(timeout: 30), app.debugDescription)
    entry.tap()
    XCTAssertTrue(element("Message").waitForExistence(timeout: 5))
  }

  func test01Walk() {
    openQuiet()
    capture("quiet-dark")
    element("Message").tap()
    // The simulator must exercise the real native canSendText() check.
    let unavailable = element("Messages aren’t available on this iPhone. You can still capture a thought here.")
    if !unavailable.waitForExistence(timeout: 8) {
      // If a runtime offers a composer, inspect and cancel it; NEVER send a test message.
      let cancel = app.buttons["Cancel"]
      XCTAssertTrue(cancel.waitForExistence(timeout: 5), app.debugDescription)
      capture("quiet-system-composer")
      cancel.tap()
      let discard = app.buttons["Delete Draft"]
      if discard.waitForExistence(timeout: 1) { discard.tap() }
      XCTAssertTrue(element("Message cancelled. You’re back in Quiet.").waitForExistence(timeout: 5))
    }
    capture("quiet-message-result")
    element("What arrived?").tap()
    let field = app.textViews["capture"]
    XCTAssertTrue(field.waitForExistence(timeout: 5))
    XCTAssertTrue(app.keyboards.firstMatch.waitForExistence(timeout: 5), "Quiet capture must focus the field")
    field.typeText("Quiet verification: a thought by the water.")
    element("leave it").tap()
    XCTAssertTrue(element("Saved to your Record.").waitForExistence(timeout: 10), app.debugDescription)
    XCTAssertFalse(field.exists)
    capture("quiet-saved")
    element("Exit Quiet").tap()
    XCTAssertTrue(element("Quiet verification: a thought by the water.").waitForExistence(timeout: 8), app.debugDescription)
    capture("quiet-record")
    // Inspect SQLite independently for an exact count; the UI confirms the ordinary Record.
    element("Enter Quiet").tap()
  }

  func test02DraftCancellation() {
    openQuiet()
    element("What arrived?").tap()
    let field = app.textViews["capture"]
    XCTAssertTrue(field.waitForExistence(timeout: 5))
    field.typeText("A draft to keep")
    element("Back to Quiet").tap()
    XCTAssertTrue(element("Draft kept in Quiet. Tap What arrived? to continue.").waitForExistence(timeout: 5))
    element("What arrived?").tap()
    XCTAssertEqual(field.value as? String, "A draft to keep")
    capture("quiet-draft-restored")
    element("Back to Quiet").tap()
  }

  func test03LightAppearance() {
    app.launch()
    XCTAssertTrue(element("Enter Quiet").waitForExistence(timeout: 20))
    app.swipeDown()
    // Settings is also exposed as an accessible action on the pull strip.
    if !element("light appearance").waitForExistence(timeout: 2) {
      app.coordinate(withNormalizedOffset: CGVector(dx: 0.25, dy: 0.075))
        .press(forDuration: 0.1, thenDragTo: app.coordinate(withNormalizedOffset: CGVector(dx: 0.25, dy: 0.35)))
    }
    print("APPEARANCE_TREE\n" + app.debugDescription)
    let light = element("light appearance")
    if !light.exists { app.swipeUp() }
    XCTAssertTrue(light.waitForExistence(timeout: 5))
    light.tap()
    let back = element("‹ edge")
    XCTAssertTrue(back.waitForExistence(timeout: 5), app.debugDescription)
    back.tap()
    element("Enter Quiet").tap()
    XCTAssertTrue(element("Message").waitForExistence(timeout: 5))
    capture("quiet-light")
  }

  func test04WidgetGallery() {
    app.launch()
    XCTAssertTrue(element("Enter Quiet").waitForExistence(timeout: 20))
    XCUIDevice.shared.press(.home)
    let home = XCUIApplication(bundleIdentifier: "com.apple.springboard")
    home.coordinate(withNormalizedOffset: CGVector(dx: 0.83, dy: 0.67)).press(forDuration: 2)
    let edit = home.buttons["Edit"]
    XCTAssertTrue(edit.waitForExistence(timeout: 5), home.debugDescription)
    edit.tap()
    home.buttons["Add Widget"].tap()
    let search = home.searchFields["Search Widgets"]
    XCTAssertTrue(search.waitForExistence(timeout: 5))
    search.tap(); search.typeText("Chinotto")
    let chinotto = home.cells["Chinotto"]
    XCTAssertTrue(chinotto.waitForExistence(timeout: 5), home.debugDescription)
    chinotto.tap()
    for _ in 0..<5 {
      if home.staticTexts["Chinotto Quiet"].exists { break }
      home.swipeLeft()
    }
    XCTAssertTrue(home.staticTexts["Chinotto Quiet"].exists, home.debugDescription)
    capture("quiet-widget-gallery")
    let add = home.buttons.matching(NSPredicate(format: "label CONTAINS %@", "Add Widget")).firstMatch
    XCTAssertTrue(add.waitForExistence(timeout: 5))
    add.tap()
    let done = home.buttons["Done"]
    if done.waitForExistence(timeout: 5) { done.tap() }
    capture("quiet-widget-home")
    print("QUIET_WIDGET_HOME\n" + home.debugDescription)
  }

  func test05LargeText() {
    openQuiet()
    let exit = element("Exit Quiet")
    if !exit.isHittable { app.swipeUp() }
    XCTAssertTrue(exit.isHittable, app.debugDescription)
    XCTAssertTrue(element("What arrived?").exists)
    XCTAssertTrue(element("Message").exists)
    capture("quiet-large-text")
  }

  func test06ColdWidgetText() {
    app.terminate()
    XCUIDevice.shared.press(.home)
    let home = XCUIApplication(bundleIdentifier: "com.apple.springboard")
    let link = home.buttons["What arrived? Write a thought"]
    for _ in 0..<3 {
      if link.exists && link.isHittable { break }
      home.swipeLeft()
    }
    XCTAssertTrue(link.isHittable, home.debugDescription)
    link.tap()
    XCTAssertTrue(app.wait(for: .runningForeground, timeout: 15))
    XCTAssertTrue(app.textViews["capture"].waitForExistence(timeout: 10))
    XCTAssertTrue(app.keyboards.firstMatch.waitForExistence(timeout: 5))
    XCTAssertFalse(element("Message").exists, "Widget keeps its ordinary capture destination")
    capture("quiet-widget-text-cold")
  }

  /// Set microphone permission to denied on the dedicated simulator before this test.
  func test07ColdWidgetVoiceDenied() {
    app.terminate()
    XCUIDevice.shared.press(.home)
    let home = XCUIApplication(bundleIdentifier: "com.apple.springboard")
    let link = home.buttons["Record a thought"]
    for _ in 0..<3 {
      if link.exists && link.isHittable { break }
      home.swipeLeft()
    }
    XCTAssertTrue(link.isHittable, home.debugDescription)
    link.tap()
    XCTAssertTrue(app.wait(for: .runningForeground, timeout: 15))
    let recovery = element("open settings ›")
    XCTAssertTrue(recovery.waitForExistence(timeout: 10), app.debugDescription)
    capture("quiet-widget-voice-cold-denied")
  }

}
