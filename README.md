# KLT Cyber Church

A premium mobile application for **Kingdom Life Tabernacle (KLT) Cyber Church**, built with React Native and Expo. The app serves as a digital sanctuary for the church community, offering live radio streaming, giving, announcements, program schedules, and member engagement.

## Tech Stack

This repository is a **pnpm workspace monorepo** containing the mobile app, a web admin dashboard, and a shared Convex backend.

| Layer | Technology |
|-------|-----------|
| Monorepo | [pnpm workspaces](https://pnpm.io/workspaces) |
| Mobile | [Expo SDK 54](https://expo.dev) (managed workflow) · React Native 0.81 · React 19 |
| Web Admin | [Next.js 16](https://nextjs.org) (App Router) · React 19 · [Tailwind CSS 4](https://tailwindcss.com) |
| Backend | [Convex](https://convex.dev) (real-time database & serverless functions) |
| Language | TypeScript 5.9 (strict mode) |
| Navigation (mobile) | [Expo Router 6](https://docs.expo.dev/router/introduction/) (file-based routing) |
| Animations (mobile) | [React Native Reanimated 4](https://docs.swmansion.com/react-native-reanimated/) |
| Gestures (mobile) | [React Native Gesture Handler](https://docs.swmansion.com/react-native-gesture-handler/) |
| Styling (mobile) | React Native StyleSheet (no external CSS-in-JS) |

## Features

### Home
- Personalised greeting with date
- Church theme card for the year (image-backed)
- Weekly program cards (horizontal scroll, image-backed with scrim overlays)
- Scripture of the day with rotating brand-colour gradients
- Upcoming events carousel
- Quick links to giving and membership

### Reign Radio
- Live radio player with playback controls and volume
- Dynamic hero background (current program image or church theme fallback)
- Listener count display
- Live comments with real-time input
- Program schedule (online/hybrid programs)
- Personal sermon notes with auto-save

### Giving
- Monthly giving summary (image-backed hero card)
- 6 giving categories with multi-select (Tithe, Offering, Seed, Building Project, Missions, Special Gift)
- Multi-step contribution flow:
  - **Step 1** -- Amount entry with quick-select presets (10K--1M UGX)
  - **Step 2** -- Payment method (Mobile Money, Card, Bank Transfer) with contextual sub-forms
  - **Step 3** -- Review with anonymous and recurring toggles
  - **Step 4** -- Success confirmation with animated gold checkmark
- Recent transaction history

### Updates
- Weekly announcements with hero banner
- Pinned priority announcements
- Categorised announcement cards (General, Program, Event, Admin, Youth)
- Announcement detail with cross-links to related programs and events

### Programs & Events
- Full program directory with 11 church programs
- Upcoming events list (MWAT series, special services, baptisms)
- Program detail screens with hero images and clock-in functionality
- Event detail screens with date, time, and location

### Authentication
- Welcome screen with onboarding
- Sign in / forgot password
- 3-step registration flow with context-based state management

### Additional Screens
- Member directory with search and filters
- User profile management
- Notification centre

## Design System -- "Sacred Curator"

The app follows a bespoke design language inspired by cathedral interiors and premium editorial aesthetics.

### Colour Palette

| Role | Light | Dark |
|------|-------|------|
| Primary (Gold) | `#785600` | `#C49A2C` |
| Brand Gold | `#B8860B` | -- |
| Secondary (Crimson) | `#AB3332` | `#E05A59` |
| Tertiary (Royal Blue) | `#145DA3` | `#4A8FD4` |
| Surface (Parchment) | `#FCF9F2` | `#141413` |
| On Surface | `#1C1C18` | `#E8E4DA` |

### Typography

| Family | Usage | Font |
|--------|-------|------|
| Display | Screen titles, scripture, headings (18px+) | Merriweather Bold |
| Body | All UI text, labels, forms, navigation | Inter (Regular/Medium/SemiBold/Bold) |
| Mono | Amounts, timers, reference numbers | JetBrains Mono |

### Design Rules

- **Warm Parchment** -- `#FCF9F2` base, never cold white
- **No-Line Rule** -- No 1px borders; depth through tonal background shifts
- **Glass & Gold** -- Floating elements use blur + translucent parchment; primary CTAs use gold gradients
- **8-Point Grid** -- All spacing uses multiples of 4px
- **Haptic Feedback** -- Every interactive element provides tactile response
- **Spring Physics** -- Interactive animations use spring dynamics via Reanimated

## Project Structure

A pnpm workspace monorepo:

```
klt-cyber/
├── apps/
│   ├── mobile/            Expo / React Native app   (workspace package: "mobile")
│   └── admin/             Next.js web admin dashboard (workspace package: "admin")
├── convex/                Convex backend — schema, functions, generated types
├── docs/                  INTERFACE_SPEC.md and project documentation
├── package.json           Root workspace scripts
├── pnpm-workspace.yaml    Workspace package globs (apps/*, packages/*)
└── .npmrc                 pnpm config (hoisted node-linker)
```

### Mobile app — `apps/mobile`

```
app/                    Screens & layouts (file-based routing)
  (auth)/               Authentication flow (8 screens)
  (tabs)/               Bottom tab navigator (Home, Radio, Giving, Updates)
  give/                 Multi-step giving flow (4 screens)
  *.tsx                 Detail & utility screens
components/
  ui/                   Reusable primitives (Button, Card, Badge, Input, etc.)
  navigation/           Navigation components (TopBar, BottomNav, MorePanel)
  auth/                 Auth-specific components
contexts/               React Context providers (Theme, Registration, Giving)
constants/              Design tokens (colours, typography, spacing, shadows)
data/                   Data models & mock data (programs, events, announcements)
hooks/                  Custom hooks (useThemeColors, useColorScheme)
assets/
  fonts/                Merriweather, Inter, JetBrains Mono
  images/               Program images, icons, church theme
metro.config.js         Monorepo-aware Metro bundler config
```

### Web admin — `apps/admin`

```
app/                    Next.js App Router pages & layouts
public/                 Static assets
next.config.ts          Next.js config (Turbopack workspace root pinned)
```

### Backend — `convex/`

```
schema.ts               Database schema (define your tables here)
_generated/             Auto-generated API & type bindings (do not edit)
*.ts                    Query / mutation / action functions
```

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) 20+
- [pnpm](https://pnpm.io/installation) 11+ (package manager for the workspace)
- iOS Simulator (macOS) or Android Emulator, or a physical device with [Expo Go](https://expo.dev/go) — for the mobile app

### Installation

```bash
# Clone the repository
git clone <repository-url>
cd klt-cyber

# Install all workspace dependencies (mobile + admin + backend) from the root
pnpm install
```

### Development

All apps are launched from the repository root via workspace scripts:

```bash
# Mobile (Expo dev server)
pnpm mobile
pnpm mobile:android
pnpm mobile:ios

# Web admin (Next.js dev server → http://localhost:3000)
pnpm admin

# Backend (Convex dev — watches & pushes functions)
pnpm convex
```

> The Convex backend stores its deployment URL and keys in `.env.local` (git-ignored), generated on first `pnpm convex` / `convex dev`.

### Linting

```bash
# Lint every workspace package
pnpm lint
```

## Key References

| Document | Purpose |
|----------|---------|
| `docs/INTERFACE_SPEC.md` | Authoritative design and interface specification |
| `CLAUDE.md` | AI assistant project context and conventions |

## License

Private -- Kingdom Life Tabernacle. All rights reserved.
