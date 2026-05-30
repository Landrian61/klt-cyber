# KLT Cyber — Mobile App

The KLT Cyber Church mobile app: a premium digital sanctuary offering live radio, giving, announcements, program schedules, and member engagement. Built with **Expo SDK 54**, **React Native 0.81**, and **Expo Router**.

> Part of the [klt-cyber monorepo](../../README.md). Complete the **root setup first** — this app needs the shared Convex backend running.

## Tech Stack

| Concern | Technology |
|---------|-----------|
| Framework | [Expo SDK 54](https://expo.dev) (managed workflow) · React Native 0.81 · React 19 |
| Routing | [Expo Router 6](https://docs.expo.dev/router/introduction/) (file-based) |
| Styling | React Native `StyleSheet` (no CSS-in-JS) |
| Animation | [Reanimated 4](https://docs.swmansion.com/react-native-reanimated/) · [Gesture Handler](https://docs.swmansion.com/react-native-gesture-handler/) |
| Backend | [Convex](https://convex.dev) client + [Better Auth](https://better-auth.com) (Expo) |
| Builds | [EAS Build](https://docs.expo.dev/build/introduction/) |

## Setup

### 1. Prerequisites

- Complete the [root Getting Started](../../README.md#getting-started) (Node 22.13+, pnpm, a running Convex deployment).
- An [Expo account](https://expo.dev/signup) to run on a device or make builds.
- A runtime: [Expo Go](https://expo.dev/go) on a phone, an Android emulator, or the iOS simulator (macOS).

### 2. Environment

Create `apps/mobile/.env.local` pointing at your Convex deployment (both required — the Convex client uses the first, Better Auth uses the second). `EXPO_PUBLIC_*` vars are inlined into the JS bundle and are **public** by design.

```bash
EXPO_PUBLIC_CONVEX_URL=https://<your-deployment>.convex.cloud
EXPO_PUBLIC_CONVEX_SITE_URL=https://<your-deployment>.convex.site
```

### 3. Run

From the **repo root** (recommended — keeps the workspace resolution correct):

```bash
pnpm mobile           # Expo dev server — scan the QR with Expo Go, or press 'a' / 'i'
pnpm mobile:android   # launch on a connected Android device / emulator
pnpm mobile:ios       # launch on the iOS simulator (macOS)
```

Make sure `pnpm convex` is running in another terminal so the app has a backend.

## Project Structure

```
app/                    Screens & layouts (file-based routing)
  (auth)/               Authentication & onboarding flow
  (tabs)/               Bottom tab navigator (Home, Radio, Giving, Updates)
  give/                 Multi-step giving flow
  *.tsx                 Detail & utility screens
components/
  ui/                   Reusable primitives (Button, Card, Badge, Input, …)
  navigation/           TopBar, BottomNav, MorePanel
  auth/                 Auth-specific components
contexts/               React Context providers (Theme, Giving flow)
constants/              Design tokens (colours, typography, spacing, shadows)
hooks/                  Custom hooks (useThemeColors, useColorScheme)
lib/                    Convex client & Better Auth wiring
assets/                 Fonts (Merriweather, Inter, JetBrains Mono) & images
app.json                Expo app config
eas.json                EAS Build profiles
metro.config.js         Monorepo-aware Metro config
```

## Design System — "Sacred Curator"

A bespoke design language inspired by cathedral interiors and premium editorial aesthetics. [`docs/INTERFACE_SPEC.md`](../../docs/INTERFACE_SPEC.md) is authoritative — all UI must derive from it.

**Palette (light / dark):** Gold `#785600`/`#C49A2C` (primary) · Crimson `#AB3332`/`#E05A59` (secondary) · Royal Blue `#145DA3`/`#4A8FD4` (tertiary) · Parchment `#FCF9F2`/`#141413` (surface).

**Typography:** Merriweather (display) · Inter (body/UI) · JetBrains Mono (amounts, timers, references).

**Core rules:**
- **Warm Parchment** — `#FCF9F2` base, never cold white.
- **No-Line Rule** — no 1px borders; depth via tonal background shifts.
- **Glass & Gold** — floating elements blur + translucent parchment; primary CTAs use gold gradients.
- **8-Point Grid** — spacing in multiples of 4px.
- **Haptics & Spring Physics** — every interaction gives tactile feedback; animations use spring dynamics.

## Building & Releasing

Builds run on **EAS**. Profiles live in [`eas.json`](eas.json):

| Profile | Output | Use |
|---------|--------|-----|
| `development` | APK + dev client | On-device debugging with hot reload |
| `preview` | Installable APK (internal) | QA / sharing without app stores |
| `production` | AAB | Play Store submission |

```bash
eas build --platform android --profile preview      # internal test APK
```

> **Node 22+ on EAS:** all profiles pin `node: "22.13.0"` because `pnpm@11` requires it. The build also needs `android.package` (set in `app.json`).

See [`docs/DEPLOYMENT.md`](../../docs/DEPLOYMENT.md) for the full pipeline (OTA updates vs. binary builds, channels, environments).

## Conventions

- Functional components with hooks; TypeScript strict mode.
- Prefer named exports for components.
- Follow Expo Router file-based routing conventions.
