---
name: klt-cyber-brand
description: >
  Applies the "Sacred Curator" design language for the KLT Cyber Church React Native/Expo app.
  Use this skill whenever creating or modifying UI components, screens, layouts, theme files,
  or any visual element in this project. Triggers on: component creation, screen building,
  styling work, theme changes, layout adjustments, navigation UI, form building, card design,
  button styling, or any React Native styling task in the KLT Cyber Church codebase.
  Also use when reviewing UI code for design compliance. If the user mentions anything about
  colors, fonts, spacing, borders, cards, buttons, inputs, or visual design in this project,
  this skill applies.
---

# KLT Cyber Church — Sacred Curator Design Skill

You are building UI for the KLT Cyber Church mobile app. Every component, screen, and style must follow the **Sacred Curator** design language — a high-end editorial digital sanctuary combining cathedral warmth with premium magazine aesthetics.

The authoritative specification lives in `INTERFACE_SPEC.md` at the project root. This skill encodes the key rules and patterns so you produce compliant code by default. When in doubt, consult `INTERFACE_SPEC.md` directly.

---

## The Three Inviolable Rules

### 1. The Warm Parchment Rule
The base background is **always** `#FCF9F2` (warm parchment), never `#FFFFFF` or `#000000`. White (`#FFFFFF`) is reserved only for `surface-lowest` — elevated "lifted parchment" cards that float above the page. Text is `#1C1C18` (warm near-black), never pure black.

### 2. The No-Line Rule
**Never write `borderWidth: 1` with a solid visible border.** Boundaries are created through:
- Background color shifts (tonal surfaces stacked: `surface` → `surface-low` → `surface-lowest`)
- Whitespace (add `spacing[5]` breathing room when uncertain)
- Ghost borders in form fields only: `rgba(140, 132, 112, 0.15)`

**Only two hard lines are permitted in the entire app:**
- 2px bottom border (`colors.primary`) on focused input fields
- 3px left accent (`colors.primaryBrand`) on priority announcement cards

Before writing any border, ask: "Can I use a background shift or whitespace instead?"

### 3. The Glass & Gold Rule
Floating elements (bottom sheets, navigation bars, overlays) use glassmorphism:
- Background: `rgba(252, 249, 242, 0.82)` with `BlurView` (expo-blur, intensity ~20)
- CTAs use gold leaf gradient: `LinearGradient colors={['#785600', '#986d00']}` at 135deg

---

## Color Tokens

Import from `@/constants/theme` — never hardcode hex values in components.

```typescript
import { Colors } from '@/constants/theme';

// Primary (Gold) — brand identity, CTAs, active states
Colors.primary        // #785600 — text, icons, borders
Colors.primaryBrand   // #B8860B — gold highlights, gradients
Colors.primaryContainer // #986d00 — gradient endpoints
Colors.primaryFixedDim // #F5E6C8 — active background states
Colors.primaryLight   // #FBF3E0 — badge fills, tinted surfaces

// Secondary (Crimson) — urgency, LIVE indicators
Colors.secondary      // #AB3332
Colors.secondaryLight // #F9E5E5

// Tertiary (Royal Blue) — community, education
Colors.tertiary       // #145DA3
Colors.tertiaryLight  // #E3EEF9

// Surfaces (Parchment — warm, never cold)
Colors.surface        // #FCF9F2 — page background
Colors.surfaceLow     // #F5F1E8 — section containers
Colors.surfaceContainer // #EDE9DF — interactive cards
Colors.surfaceLowest  // #FFFFFF — elevated cards (lifted parchment)
Colors.surfaceHigh    // #E3DFD4 — hover, pressed
Colors.surfaceVariant // #EAE5DB — alternate sections

// Text
Colors.onSurface      // #1C1C18 — primary text
Colors.onSurfaceVariant // #5C5947 — secondary text
Colors.outline        // #8C8470 — borders, ghost borders
Colors.outlineVariant // rgba(140, 132, 112, 0.15) — ghost form borders
```

See `references/color-tokens.md` for the complete palette including semantic colors.

---

## Typography

Three font families, strictly separated by role:

| Font | Usage | Minimum Size |
|------|-------|-------------|
| **Merriweather** (700) | Hero text, sermon titles, scripture, section headings | 18px — never smaller |
| **Inter** (400/500/600/700) | All UI: labels, body, forms, navigation, badges | Any size |
| **JetBrains Mono** (400/700) | Giving amounts, countdowns, reference numbers only | Any size |

**Anti-patterns — NEVER:**
- Use Merriweather below 18px
- Use Merriweather for navigation, badges, or form inputs
- Use Inter for screen hero headings or section display titles
- Use JetBrains Mono outside amounts, timers, or reference numbers
- Use more than two typefaces on one screen

**Editorial Signature:** Hero headings use asymmetric margins — `paddingLeft: 32, paddingRight: 48`.

See `references/typography.md` for the full type scale.

---

## Spacing & Layout

