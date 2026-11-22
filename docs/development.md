# Development

## Prerequisites

- Node.js (CI uses the current LTS line)
- pnpm 10.30.3, as declared in `package.json`
- Xcode and CocoaPods for native iOS work on macOS, or the Android SDK for Android work

The shared mobile source uses Expo SDK 58, React Native 0.88.1, React 19.3, TypeScript 6, and Jest 30. Exact dependencies and patches are pinned in `package.json`, `pnpm-lock.yaml`, and `pnpm-workspace.yaml`.

## Run

```bash
pnpm install --frozen-lockfile
pnpm start
```

Use a native development client. This app includes custom native voice, widget, sharing, and meaning-search code that requires its own binary. Build and run the client for the target platform:

```bash
pnpm ios
pnpm android
```

Run `pnpm ios` on macOS with Xcode. Android supports local Record capture and on-device voice under its platform policy; sync, iPhone widgets, and reminders are iOS-only.

Use `.env.example` as the configuration reference and keep populated `.env` files local. Optional sync and production builds need their service configuration. The `bogart-labs` Expo owner in `app.json` is the existing EAS account identifier.

The native iOS project is committed. After dependency changes, update CocoaPods on macOS and review `ios/Podfile.lock` alongside the JavaScript lockfile. Preserve the share extension, widget target, and local native bridges when updating native configuration.

## Verify

```bash
pnpm typecheck
pnpm test --runInBand
pnpm exec expo install --check
```

`typecheck` is `tsc --noEmit`. Jest covers storage, sync helpers, and key UI flows. Both are what CI
runs on pushes to `main` and on pull requests (`.github/workflows/ci.yml`). The Expo dependency check is an additional local check.

Jest includes thought actions on iOS 26, lexical and meaning-based connections, local reminder and Return-alert policies, and widget links that wait for device authentication. Native builds and physical-device checks are separate from these automated checks.

## Build

iOS releases ship via App Store / TestFlight (EAS or native `ios/` project in this repo).

When bumping marketing version or build number for store submission, update `app.json` and `ios/Chinotto/Info.plist` together (`CFBundleShortVersionString` and `CFBundleVersion`).

The iOS release target is 3.0.0 with local build 46. Android is still in preparation and unpublished. The shared `package.json` and `expo.version` currently read 3.0.0; Android `versionCode` is 3. These are the current source configuration, not a declaration of an Android 3.0.0 release. Production EAS builds use remote version management and auto-increment (`eas.json`); read the resulting platform build number from EAS when recording a distribution build.

Before Android distribution, build the native app and verify local capture, voice permission and off-network recognition, audio playback, incoming text sharing, Back navigation, and the shared reader at large text sizes.

Before iOS distribution, verify notification permission and delivery, cold/warm notification and widget entry, protection cancellation/retry, meaning-model availability and quality, the native thought actions menu, large text, VoiceOver, and Reduce Motion. A merge or passing JavaScript CI does not complete native acceptance. Keep build/upload/release evidence with the [release notes](release-notes.md).

## Contributing

- Product scope, commit convention, and agent contract: [`AGENTS.md`](../AGENTS.md)
