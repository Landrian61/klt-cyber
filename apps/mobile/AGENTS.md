# Mobile app (`apps/mobile`)

## Overview

The consumer app for visitors and members, built with Expo and Expo Router. It is a view over content the web admin produces and talks to Convex directly.

## Stack

- Expo SDK 54, React Native 0.81, React 19.1, TypeScript 5.9
- Expo Router 6 (file based routing), Reanimated 4, Gesture Handler, `expo-haptics`
- `@better-auth/expo` + `@convex-dev/better-auth`, `expo-notifications`, `expo-updates`
- EAS Build and EAS Update (`eas.json`)

## Key files

| File | Owns |
|---|---|
| `app/**` | Screens, file based routes (`(auth)`, `(tabs)`, detail screens, `profile-completion`) |
| `app.config.ts` | Dynamic Expo config; app variants from `APP_VARIANT` |
| `eas.json` | Build profiles `development`, `preview` (staging channel), `production` |
| `metro.config.js` | Monorepo aware Metro setup (load bearing, see root) |
| `constants/theme.ts` | Design tokens for every screen |
| `lib/convex.ts`, `lib/auth.ts` | Convex client and Better Auth wiring |

## Commands

```bash
pnpm mobile                  # Expo dev server
pnpm mobile:android          # open on Android device or emulator
pnpm mobile:tunnel           # dev server over a tunnel
pnpm --filter mobile lint    # expo lint
```

## Conventions

- Root `AGENTS.md` rules apply. Load the `klt-cyber-brand` skill before any UI work; style with `StyleSheet` and tokens from `@/constants/theme`.
- Gate on `users.role` (visitor or member) only, never on `roleAssignments`.

## Gotchas

- `APP_VARIANT` unset means production. Locally, `.env.local` sets `APP_VARIANT=development` so the dev client opens.
- OTA updates (pushed to the `staging` channel on every merge to `main`) never carry native changes. New native deps, icons, splash or permissions need a fresh build via the "Build (preview APK)" workflow.
- `google-services.json` and `service-account.json` are git ignored; cloud builds get them from EAS environment variables.
- `patches/@expo__fingerprint@0.15.5.patch` (repo root) keeps the Windows runtime version matching EAS. Keep it when bumping Expo.

_Drafted by /audit from the repo, worth a quick human pass. Edit freely: once a line stops matching this draft, later runs treat it as curated and will flag rather than overwrite it._
