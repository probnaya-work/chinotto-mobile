---
name: ios-version-app-store-release
description: >-
  Aligns Expo semver, app.json ios.buildNumber, ios/Chinotto/Info.plist
  (CFBundleShortVersionString, CFBundleVersion), and Xcode MARKETING_VERSION /
  CURRENT_PROJECT_VERSION for Chinotto Mobile when shipping to App Store or TestFlight.
  Use when bumping version or build, fixing Apple errors 90062 or 90186, closed release trains,
  EAS iOS production builds, or when the user mentions CFBundleShortVersionString or Info.plist.
---

# iOS App Store version and build alignment

This repo **commits `ios/`**. Updating **only** `app.json` / `package.json` can ship an IPA with **stale** `CFBundleShortVersionString` — Apple rejects it.

## The procedure

1. Set the same marketing version in `package.json`, `app.json` (`expo.version`).
2. Increment `app.json` → `expo.ios.buildNumber`.
3. Update **`ios/Chinotto/Info.plist`**: `CFBundleShortVersionString` = `expo.version`, `CFBundleVersion` = `buildNumber`.
4. Update **`ios/Chinotto.xcodeproj/project.pbxproj`**: every `MARKETING_VERSION` = `expo.version`; align `CURRENT_PROJECT_VERSION` with the build number for all app/extension targets.
5. Run the grep verification commands from the checklist before declaring done.
6. Remind the user to pick the correct **open** App Store version train in Connect (not a closed `1.0.0` train).

Do not skip native files when `ios/` is tracked in git.