8-point grid. All values are multiples of 4px:

```typescript
import { Spacing } from '@/constants/theme';
// Spacing[1]=4, [2]=8, [3]=12, [4]=16, [5]=20, [6]=24, [8]=32, [10]=40, [12]=48, [16]=64, [20]=80
```

- Default card padding: `Spacing[4]` (16px)
- Screen horizontal padding: `Spacing[5]` (20px)
- Editorial left margin: `Spacing[8]` (32px)
- Editorial right margin: `Spacing[12]` (48px)
- Hero vertical padding: `Spacing[20]` (80px)

**When uncertain, add `Spacing[5]` extra breathing room.** Silence is part of the spiritual experience.

---

## React Native / Expo Patterns

### Styling
- Always use `StyleSheet.create()` — never inline style objects
- Import tokens from `@/constants/theme`, never hardcode values
- Use `@/` path alias (maps to project root)

### Gradients
```typescript
import { LinearGradient } from 'expo-linear-gradient';
// Gold leaf CTA:
<LinearGradient colors={['#785600', '#986d00']} start={{x:0,y:0}} end={{x:1,y:1}} />
```

### Glassmorphism
```typescript
import { BlurView } from 'expo-blur';
<BlurView intensity={20} tint="light" style={styles.glass}>
  {/* Content */}
</BlurView>
// With semi-transparent background overlay: rgba(252, 249, 242, 0.82)
```

### Animations
```typescript
import Animated, {
  useSharedValue, useAnimatedStyle, withTiming, withSpring, interpolate
} from 'react-native-reanimated';
// Card press: scale 0.98 over 100ms
// Input focus: border expands from center, 200ms ease-out
// Floating label: translates up 150ms
// Bottom sheet: slide up 200ms cubic-bezier(0.32, 0.72, 0, 1)
// Tab switch: cross-fade 100ms
// All animations respect prefers-reduced-motion
```

### Haptics
```typescript
import * as Haptics from 'expo-haptics';
Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
// Use on: tab presses, button presses, toggle switches, pull-to-refresh
```

### Routing
- File-based routing in `app/` with Expo Router
- Auth flow: `app/(auth)/` group with Stack navigator, no headers
- Main app: `app/(tabs)/` group with bottom tab navigator
- Drill-down screens: push onto Stack, hide bottom nav

### Component Conventions
- Functional components with hooks, TypeScript strict mode
- Named exports (not default)
- Props interfaces defined and exported
- All interactive elements: minimum 44x44px touch target
- All text uses semantic color tokens, never hardcoded
- AccessibilityLabel on all interactive elements

---

## Component Quick Reference

See `references/component-patterns.md` for full specs. Key patterns:

**Button variants:** Primary (gold gradient, 52px), Ghost (transparent, gold border 20%), Destructive (crimson tint), TextLink (underlined, no bg), IconButton (44x44)

**Input fields:** Bottom-border only, floating label animation, ghost border at rest, 2px gold on focus, 52px height

**Cards:** Editorial (surface-lowest, tonal lift), Hero (gold gradient, white text), Sunken (primaryFixedDim), Priority (3px left gold accent)

**Badges:** 22px height, radius-full, tonal bg only (no borders), Inter text-xs weight 600

**Bottom sheets:** Glassmorphism, radius-xl top corners, 36x3px drag handle, ambient shadow

---

## Elevation & Depth

No drop shadows on regular elements. Depth comes from **tonal layering**:

1. Base page: `Colors.surface` (#FCF9F2)
2. Section containers: `Colors.surfaceLow` (#F5F1E8)
3. Interactive cards: `Colors.surfaceLowest` (#FFFFFF) — "lifted parchment"
4. Hover/pressed: `Colors.surfaceHigh` (#E3DFD4)

**Ambient shadow** — FABs and high-priority modals only:
```typescript
shadowColor: '#1C1C18',
shadowOffset: { width: 0, height: 8 },
shadowOpacity: 0.04,
shadowRadius: 32,
elevation: 4, // Android
```

---

## Roundedness

```typescript
import { Radius } from '@/constants/theme';
Radius.sm   // 4  — small elements
Radius.md   // 8  — standard cards, buttons
Radius.lg   // 12 — large cards
Radius.xl   // 20 — hero cards, sheet tops
Radius.full // 9999 — pills, avatars, badges
```

---

## Checklist Before Submitting Any UI Code

1. No `#FFFFFF` backgrounds (use `Colors.surface` or `Colors.surfaceLowest`)
2. No `#000000` text (use `Colors.onSurface`)
3. No `borderWidth: 1` with visible solid borders (use tonal shifts)
4. Merriweather only at 18px+ and only for headings/scripture
5. All touch targets >= 44x44px
6. All colors imported from theme, not hardcoded
7. `StyleSheet.create()` used, not inline objects
8. Spacing values from the 8-point grid
9. Gold gradient for primary CTAs (not flat color)
10. Glassmorphism on floating elements (not opaque backgrounds)
