# Development

## Prerequisites

- Node.js
- pnpm
- Xcode (iOS simulator or device)

## Run

```bash
pnpm install
pnpm start
```

Open in Expo Go or a dev client, or run:

```bash
pnpm ios
pnpm android
```

## Verify

```bash
pnpm typecheck
pnpm test
```

`typecheck` is `tsc --noEmit`. Jest covers storage, sync helpers, and key UI flows. Both are what CI
runs on every push and pull request (`.github/workflows/ci.yml`).

## Build

iOS releases ship via App Store / TestFlight (EAS or native `ios/` project in this repo).

When bumping marketing version or build number for store submission, update `app.json` and `ios/Chinotto/Info.plist` together (`CFBundleShortVersionString` and `CFBundleVersion`).

## Contributing

- Product scope, commit convention, and agent contract: [`AGENTS.md`](../AGENTS.md)
