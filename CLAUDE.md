# KLT Cyber Church App

## Project Overview
A premium mobile app for KLT Cyber Church built with **Expo SDK 54**, **React Native 0.81**, **Expo Router** (file-based routing), and **TypeScript**.

## Tech Stack
- **Framework:** Expo (managed workflow)
- **Navigation:** Expo Router (file-based routing in `app/` directory)
- **Language:** TypeScript
- **Styling:** React Native StyleSheet (no external CSS-in-JS library)
- **Animations:** React Native Reanimated
- **Gestures:** React Native Gesture Handler

## Commands
- `npm start` — Start Expo dev server
- `npm run android` — Start on Android
- `npm run ios` — Start on iOS
- `npm run web` — Start on web
- `npm run lint` — Run ESLint

## Project Structure
```
app/              — Screens & layouts (file-based routing)
  (tabs)/         — Bottom tab navigator screens
  _layout.tsx     — Root layout
components/       — Reusable UI components
  ui/             — Low-level UI primitives
constants/        — Theme & config constants
hooks/            — Custom React hooks
assets/           — Images, fonts, static files
```

## Design System
The app follows the **"Sacred Curator"** design language defined in `INTERFACE_SPEC.md`. Key rules:
- **Warm parchment palette** — never cold white (#FCF9F2 base, not #FFFFFF)
- **No-Line Rule** — no 1px solid borders; use background shifts and tonal transitions
- **Glass & Gold Rule** — see INTERFACE_SPEC.md for details
- **Gold primary** (#785600 / #B8860B), **Crimson secondary** (#AB3332), **Royal Blue tertiary** (#145DA3)

## Key References
- `INTERFACE_SPEC.md` — Authoritative design and interface specification. All UI implementation must be derived from this document.

## Code Conventions
- Use functional components with hooks
- Use TypeScript strict mode
- Follow Expo Router file-based routing conventions
- Prefer named exports for components
