# KLT Cyber Church App — Interface Specification
### Design Language: *Kingdom Radiant*

> **Purpose of this document**
> This file is the authoritative design and interface specification for the KLT Cyber Church mobile application. It governs every screen, component, field, state, and interaction in the base (cross-cutting) layer of the app. All implementation must be derived from this document. The design philosophy is **Kingdom Radiant** — the app should feel like *dawn breaking over a worship night*: deep heaven-blue depth lit by blazing gold, on a warm cream base that welcomes rather than dazzles. Red is the heartbeat — LIVE, priority, passion. This is a **Pentecostal, Born-Again, Spirit-filled** church; the interface is warm, vibrant, celebratory and alive, never austere or liturgical. Depth comes from light and soft warm shadow, never hard lines. Motion is joyful and gentle. Every word is spoken to family. Where this document is silent, apply the design system rules in Section 1 to fill the gap.
>
> **Design source of truth.** The canonical design is the *Kingdom Radiant* system authored in Claude Design (`docs/BRAND_DESIGN_PROMPT.md` → project `a671e013`, file *KLT Design System.dc.html*). Section 1 below is the implementation-facing transcription of that system and is authoritative for all tokens. This document supersedes the previous *"Sacred Curator"* language in full; where older screen sections (2–12) still quote legacy hexes (e.g. `#785600`, `#FCF9F2`), the Section 1 tokens win.

---

## Table of Contents

1. [Design System](#1-design-system)
2. [Navigation Architecture](#2-navigation-architecture)
3. [Auth Flow](#3-auth-flow)
4. [Home Tab](#4-home-tab)
5. [Radio Tab](#5-radio-tab)
6. [Members Tab](#6-members-tab)
7. [Updates Tab](#7-updates-tab)
8. [More — Overflow Bottom Sheet](#8-more--overflow-bottom-sheet)
9. [Notifications Panel](#9-notifications-panel)
10. [My Profile Screen](#10-my-profile-screen)
11. [Giving Screen](#11-giving-screen)
12. [Global Interaction Rules](#12-global-interaction-rules)

---

## 1. Design System

### 1.1 Creative North Star

> *"Kingdom Radiant" — dawn breaking over a worship night.*

This interface rejects both the templated feel of standard mobile apps and the cold solemnity of high-church aesthetics. It is warm, radiant, and alive — the feeling of a living, joyful, Spirit-led worship service: hands raised, "Shalom, Saints!", a congregation that is *glad you showed up*. Premium and refined, always — but through **light, colour, and generosity**, not austerity or silence.

The guiding image is **dawn over a worship night**: deep heaven-blue depth (the night of prayer) giving way to blazing gold (the glory breaking through), grounded on a warm cream base that welcomes rather than dazzles. Red is the heartbeat — passion, the blood, LIVE broadcasts, urgency.

**Explicitly avoid:** cathedral/Catholic/high-church cues (stained glass, incense-grey solemnity, Gothic type, monastic restraint, "quiet museum"); cold clinical minimalism; heavy funereal palettes; and generic "spiritual app" clichés. Reverence here is expressed through **radiance and excellence**, not through hush.

---

### 1.2 Colour Palette & Surface Philosophy

The three sacred KLT colours — **Gold, Red, Blue** (from the Kingdom Life Tabernacle crown logo) — retuned for radiance, over a warm cream base. All pairings below meet WCAG AA at their intended sizes. Token names map 1:1 to `apps/mobile/constants/colors.ts`.

```
/* --- Primary: Gold (Kingdom & glory) --- */
--color-primary:            #D98E0B   /* gold.700 — on-cream gold: links, active tab, labels, icons */
--color-primary-brand:      #E9A820   /* gold.500 — brand highlight, active fills, celebration */
--color-primary-deep:       #8A5A05   /* gold.900 — strong gold text: amounts & timers on cream */
--color-primary-container:  #D98E0B   /* gradient base (see gold gradient) */
--color-primary-fixed-dim:  #FBECC9   /* selected card fill (solid light gold) */
--color-primary-light:      #FCEFD1   /* light gold tint — badge/icon containers, hero-gradient start */
--color-gold-tint:          rgba(233,168,32,0.16)  /* translucent badge/selected wash */
--color-on-primary:         #3A2604   /* SIGNATURE: dark cocoa text ON gold — never white on gold */
/* Gold gradient (primary CTAs, active states, avatars): 135deg  #F7C64B → #D98E0B */

/* --- Secondary: Red (the blood, passion, urgency) --- */
--color-secondary:          #D64541   /* red.500 — LIVE, priority, unread counts, destructive */
--color-secondary-dark:     #A32623   /* red.700 — pressed / dark accents */
--color-secondary-light:    #FBE7E6   /* solid light red — destructive/error tint surfaces */
--color-red-tint:           rgba(214,69,65,0.12)   /* priority card wash, red badges */
--color-on-secondary:       #FFFFFF

/* --- Tertiary: Blue (heaven, the Spirit, community, teaching) --- */
--color-tertiary:           #2C63D9   /* blue.500 — links, community, teaching, info */
--color-tertiary-deep:      #12306E   /* blue.700 — heaven-depth heroes, scripture text on cream */
--color-tertiary-deepest:   #0C2154   /* blue.900 — deepest hero gradient stop */
--color-tertiary-light:     #E4ECFB   /* solid light blue — category/info badges */
--color-blue-tint:          rgba(44,99,217,0.12)   /* info states, category badges */
--color-on-tertiary:        #FFFFFF
/* Heaven gradient (heroes, scripture zones): 160-175deg  #0C2154 → #12306E → #2C63D9 */

/* --- Surface (Cream — warm, never clinical) --- */
--color-surface:            #FDF8F0   /* cream.bg — app background */
--color-surface-low:        #F6EDDE   /* cream.sunken — inset zones, input rests, skeletons */
--color-surface-container:  #F1E7D6   /* alternate section background */
--color-surface-lowest:     #FFFFFF   /* lifted cards only, with warm shadow */
--color-surface-high:       #E8DCC6   /* pressed surfaces, toggle-off track */
--color-surface-variant:    #F3EADB   /* alternate section background */
--color-surface-bright:     #FFFDFA   /* highlight surfaces */

/* --- Text --- */
--color-on-surface:         #241B10   /* ink — primary text, warm near-black */
--color-on-surface-variant: #5C4F3D   /* secondary body text */
--color-outline:            #8A7C68   /* muted — captions, timestamps, placeholders */
--color-faint:              #B5A88F   /* faint — disabled, subtlest hints */
--color-outline-variant:    rgba(138,124,104,0.16)  /* ghost borders in forms */

/* --- Semantic (even errors speak warmly) --- */
--color-success:            #2E8B57   /* confirmed, saved, approved */
--color-success-light:      #E3F1EA
--color-warning:            #D98E0B   /* = gold.700 */
--color-warning-light:      #FCEFD1
--color-error:              #D64541   /* = red.500 */
--color-error-light:        #FBE7E6
--color-live:               #D64541
--color-unread:             #D64541   /* unread counts are red */
```

#### The "No-Line" Rule

**1px solid high-contrast borders are strictly prohibited throughout the entire application.**

Boundaries are defined exclusively by:
1. **Background Shifts:** A `--color-surface-lowest` card on a `--color-surface` page. The tonal difference defines the edge.
2. **Tonal Transitions:** Stepping between `--color-surface-variant` and `--color-surface-bright`.
3. **Ghost Borders (forms only):** `--color-outline-variant` at 15% opacity — a barely-there hint.

Boundaries are defined by tonal shifts, whitespace, and **soft warm glow** (Section 1.6) — never by outlines.

The only permitted "lines" in the entire app are soft accents, not hard rules:
- The **gold focus ring** on an active input — an inset `2px #E9A820` glow on a white fill, not a hard border.
- The **red-tint left wash** on priority announcement cards (`--color-red-tint`, a gradient fade, not a solid stripe).

#### The "Radiance" Rule (replaces Glass & Gold)

Floating chrome — the top bar and bottom navigation — sits on a **warm translucent cream**:
- Background: `rgba(253, 248, 240, 0.94)`
- Optional light blur behind (`blur(20px)`); no hard border.

**Heroes and depth zones** (welcome, home theme card, radio player, giving summary, auth headers) use the **heaven gradient** — deep blue lit from below by gold:
- `background: linear-gradient(165deg, #0C2154, #12306E 55%, #2C63D9 130%)`
- A radial gold glow anchored bottom/corner: `radial-gradient(100% 80% at 100% 110%, rgba(247,198,75,.55), transparent 60%)`
- Scripture and hero titles sit in white over this depth.

**Primary CTAs** use the **gold-leaf gradient** with dark cocoa text and a **gold glow** shadow:
- `background: linear-gradient(135deg, #F7C64B, #D98E0B)`
- Text `--color-on-primary` (#3A2604). Shadow `0 10px 30px rgba(217,142,11,.45)`.
- Radius: pill (`--radius-full`). This is the single most recognisable element in the app.

---

### 1.3 Typography

```
/* --- Font Families (all Google Fonts, OFL — bundled as static TTFs) --- */
--font-display:  'Bricolage Grotesque' (800 ExtraBold / 700 Bold)
  /*
    Warm, characterful, alive. For: greetings, screen titles, card titles,
    section headers, and celebration moments. 800 for heroes/greetings/titles;
    700 for section headers (h2). Minimum size 16px. Never for body or inputs.
  */

--font-body:     'Plus Jakarta Sans' (400/500/600/700/800, + 400 italic)
  /*
    Crisp at small sizes. For: all UI text, labels, body copy, navigation,
    form fields, captions. The italic is reserved for SCRIPTURE.
  */

--font-mono:     'Spline Sans Mono' (500 / 600)
  /* For: giving amounts, countdown timers, reference numbers. */

/* --- Type Scale --- */
--text-display:  32 / 38   Bricolage 800  -1%   /* Greetings ("Shalom, Grace") */
--text-h1:       24 / 30   Bricolage 800         /* Screen / hero titles */
--text-h2:       18 / 24   Bricolage 700         /* Section headers ("This week at KLT") */
--text-scripture:15 / 26   Jakarta 400 italic    /* The Word — see rules below */
--text-md:       16 / 24   Jakarta 500-700       /* Card titles, interactive labels */
--text-base:     15 / 23   Jakarta 400-600       /* Default body, list items */
--text-sm:       13 / 18   Jakarta 500           /* Secondary text */
--text-caption:  12.5/ 17  Jakarta 500           /* Captions, meta, timestamps */
--text-label:    10.5      Jakarta 800  +20%     /* Uppercase eyebrow labels (gold) */
--text-mono-lg:  22 / 1.2  Spline 600            /* Amounts, timers */

/* --- Hierarchy Rules --- */
/*
  - Bricolage for greetings, screen/card titles, section headers, celebration.
  - Jakarta for everything functional (body, labels, nav, inputs, captions).
  - Mono wherever money, time, or reference numbers appear.
  - SCRIPTURE gets the most elevated treatment on any screen: italic Jakarta,
    in white over a heaven-gradient zone (or in --color-tertiary-deep #12306E on
    cream), always followed by a gold, mono, letter-spaced reference label
    (e.g. "MATTHEW 16:19 · KJV"). The church quotes KJV — preserve that register.
  - Respect system font scaling. Never render below 12.5px.
  - Never use two decorative faces on one screen (Bricolage is the only display face).
*/
```

---

### 1.4 Spacing

8-point grid. All values are multiples of 4px.

```
--space-1:   4px
--space-2:   8px
--space-3:   12px
--space-4:   16px    /* Default card padding */
--space-5:   20px    /* Standard screen horizontal padding */
--space-6:   24px
--space-8:   32px    /* Editorial left margin for display headings */
--space-10:  40px
--space-12:  48px    /* Editorial right margin — creates intentional asymmetry */
--space-16:  64px
--space-20:  80px    /* Generous hero section vertical padding */
```

> **The whitespace rule:** When uncertain, add `--space-5` of extra breathing room rather than packing content tighter. Silence is part of the spiritual experience.

---

### 1.5 Roundedness

Kingdom Radiant is a **soft, rounded** system — nothing sharp.

```
--radius-sm:   10px  /* Small chips, inner elements */
--radius-md:   14px  /* Inputs, small buttons, list rows */
--radius-lg:   20px  /* Standard cards */
--radius-xl:   24px  /* Heroes, large cards, sheet tops (28px on sheets) */
--radius-full: 9999px /* Pills, buttons, avatars, filter/segment controls */
```

> **Buttons are pills.** All primary/secondary/ghost/destructive buttons and all filter/segment pills use `--radius-full`. Cards use `lg`/`xl`. Inputs use `md`.

---

### 1.6 Elevation & Depth (Tonal Layering)

Depth is created by **warm blue-tinted glow** and stacked surface tiers — never hard lines or Material drop shadows. The shadow colour is blue.700 (`rgb(18,48,110)`), which reads as warm light lifting a card off the cream.

```
Layering stack (bottom to top):
  Base page:            --color-surface         #FDF8F0
  Section containers:   --color-surface-low     #F6EDDE
  Interactive cards:    --color-surface-lowest  #FFFFFF  ← "lifted" by glow
  Pressed:              --color-surface-high     #E8DCC6
```

**Elevation presets** (shadowColor `#12306E`):
```css
--e1:        0 2px 10px rgba(18,48,110,.07);   /* list cards, small tiles */
--e2:        0 6px 20px rgba(18,48,110,.10);   /* heroes, sheets, key cards */
--gold-glow: 0 10px 30px rgba(217,142,11,.45); /* PRIMARY CTA ONLY */
```

### 1.6b Motion

Joyful and gentle — motion is joy, not noise. Nothing loops loudly. Everything runs at 60fps on the native thread (Reanimated) and honours `prefers-reduced-motion` (→ cross-fade only).

- **Entrances:** 240ms ease-out, 12–14px rise + fade, 40ms stagger per card.
- **Press:** scale 0.97, ~120ms.
- **LIVE dot:** 1.2s soft pulse (opacity/scale).
- **Giving success:** gold checkmark spring (~500ms, slight overshoot) + gentle radial shimmer ring.
- **Radio waveform:** audio-reactive bars, native-thread.
- **Skeletons:** warm shimmer sweep over `--color-surface-low`, ~1.4s loop.

---

### 1.7 Component Primitives

#### Buttons

**Primary (Gold-Leaf CTA)**
- Background: `linear-gradient(135deg, #F7C64B, #D98E0B)`
- Text: `--color-on-primary` (#3A2604), `--font-body` weight 800, `--text-md`.
- Height: 54–56px. Border radius: `--radius-full` (pill). Full width by default.
- Shadow: `--gold-glow`. Pressed: scale 0.97 + darken ~6%.
- Loading: label → 3-dot pulse, width locked. Disabled: same gradient at 40% opacity.

**Secondary (Gold Tint)**
- Background: `--color-gold-tint`. Text: `--color-primary-deep` (#8A5A05), weight 700.
- Height: 46–52px. Border radius: `--radius-full`. No border.

**Ghost**
- Background: transparent. Inset ring: `1.5px rgba(36,27,16,.18)` (soft, not a hard rule).
- Text: `--color-on-surface`, weight 700. Height: 46–52px. Radius: `--radius-full`.
- Pressed: fill `--color-gold-tint`.

**Destructive**
- Background: solid `--color-secondary` (#D64541). Text: white, weight 700.
- Height: 46–52px. Radius: `--radius-full`. Pressed: `--color-secondary-dark`.

**Text Link**
- No background/border. Text: `--color-primary` (or `--color-primary-deep` for emphasis), `--text-sm`/`--text-base`, weight 800.

**Icon Button**
- 40–44px circle, `--color-surface-lowest` fill with `--e1` glow, icon `--color-on-surface` 18–22px.

**Icon Button**
- 44px × 44px minimum touch target. Icon 22px centered. Transparent background; `--color-primary-light` at 60% when active.

#### Input Fields

Minimalist — no enclosing box, defined by bottom border only.

- Background: transparent
- Top / side borders: none
- Bottom border: `1px solid rgba(140, 132, 112, 0.15)` at rest
- On focus: bottom border expands from center (200ms ease-out) → `2px solid --color-primary`
- Floating label: animates upward when field is active or filled (150ms). At rest: same position as placeholder. Font: `--text-sm`, `--font-body`, `--color-on-surface-variant`.
- Placeholder: `--text-base`, `--color-outline`. Visible only when empty and unfocused.
- Value text: `--text-base`, `--color-on-surface`, weight 400.
- Helper text: `--text-xs`, `--color-on-surface-variant`, below field.
- Error: bottom border `--color-error`. Helper becomes `--color-error`. No fill change.
- Height: 52px.

#### Cards

**Editorial Card (standard)**
- Background: `--color-surface-lowest` on `--color-surface` page.
- Tonal lift defines the boundary — no explicit border.
- Border radius: `--radius-lg`. Padding: `--space-4`. No dividers between list items.

**Hero Card (Gold)**
- Background: `linear-gradient(135deg, #785600, #986d00)`.
- Border radius: `--radius-xl`. Padding: `--space-5`. All text white. Ambient shadow.

**Sunken Card (active state)**
- Background: `--color-primary-fixed-dim`. No border. Border radius: `--radius-lg`.

**Priority Card (announcements)**
- Background: `--color-surface-lowest`. Left accent: 3px solid `--color-primary-brand`. Radius: `0 --radius-lg --radius-lg 0` (flat left side).

#### Badges & Pills

Height: 22px. Padding: 2px 10px. Border radius: `--radius-full`. Font: `--font-body`, `--text-xs`, weight 600. No border — tonal background separation.

| Badge | Background | Text |
|---|---|---|
| Minister | `--color-primary-light` | `--color-primary` |
| Mentorship complete | `--color-success-light` | `--color-success` |
| Elder | `#FBF3E0` | `#785600` |
| Pastoral | `--color-primary-light` | `--color-primary` |
| Pastoral spouse | `--color-primary-light` | `--color-primary` |
| Elder spouse | `#FBF3E0` | `#785600` |
| HOD | `--color-primary-light` | `--color-primary` |
| Visitor | `--color-tertiary-light` | `--color-tertiary` |
| Member | `--color-primary-light` | `--color-primary` |
| Pending | `--color-warning-light` | `--color-warning` |
| Confirmed | `--color-success-light` | `--color-success` |
| Ended | `--color-surface-low` | `--color-on-surface-variant` |
| LIVE | `--color-secondary` | white |
| Priority | `--color-primary-light` | `--color-primary` |

#### Segmented Controls

- Container: `--color-surface-low`, `--radius-full`, 4px padding. No border.
- Active segment: `linear-gradient(135deg, #785600, #986d00)`, white text, `--radius-full`.
- Inactive: transparent, `--color-on-surface-variant`.
- Height: 40px. Equal width segments.

#### Progress Steps

- Bar: full width, height 3px, `--radius-full`.
- Completed segment: `linear-gradient(90deg, #785600, #B8860B)`.
- Incomplete: `--color-surface-high`. Segments separated by 3px gaps.
- Step label: `--text-xs`, `--color-outline` (incomplete) / `--color-primary` (active or complete).

#### The Scripture Scroller (Signature Component)

A horizontal carousel for scripture, testimonies, and thematic content.

- Track background: `--color-surface-low`.
- **Active (center) card:** `--color-surface-lowest`, scale 1.0, no blur. `--radius-xl`. Padding `--space-5`. Ambient shadow.
- **Previous / Next cards:** Scale 0.90, `backdrop-filter: blur(20px)`, opacity 0.6. Partially visible at edges.
- Scripture text: `--font-display`, `--text-xl`, `--color-on-surface`.
- Reference: `--font-body`, `--text-sm`, `--color-on-surface-variant`.
- Swipe-enabled. Momentum scroll.

#### Live Indicator

- `--color-secondary` filled circle, 8px diameter.
- Outer pulse ring: `--color-secondary` at 30% opacity, animating 8px → 20px → 8px diameter, 4s ease-in-out infinite.
- Used exclusively for active broadcast states.

#### Bottom Sheet

- Background: `rgba(252, 249, 242, 0.82)` + `backdrop-filter: blur(20px)`.
- Top corners: `--radius-xl`. Drag handle: 36px × 3px, `--color-outline` at 30%, `--radius-full`, centered, 10px from top.
- Ambient shadow: `0 -8px 32px rgba(28, 28, 24, 0.04)`.
- Overlay behind: `rgba(28, 28, 24, 0.45)`. Tapping overlay dismisses.

---

## 2. Navigation Architecture

### 2.1 Top Bar

Persistent across all five main tab screens. Hidden on auth screens, drill-down detail screens, and sheet overlays.

**Layout:** Fixed to top. Height: 56px. Background: `rgba(252, 249, 242, 0.82)`, `backdrop-filter: blur(20px)`. No border below — separation is tonal.

**Left:** App wordmark "KLT Cyber Church" — `--font-display`, weight 700, `--text-md`, `--color-primary`.

**Right (two icon buttons):**

1. **Notification bell**
   - Outlined bell icon, 22px, `--color-on-surface-variant`.
   - Unread badge: `--color-secondary` filled circle, 16px, white text `--text-xs` weight 700. Shows 1–9 or "9+".
   - Tapping → Notifications Panel (Section 9).

2. **Profile avatar**
   - 32px circle, 2px solid `--color-primary` border, photo crop.
   - No photo fallback: initials on `linear-gradient(135deg, #785600, #986d00)`, white `--font-body` `--text-sm` weight 700.
   - Tapping → My Profile (Section 10).

---

### 2.2 Bottom Navigation Bar

Persistent across all five main tab screens.

**Layout:** Fixed to bottom. Height: 64px + safe area inset. Background: `rgba(252, 249, 242, 0.82)`, `backdrop-filter: blur(20px)`. No top border. Ambient shadow: `0 -4px 24px rgba(28, 28, 24, 0.04)`.

**Five items (left to right):** Home | Radio | Members | Updates | More

**Each item:**
- Icon: 24px centered.
- Label: `--text-xs`, `--font-body`, weight 500, 4px below icon.
- **Active:** icon and label `--color-primary`. A 2px × 24px gold top ribbon above the item.
- **Inactive:** icon and label `--color-outline`.
- Touch target: full column width × full bar height.

**"More":** Tapping slides up the More Bottom Sheet (Section 8). "More" item enters active state while sheet is open.

---

### 2.3 Screen Hierarchy

```
Auth Flow (no nav bars)
├── Welcome
├── Sign In
├── Forgot Password
└── Registration Step 1 → Step 2 → Step 3 → Success

Main App (top bar + bottom nav)
├── Home Tab
├── Radio Tab
│   └── Live Engagement Sheet (overlay)
├── Members Tab
│   └── Public Member Profile (drill-down)
├── Updates Tab
│   └── Announcement Detail (drill-down)
└── More Sheet
    ├── Giving → Payment Sheet
    ├── Library
    ├── Media & Events
    ├── Administration (secondary login gate)
    ├── Tower of Faith
    ├── Appointments
    ├── Inquiries
    └── Procurement

Global (top bar, any tab)
├── Notifications Panel
└── My Profile
```

---

## 3. Auth Flow

**Shared rules for all auth screens:**
- No top bar. No bottom nav.
- Page background: `--color-surface` (#FCF9F2).
- Keyboard avoidance: screen scrolls so active field is always above keyboard.
- Back arrow (←) top-left, 44px touch target, `--color-on-surface`. Absent on Welcome only.
- Inputs use the minimalist bottom-border-only style (Section 1.7).
- Generous spacing — auth screens must never feel cramped.

---

### 3.1 Welcome Screen

**Layout (top to bottom):**

1. **Logo area** — centered, 28% from top.
   - 88px circle, `linear-gradient(135deg, #785600, #986d00)` background. White church icon SVG (40px) centered.
   - "KLT Cyber Church" — `--font-display`, weight 700, `--text-xl`, `--color-primary`, centered. Margin top 16px.
   - "Grow. Connect. Serve." — `--font-body`, weight 400, `--text-base`, `--color-on-surface-variant`, centered, letter-spacing 0.8px. Margin top 8px.

2. **Button group** — lower third. `--space-5` horizontal padding.
   - Gold CTA: "Sign in" (52px height, full width).
   - Gap: 12px.
   - Ghost: "Create account" (52px height, full width).

3. **Visitor link** — centered, margin top 20px.
   - "Just browsing? " `--color-outline` `--text-sm` + "Continue as visitor" `--color-primary` `--text-sm` weight 500, underlined.
   - Entering as visitor sets `account_type = visitor` session.

**No scrolling on this screen.** All content visible without scroll on any device taller than 600px.

---

### 3.2 Sign In Screen

**Header:**
- Back arrow.
- "Welcome back" — `--font-display`, weight 700, `--text-xl`, `--color-on-surface`. Margin top 24px. Asymmetric: left 32px, right 48px.
- "Sign in to continue" — `--font-body`, `--text-base`, `--color-on-surface-variant`. Margin top 6px.

**Form** (margin top 36px, `--space-5` horizontal padding):

1. **Email address** — floating label. Type: email. Autocomplete: email. Error: "Please enter a valid email address."

2. **Password** (margin top 28px) — floating label. Type: password. Eye icon (20px, `--color-outline`) right side for show/hide. Autocomplete: current-password.

3. **"Forgot password?"** (margin top 10px, right-aligned) — gold text link, `--text-sm`, weight 500.

**Sign in button** (margin top 36px): gold CTA "Sign in".
- Loading: spinner replaces label.
- Success: fade to Home Tab.
- Failure: error text below button — `--text-sm`, `--color-error`, centered. "Incorrect email or password."

**Create account link** (margin top 28px, centered): "New here? " `--color-on-surface-variant` + "Create an account" `--color-primary` weight 500, underlined.

---

### 3.3 Forgot Password Screen

**Header:**
- Back arrow.
- "Reset your password" — `--font-display`, weight 700, `--text-xl`. Asymmetric margin.
- "Enter your email and we'll send a reset link." — `--font-body`, `--text-base`, `--color-on-surface-variant`.

**Form** (margin top 36px): Email address field.

**Button** (margin top 36px): "Send reset link" — gold CTA.

**Success state** (replaces form):
- 80px checkmark circle (`--color-success` fill). Centered.
- "Check your inbox" — `--font-display`, `--text-xl`, centered. Margin top 16px.
- "Reset link sent to [email]. Expires in 30 minutes." — `--font-body`, `--text-base`, `--color-on-surface-variant`, centered.
- "Back to sign in" — gold text link, centered, margin top 24px.

---

### 3.4 Registration — Step 1: Personal Bio

**Header:**
- Back arrow.
- Progress bar: 3 segments, segment 1 gold gradient, 2–3 `--color-surface-high`. 3px height, `--radius-full`. Full width. Margin top 16px.
- "Step 1 of 3 — Personal information" — `--text-xs`, `--color-on-surface-variant`. Margin top 6px.
- "Tell us about yourself" — `--font-display`, weight 700, `--text-xl`. Asymmetric margin. Margin top 20px.
- "This information builds your church profile." — `--font-body`, `--text-sm`, `--color-on-surface-variant`. 20px padding.

**Form fields** (20px horizontal padding, 28px vertical gap between fields):

1. **First name + Last name** — side by side, equal width, 12px gap. Both floating-label.

2. **Email address** — full width. Error if taken: "This email is registered. Sign in instead?" with inline link.

3. **Password** — floating label "Create password". Eye toggle. Helper: "Minimum 8 characters."
   - Strength bar below helper: 3px, full width, `--radius-full`. 3 segments: fills left to right as strength increases. Colours: 1 = `--color-error`, 2 = `--color-warning`, 3 = `--color-success`.

4. **Confirm password** — floating label. Eye toggle. Error: "Passwords do not match."

5. **Date of birth** — floating label. OS date picker on tap. Format: DD / MM / YYYY. Helper: "You must be 13 or older to register." Validation: blocks if user < 13 years old.

6. **Sex** — segmented control (gold/ghost). "Male" | "Female". No default. Required to proceed.

7. **Marital status** — 2×2 grid of selectable pill cards:
   ```
   [Single]   [Married]
   [Widowed]  [Divorced]
   ```
   Each: height 48px, `--color-surface-low` background, `--radius-md`, `--text-sm`, `--color-on-surface-variant`.
   Selected: `--color-primary-fixed-dim` background, text `--color-primary`, 2px bottom accent `--color-primary`.

**Footer:** Gold CTA "Continue to step 2". Disabled (surface-high bg, outline text) until all fields are valid. 32px margin bottom + safe area.

---

### 3.5 Registration — Step 2: Church Profile

**Header:**
- Back arrow (preserves Step 1 data).
- Progress bar: segments 1 & 2 gold, 3 `--color-surface-high`.
- "Step 2 of 3 — Church involvement".
- "Your church identity" — `--font-display`, weight 700, `--text-xl`. Margin top 20px.
- "Connect yourself to the community." — `--font-body`, `--text-sm`, `--color-on-surface-variant`.

**Form fields** (20px padding, 28px gap):

1. **Clan selection** — floating label "Clan affiliation". Tappable selector (chevron right). On tap: bottom sheet listing 12 clan names as tappable rows. Selected clan appears with gold checkmark. Helper: "Subject to leadership approval." Optional.

2. **Departments** — floating label "Departments you serve in". Sub-label: "Select up to 3". Tapping opens checkbox sheet. Selected as removable gold pill tags. Helper: "Shown on profile after HOD approval." Optional. Max 3; remaining disable after 3 selected.

3. **Mentorship status** — label above: "Mentorship status". Three vertically stacked radio cards (no dividers, `--space-3` gap):
   - "Not enrolled in mentorship"
   - "Currently undergoing mentorship"
   - "Completed mentorship training"
   
   Radio card: height 56px, `--color-surface-low`, `--radius-md`. Selected: `--color-primary-fixed-dim`, radio filled gold, text `--color-primary`.

4. **Children toggle** — "I have children" row + on/off switch. Default off. When on: animated expansion reveals child entries.
   - Child row: first name input + DOB date picker + × remove.
   - "+ Add child" gold text link. Max 10 children.

5. **Spouse info** — conditional (shown if marital status = Married in Step 1). Label "Spouse". Input "Spouse's full name". Helper: "Your spouse can be linked later if they join the app."

**Footer:** Gold CTA "Continue to step 3". "Skip this step →" text link `--color-on-surface-variant` below. All fields optional.

---

### 3.6 Registration — Step 3: Optional Details

**Header:**
- Back arrow.
- Progress bar: all 3 segments gold.
- "Step 3 of 3 — Optional details".
- "A little more about you" — `--font-display`, weight 700, `--text-xl`. Margin top 20px.
- "All optional — you can complete this from your profile anytime." — `--font-body`, `--text-sm`, `--color-on-surface-variant`.

**Form fields** (20px padding):

1. **Professional information** — collapsible section.
   - Header: "Professional information" `--text-md`, weight 600, `--color-on-surface` + chevron right `--color-outline`. Tap to expand (chevron rotates 90°).
   - Expanded:
     - "Profession / field of work" — floating label.
     - "Job title or role" — floating label.
     - "Workplace or organisation" — floating label.
     - Toggle: "Show on public profile" `--text-sm`, `--color-on-surface-variant` + switch. Default OFF.

2. **Leadership Institute** — collapsible section.
   - Header: "Leadership Institute progress" + chevron.
   - Expanded: note `--text-sm`, `--color-on-surface-variant`, then 4 radio cards:
     - "Not enrolled" (pre-selected)
     - "Level 1"
     - "Level 2"
     - "Advanced Level"
   - Helper: "Verified by the Leadership Institute department."

**Footer:** Gold CTA "Create my account". Legal note below: "By creating an account you agree to our Terms of Service and Privacy Policy." `--text-xs`, `--color-outline`, centered.

---

### 3.7 Registration Success Screen

No nav bars. Background: `--color-surface`.

**Centered layout:**

1. 96px circle, `linear-gradient(135deg, #785600, #986d00)`. White checkmark SVG (48px).

2. "You're in the family!" — `--font-display`, weight 700, `--text-xl`, `--color-on-surface`, centered. Margin top 20px.

3. "Welcome to KLT Cyber Church, [First name]. Your account is ready. Clan and department memberships will appear once approved by leadership." — `--font-body`, `--text-base`, `--color-on-surface-variant`, centered, max-width 280px. Margin top 12px.

4. Gold CTA "Go to my home screen". Margin top 32px. → Home Tab.

5. **Pending notice** (only if clan/departments were selected): `--color-warning-light` card, `--radius-lg`. No border. Padding `--space-4`. Info icon `--color-warning` (16px) + "Your clan and department selections are pending approval. You'll be notified when confirmed." `--text-sm`, `--color-primary`. Margin top 16px.

---

## 4. Home Tab

**Top bar:** Visible. **Bottom nav:** Visible, Home active. **Background:** `--color-surface`. Scrollable.

---

**Section 1: Greeting**

Padding top `--space-5`. Left `--space-8`, right `--space-12` (editorial asymmetry).

- Salutation: "Good morning," / "Good afternoon," / "Good evening," — `--font-body`, `--text-base`, `--color-on-surface-variant`. Time ranges: morning 05:00–11:59, afternoon 12:00–16:59, evening 17:00–04:59.
- First name: `--font-display`, weight 700, `--text-xl`, `--color-on-surface`. Margin top 2px.
- Date: "Friday, 3 April 2026" — `--font-body`, `--text-sm`, `--color-outline`. Margin top 4px.

---

**Section 2: Monthly Theme Card**

Margin top `--space-5`. `--space-5` horizontal padding.

- Gold gradient hero card. `--radius-xl`. Padding `--space-5`. Ambient shadow.
- Label: "Theme for [Month]" — `--font-body`, `--text-xs`, weight 600, white 65% opacity, uppercase, letter-spacing 0.8px.
- Theme title: `--font-display`, weight 700, `--text-xl`, white. Margin top 6px.
- Scripture: `--font-display`, `--text-sm`, italic, white 80% opacity. Margin top 4px.
- Hidden entirely if no theme is set by leadership.

---

**Section 3: Weekly Activities**

Margin top `--space-6`.

Header row (left `--space-5`, right `--space-5`): "This week" `--font-body`, `--text-md`, weight 600, `--color-on-surface` + "See all" `--color-primary`, `--text-sm`, weight 500.

Horizontally scrollable row of activity cards. `--space-5` leading left. `--space-3` gap.

**Activity card (210px width):**
- `--color-surface-lowest`. `--radius-lg`. Padding `--space-4`. Ambient shadow.
- Activity name: `--font-body`, `--text-md`, weight 600, `--color-on-surface`.
- Day & time: `--font-body`, `--text-sm`, `--color-on-surface-variant`. Margin top 4px.
- `--space-3` spacer + 1px `--color-surface-high` separator (the only permitted instance of a separator line within a card — used here because it separates action from content within a compact scrolling card).
- Online / In-person segmented toggle: height 32px, above check-in button.
- **Check-in (default):** gold CTA, height 36px, `--radius-sm`, `--text-sm`, full card width.
- **Checked in:** gold checkmark icon + "Checked in" `--color-primary`, `--text-sm`, weight 600. Left 3px gold accent on card.
- **Live count:** "X in-person · X online" `--text-xs`, `--color-outline`. Below check-in area.

**Empty state:** calendar icon 36px `--color-outline` + "No activities scheduled this week" `--text-sm`, `--color-on-surface-variant`, centered.

---

**Section 4: Scripture Scroller**

Margin top `--space-6`.

Section label: "Scripture" — `--font-body`, `--text-xs`, weight 600, `--color-outline`, uppercase, letter-spacing 0.6px. Left `--space-5`.

The Scripture Scroller component (Section 1.7). Active card displays monthly theme scripture. No CTAs inside cards.

---

**Section 5: Upcoming Events**

Margin top `--space-6`.

Header: "Upcoming events" + "See all" (same pattern as Section 3).

Horizontally scrollable banners: 280px × 155px each. `--radius-lg`, overflow hidden.
- Bottom gradient overlay: `transparent → rgba(28,28,24,0.75)` over bottom 55%.
- Event title: `--font-display`, weight 700, `--text-md`, white. Bottom-left, `--space-4` from edges.
- Date pill: white bg, `--color-on-surface`, `--text-xs`, weight 600, `--radius-full`. Top-right, `--space-2` from edges.
- Pagination dots below: 5px circles, active `--color-primary`, inactive `--color-surface-high`.

---

**Section 6: Join the Ministry**

Margin top `--space-6`. `--space-5` horizontal padding.

Card: `--color-surface-low`, `--radius-lg`, padding `--space-4`. No border.
- Church icon 24px `--color-primary` left.
- Text (12px right of icon): "Become a member" `--text-md`, weight 600, `--color-on-surface`. "Connect, grow and serve with us." `--text-sm`, `--color-on-surface-variant`. 4px gap between lines.
- Ghost button "Express interest" below text. Height 36px.
- Tapping → bottom sheet form: Name field, phone/email field, brief message field + "Submit" gold CTA.

---

**Section 7: Giving Shortcut**

Margin top `--space-4`. `--space-5` horizontal padding.

Slim card: `--color-surface-lowest`, `--radius-lg`, padding `--space-4`. Ambient shadow.
- Heart icon 22px `--color-primary` left. "Give to the ministry" `--font-body`, `--text-base`, weight 500, `--color-on-surface` center. Chevron `--color-outline` right.
- Full row tappable → Giving screen.

**Bottom padding:** `--space-6`.

---

## 5. Radio Tab

**Top bar:** Visible. **Bottom nav:** Visible, Radio active. **Background:** `--color-surface`.

---

### 5.1 Radio — Default State

1. **Title:** "Reign Radio" — `--font-display`, weight 700, `--text-xl`. Left `--space-8`, right `--space-12`. Top `--space-5`.

2. **Idle player card** (`--space-5` padding, margin top `--space-5`):
   - Background: `#2C1F0E` (very dark warm brown). `--radius-xl`. Padding `--space-6`.
   - Radio/wave icon, white 30% opacity, 56px. Centered.
   - "No broadcast currently live" — `--font-body`, `--text-md`, white, weight 600, centered. Margin top 12px.
   - "See the schedule below for the next program." — `--font-body`, `--text-sm`, white 60% opacity, centered. Margin top 4px.

3. **Countdown** (if next broadcast scheduled, below idle card, centered):
   - "Next broadcast in" — `--font-body`, `--text-sm`, `--color-on-surface-variant`.
   - Timer: `--font-mono`, `--text-2xl`, weight 700, `--color-primary`. Ticks every second.
   - Program name: `--font-body`, `--text-base`, `--color-on-surface-variant`.

4. **Broadcast schedule** (`--space-5` padding, margin top `--space-6`):
   - Section label: "Program schedule" `--text-xs`, `--color-outline`, uppercase.
   - Vertical list. Each row (separated by `--space-4` whitespace, no dividers):
     - Day/date: `--text-xs`, `--color-outline`, weight 500, uppercase.
     - Program title: `--font-body`, `--text-base`, weight 600, `--color-on-surface`.
     - Host: `--text-sm`, `--color-on-surface-variant`. Margin top 3px.
     - Time: `--text-sm`, `--color-primary`, weight 500. Margin top 3px.

5. **My notes** (`--space-5` padding, margin top `--space-6`):
   - Label: "My notes" `--font-body`, `--text-md`, weight 600.
   - Text area: `--color-surface-low`, `--radius-md`, padding `--space-3`, height 120px. No border (tonal). Placeholder: "Write your notes — saved automatically." `--text-sm`, `--color-outline`.
   - "Saved ✓" — `--text-xs`, `--color-success`, appears 1s after last keystroke.

---

### 5.2 Radio — Live Broadcast Active State

1. **Title:** Same as above.

2. **Live player card** (`--space-5` padding, margin top `--space-5`):
   - Background: `#1A1205` (richest dark warm tone). `--radius-xl`. Padding `--space-6`.
   - Top-left: Live Indicator (crimson pulsing dot) + "LIVE" white `--text-xs` weight 700. 6px gap.
   - Program title: `--font-display`, weight 700, `--text-xl`, white. Margin top 14px.
   - Host name: `--font-body`, `--text-base`, white 75% opacity. Margin top 4px.
   - **Waveform:** 20–24 bars, 3px wide, 3px gap, `--color-primary-brand` (#B8860B). Height 8px–40px oscillating randomly per bar. Animates while playing, freezes while paused.
   - **Controls row** (centered, margin top 20px):
     - Rewind 15s: 44px circle, white 60%.
     - Play/Pause: 60px circle, gold gradient, white icon 24px. Ambient shadow.
     - Forward 15s: 44px circle, white 60%.
   - **Volume slider** (margin top 16px): full width. Track white 25%; filled `--color-primary-brand`. Thumb white 16px circle.
   - **Listener count** (margin top 14px): 3 overlapping avatars 14px + "47 listening now" `--text-sm`, white 65% opacity.
   - **Engage button** (margin top 16px): ghost, border `rgba(255,255,255,0.25)`, text white, `--text-sm` weight 600: "Engage with this broadcast ↑". Tapping → Live Engagement Sheet.

3. **Schedule and notes sections:** same as idle state 4 & 5. Notes header note: "Notes for: [Program title]" `--text-xs`, `--color-primary`.

---

### 5.3 Radio — Live Engagement Bottom Sheet

Covers ~65% of screen. Glassmorphism. Drag handle. Title "Live engagement" `--font-body`, `--text-md`, weight 600. `--space-5` padding.

**Section 1: Quick Responses**
- "Quick praise" `--text-xs`, `--color-outline`, uppercase.
- 4 pill buttons in a row: "AMEN" | "HALLELUYAH" | "AMIINA" | "AMIIIINA"
- Each: `--color-primary-light` bg, `--color-primary` text, `--text-sm` weight 700, `--radius-full`, padding 8px 16px.
- On tap: scale 1.0 → 1.12 → 1.0 (200ms). Haptic feedback. 5s cooldown per type.

**Section 2: Live Messages** (`--space-3` whitespace separator above — no line)
- "Live messages" `--text-xs`, `--color-outline`, uppercase.
- Scrollable feed, max height 200px. Newest at bottom.
- Message row: avatar 30px + content block (12px gap).
  - Name: `--text-sm`, weight 600, `--color-on-surface`. "Anonymous" → `--color-outline`, italic.
  - Timestamp: `--text-xs`, `--color-outline`, right-aligned.
  - Message: `--text-sm`, `--color-on-surface-variant`. Margin top 2px.
  - Type badge: "Prayer" or "Testimony" (Section 1.7 badge styles).
- Quick-praise entries: centered gold pill, fades in/out over 3.5s.
- New message animation: slide up 8px + fade in, 150ms.

**Section 3: Input (pinned bottom)**
- `--color-surface-lowest` input area, `--radius-md`, padding 12px.
- Placeholder "Share a testimony or prayer request..." `--text-sm`, `--color-outline`.
- Send icon right: `--color-primary`, 22px. Disabled (30% opacity) when empty.
- "Anonymous" label + switch below input. Default OFF.

---

## 6. Members Tab

**Top bar:** Visible. **Bottom nav:** Visible, Members active. **Background:** `--color-surface`.

---

### 6.1 Members Directory

1. **Title:** "Members" — `--font-display`, weight 700, `--text-xl`. Left `--space-8`, right `--space-12`. Top `--space-5`.

2. **Search bar** (margin top 16px, `--space-5` padding): height 46px, `--color-surface-low`, `--radius-full`. No border. Search icon 18px `--color-outline` left. Placeholder: "Search by name, clan or department..." `--text-sm`, `--color-outline`. On focus: 2px gold underline at base of the search container. "Cancel" gold text link right.

3. **Filter pills** (margin top 12px, horizontally scrollable, `--space-5` left, `--space-2` gap):
   "All" | "Elders" | "HODs" | "Ministers" | "Mentorship Complete" | "Youth" | "Men" | "Women" | "Visitors"
   - Inactive: `--color-surface-low`, `--text-sm`, `--color-on-surface-variant`, `--radius-full`, height 32px.
   - Active: gold gradient, white text.

4. **Results count** (margin top 12px, `--space-5` padding): "124 members" `--text-xs`, `--color-outline`.

5. **Member list** (`--space-5` padding, margin top 8px). **No divider lines.** `--space-3` vertical gap between items.

**Member list item:**
- `--color-surface-lowest`, `--radius-lg`, padding 12px 16px.
- Avatar 48px circle, 2px `--color-surface-high` border.
- Name: `--font-body`, `--text-base`, weight 600, `--color-on-surface`. 12px right of avatar.
- Clan: `--text-sm`, `--color-on-surface-variant`. Margin top 3px.
- Dept list: `--text-xs`, `--color-outline`. Margin top 2px.
- Badges: right-aligned, up to 3.
- Tap → Public Member Profile.

**Empty state:** magnifier icon 40px `--color-outline` + "No members found" `--text-md`, `--color-on-surface-variant` + "Adjust your search or filter." `--text-sm`, `--color-outline`. Centered.

---

### 6.2 Public Member Profile

Drill-down. **No bottom nav.** Back arrow floats top-left. Background `--color-surface`.

1. **Hero:** 180px gradient zone (`--color-primary-light` → `--color-surface`). Profile photo 88px, white 3px border, ambient shadow. Name `--font-display`, weight 700, `--text-xl`, centered. Clan `--font-body`, `--text-base`, `--color-on-surface-variant`. Account badge centered.

2. **Badges row** (margin top 16px, `--space-5` padding, wrapping, `--space-2` gap): badge pills. Two Elder badges for Chairperson.

3. **"Serving in" card** (margin top 20px, `--space-5` padding): `--color-surface-lowest`, `--radius-lg`, `--space-4`. Label: "Serving in" `--text-xs`, `--color-outline`, uppercase. Below: dept pills (`--color-primary-light` bg, `--color-primary` text).

4. **Professional card** (if public, same style): label "Professional". Profession bold. Job title, workplace in secondary colour.

5. **Action buttons** (margin top 24px, `--space-5`, `--space-3` gap): 
   - "Request appointment" — gold CTA.
   - "Send message" — ghost. Greyed (opacity 0.4) for non-messaging roles. Tooltip: "Available to authorised roles only."

---

## 7. Updates Tab

**Top bar:** Visible. **Bottom nav:** Visible, Updates active. **Background:** `--color-surface`.

1. **Title:** "Updates" — `--font-display`, weight 700, `--text-xl`. Asymmetric margin. Top `--space-5`.

2. **Priority announcements** (if any): section label "Pinned" `--text-xs`, `--color-outline`, uppercase. Priority card: `--color-surface-lowest`, left 3px gold accent, radius `0 --radius-lg --radius-lg 0`, padding `--space-4`. "Priority" badge top-right. Title `--font-body`, `--text-md`, weight 700. Body `--text-base`, `--color-on-surface-variant`, max 3 lines. Date `--text-xs`, `--color-outline`. "Read more" link if truncated.

3. **All announcements** (margin top `--space-6`): label "All announcements". Vertical list of cards: `--color-surface-lowest`, `--radius-lg`, `--space-4`, `--space-3` gap. No borders.
   - Title: `--font-body`, `--text-base`, weight 600, `--color-on-surface`.
   - Body: `--text-sm`, `--color-on-surface-variant`, max 2 lines.
   - Timestamp: `--text-xs`, `--color-outline`, right-aligned.
   - Category badge top-right if set.
   - Ended: opacity 0.5, all text `--color-outline`, "Ended" badge.

4. **Empty state:** megaphone icon 40px `--color-outline` + "No announcements yet" centered.

**Detail drill-down:** Full screen. Back arrow. Share icon top-right. Full title `--font-display`. Full body `--font-body`. Date, badge. No bottom nav.

---

## 8. More — Overflow Bottom Sheet

Glassmorphism. Covers ~70% of screen. Drag handle.

Heading: "More" — `--font-body`, `--text-md`, weight 600, `--color-on-surface`. `--space-5` padding. Margin top 16px.

**4×2 icon grid.** `--space-4` around grid. `--space-3` gap.

**Grid item:** `--color-surface-lowest`, `--radius-lg`. Icon container: `--color-primary-light`, `--radius-md`, 52% of item width, centered. Icon 26px `--color-primary`. Label `--font-body`, `--text-xs`, weight 500, `--color-on-surface`, centered, margin top 8px.

| Label | Icon | Notes |
|---|---|---|
| Giving | Hand-heart | Standard navigation |
| Library | Open book | Standard navigation |
| Media & Events | Play button | Standard navigation |
| Administration | Shield + lock | Special — see below |
| Tower of Faith | Building outline | Standard navigation |
| Appointments | Calendar + person | Standard navigation |
| Inquiries | Message + question mark | Standard navigation |
| Procurement | Briefcase | Standard navigation |

**Administration:** Gold padlock badge (12px) overlaid bottom-right of icon container. On tap: modal (not sheet):
- Title "Administration access" `--font-display`, `--text-lg`.
- Body "Enter your secondary credentials to continue." `--font-body`, `--text-base`, `--color-on-surface-variant`.
- Password input (minimalist). Buttons: "Cancel" ghost + "Sign in" gold CTA.
- No role: modal shows "You do not have access to this area." + "OK" only.

---

## 9. Notifications Panel

Full screen. Back arrow top-left. **No bottom nav.** Background: `--color-surface`.

**Header:** Back arrow. "Notifications" — `--font-display`, weight 700, `--text-xl`. Asymmetric margin. Top `--space-5`.

**Tab row** (margin top 16px, `--space-5` padding): "All" | "Unread". Active: `--color-on-surface`, weight 600, 2px `--color-primary` underline. Inactive: `--color-on-surface-variant`. "Mark all read" gold text link right.

**Notification list** (`--space-5` padding, margin top 16px, `--space-3` gap — no dividers):

**Notification row:** `--color-surface-lowest`, `--radius-lg`, padding 12px 14px.
- Unread: `--color-primary-fixed-dim` tint background.
- Left icon container: 36px × 36px, `--radius-md`, type-specific bg:
  - Birthday: `--color-warning-light`, gift icon `--color-warning`.
  - Activity: `--color-primary-light`, calendar icon `--color-primary`.
  - Leadership: `--color-primary-light`, star icon `--color-primary`.
  - Giving: `--color-success-light`, checkmark icon `--color-success`.
  - Broadcast: `--color-primary-light`, radio icon `--color-primary`.
  - System: `--color-surface-low`, info icon `--color-outline`.
- Center (12px gap): Sender `--text-sm`, weight 600. Message `--text-sm`, `--color-on-surface-variant`, max 2 lines. Timestamp `--text-xs`, `--color-outline`, margin top 4px.
- Right: unread dot 8px `--color-primary`.

**Notification content:**

| Type | Sender | Message |
|---|---|---|
| Birthday (×4, 3hr gaps from 07:00) | Team Leader / Exec. Pastor / Resident Pastor / Clan Elder | "Happy Birthday [Name]! Wishing you God's richest blessings today." |
| Activity reminder T-30 | "KLT Church" | "[Activity] starts in 30 minutes. Tap to check in." |
| Activity reminder T-0 | "KLT Church" | "[Activity] has just started. Check in now." |
| Leadership appointment | "KLT Church" | "[Full Name] has been appointed as [Role]." |
| Giving confirmed | "Finance Team" | "Your [category] of UGX [amount] was received. God bless you." |
| Giving failed | "Finance Team" | "Your payment of UGX [amount] was not completed. Tap to retry." |
| Broadcast live | "Reign Radio" | "[Program] is now live with [Host]. Tap to listen." |
| Mentorship milestone | "Mentorship Dept" | "Your [milestone] has been approved." |
| Appointment confirmed | "Church Office" | "Your appointment with [Name] is confirmed for [date/time]." |
| Clan/dept approval | "KLT Church" | "Your [Clan/Department] membership has been approved." |
| Role appointed | "KLT Church" | "You have been appointed as [Role]. Tap to see your new access." |

Tap: expands or navigates to related screen. Long-press: "Mark as read" / "Delete".

**Empty state:** Bell icon 40px `--color-outline` + "No notifications yet" `--text-md`, `--color-on-surface-variant`, centered.

---

## 10. My Profile Screen

Full screen. Back arrow top-left. Edit icon (pencil, 20px, `--color-primary`) top-right. **No bottom nav.** Background: `--color-surface`. Scrollable.

**Hero section:**
- 160px gradient zone: `--color-primary-light` → `--color-surface`.
- Profile photo 88px, 3px white border, ambient shadow.
  - Camera overlay: 28px circle, white bg, gold camera icon 14px, bottom-right of photo. Tap → photo picker.
  - Initials fallback: gold gradient bg, white `--font-display` `--text-lg`.
- Name: `--font-display`, weight 700, `--text-xl`, `--color-on-surface`, centered. Margin top 12px.
- Clan: `--font-body`, `--text-base`, `--color-on-surface-variant`, centered. Margin top 4px.
- Account badge centered.

**Badges row** (margin top 16px, `--space-5` padding, horizontally scrollable, `--space-2` gap).

**Cards** (`--space-5` padding, `--space-3` gap. Each: `--color-surface-lowest`, `--radius-lg`, `--space-4`. No border):

Card header: label `--text-xs`, weight 600, `--color-outline`, uppercase, letter-spacing 0.5px. "Edit" gold text link right if editable. Detail rows inside: label `--text-xs`, `--color-outline`, uppercase; value `--font-body`, `--text-base`, weight 500, `--color-on-surface`. `--space-3` between rows, no lines.

**Card 1: Personal details**
| Label | Value | Editable |
|---|---|---|
| Date of birth | 14 August 1997 (Age 28) | No |
| Sex | Male | No |
| Marital status | Single | Yes |
| Spouse | [Name or "Not linked"] | Yes |

**Card 2: Church involvement**
| Label | Value |
|---|---|
| Clan | Gold text name / "Pending approval" amber badge |
| Departments | Gold-tinted pills. Pending: amber-bordered "[Dept] · Pending" |

**Card 3: Mentorship progress**

3-step horizontal tracker:
```
  (●)─────────(●)─────────(◌)
 Classes    Baptism    Ushering
 Complete   Complete   In progress
```
- Completed: 20px gold filled circle, white checkmark.
- In progress: 20px amber circle, white hourglass.
- Not started: 20px empty circle, `--color-surface-high` border.
- Connector line: 2px gold (complete), `--color-surface-high` (incomplete).
- Sub-label: `--text-xs`, `--color-success` / `--color-warning` / `--color-outline`.

Overall status:
- Complete: gold checkmark + "Mentorship complete" `--text-sm`, `--color-primary`, weight 600.
- Partial: "X of 3 milestones complete" `--text-sm`, `--color-on-surface-variant`.
- Not enrolled: "Not enrolled" `--text-sm`, `--color-outline` + "Learn how to enrol →" gold link.

**Card 4: Leadership Institute**
Single row: "Current level" + value (e.g. "Level 2 — In progress" amber badge or "Not enrolled").

**Card 5: Professional information** (with "Edit" link + visibility toggle)
Fields: Profession, Job title, Workplace. "Show on public profile" toggle bottom of card. Default OFF.
Empty state: "No professional info added yet." `--text-sm`, `--color-outline` + "Add info" gold text link.

**Card 6: My giving summary**
| Label | Value |
|---|---|
| This month | UGX [amount] `--font-mono`, `--text-md`, weight 700, `--color-primary` |
| This year | UGX [amount] |

"View full giving history →" gold text link, bottom-right.

**Account actions** (margin top `--space-6`, `--space-5` padding):
- Destructive ghost "Sign out" — full width. Confirmation modal on tap.
- "Delete my account" — `--text-sm`, `--color-secondary`, centered text link. Warning sheet on tap.

**Bottom padding:** `--space-10`.

---

## 11. Giving Screen

### 11.1 Giving Main Screen

Full screen. Back arrow. **No bottom nav.** Background: `--color-surface`.

**Header:** Back arrow. "Giving" — `--font-display`, weight 700, `--text-xl`. Asymmetric margin. Top `--space-5`.

**Summary hero card** (`--space-5` padding, margin top `--space-5`): gold gradient, `--radius-xl`, `--space-5`, ambient shadow.
- "Your giving this month" `--text-xs`, white 65% opacity, uppercase.
- Amount: `--font-mono`, `--text-2xl`, weight 700, white. Margin top 8px.
- "View history →" white text link `--text-sm`. Margin top 6px.

**Give now** (margin top `--space-6`, `--space-5` padding):
- "Give now" `--font-body`, `--text-md`, weight 600.
- 2×3 grid. `--space-3` gap. Categories: Tithe, Offering, Seed, Building Project, Missions, Special Gift.
- **Category card:** `--color-surface-lowest`, `--radius-lg`, `--space-4`, centered. Icon 28px `--color-primary`. Name `--text-sm`, weight 600, `--color-on-surface`. No border.
- **Selected:** `--color-primary-fixed-dim` bg, icon + text `--color-primary`, 2px bottom accent.
- Multiple selectable.

**Make a contribution button** (margin top `--space-5`, `--space-5` padding): gold CTA. Disabled if no category selected.

**Recent transactions** (margin top `--space-6`, `--space-5` padding):
- "Recent transactions" `--font-body`, `--text-md`, weight 600.
- List (max 5): `--color-surface-lowest`, `--radius-lg`, padding 12px 16px, `--space-2` gap.
  - Category: `--font-body`, `--text-base`, weight 500.
  - Amount: `--font-mono`, `--text-base`, weight 700, `--color-primary`, right-aligned.
  - Date: `--text-xs`, `--color-outline`.
  - Status badge.
- "View full history →" gold text link, centered.

**Anonymous note** (margin top `--space-4`): info icon 14px `--color-outline` + "You can give anonymously. Choose the option during payment." `--text-xs`, `--color-outline`. Centered.

---

### 11.2 Payment Bottom Sheet

~78% screen height. Glassmorphism. Drag handle. "Make a contribution" `--font-body`, `--text-md`, weight 600.

1. **Selected categories:** "Giving to" `--text-xs`, `--color-outline`, uppercase. Gold removable pill tags. "+ Add category" gold text link.

2. **Amount input:** "Amount (UGX)" `--text-xs`, `--color-outline`, uppercase. Large centered number: `--font-mono`, `--text-2xl`, weight 700, `--color-on-surface`. 2px `--color-primary` underline below. Numeric keyboard on focus. Comma-formatted.

3. **Payment method:** "Payment method" `--text-xs`, `--color-outline`, uppercase. Three option cards in a row:
   - "Mobile Money" | "Card" | "Bank Transfer"
   - Each: `--color-surface-lowest`, `--radius-md`, height 64px, centered icon 22px + label `--text-xs`. No border.
   - Selected: `--color-primary-fixed-dim`, icon `--color-primary`, 2px bottom gold.
   - Default: Mobile Money. Mobile Money: phone number input expands below. Card: card fields expand. Bank: account details expand.

4. **Recurring toggle** (margin top 16px): "Set as recurring" `--text-sm`, `--color-on-surface-variant` + switch. When ON: frequency pills "Weekly" | "Monthly" | "Annually".

5. **Anonymous toggle** (margin top 12px): "Give anonymously" + switch. Default OFF. Helper: "Your name will not be shown to the finance team." `--text-xs`, `--color-outline`.

6. **Confirm button** (pinned, above safe area): gold CTA "Confirm and pay UGX [amount]". Disabled at 0.
   - Success: sheet closes. Full-screen success animation — gold checkmark ring expands from button position → fades to "Thank you for your faithfulness" `--font-display`, `--text-xl`, centered, gold. Holds 2.5s, then dismisses.
   - Failure: `--color-error`, `--text-sm`, centered, above button.

---

## 12. Global Interaction Rules

### 12.1 Loading States

- **Button loading:** Label replaced by 20px spinner (white on gold, gold on ghost). Button disabled.
- **Screen loading:** Skeleton placeholders in correct layout. `--color-surface-low` backgrounds with shimmer animation (opacity 0.4 → 0.7 → 0.4, 1.5s loop).
- **Inline loading:** Thin gold progress bar (`--color-primary`) at top of content area.

### 12.2 Error States

- **Field error:** Bottom border `--color-error`. Helper text `--color-error`. No fill change.
- **Network error:** Toast below top bar. `--color-surface-lowest` bg, 3px left `--color-error` accent. `--text-sm`, `--color-on-surface`. Auto-dismisses 5s. "Retry" gold text link if applicable.
- **Full screen error:** Exclamation icon 40px `--color-outline` + "Something went wrong" `--font-display`, `--text-xl` + description + gold CTA "Try again". Centered.

### 12.3 Empty States

Every list or data area that can be empty must have a designed empty state:
1. Icon, 40px, `--color-outline`.
2. Primary message: `--font-body`, `--text-md`, weight 600, `--color-on-surface-variant`.
3. Secondary message: `--text-sm`, `--color-outline`.
4. Action button if applicable (gold CTA or gold text link).

### 12.4 Transitions & Animation

- **Screen push:** slide in from right (220ms ease-out). Back: slide out right.
- **Bottom sheet:** slide up (200ms cubic-bezier(0.32, 0.72, 0, 1)). Dismiss: slide down (150ms ease-in).
- **Tab switch:** cross-fade (100ms). No slide.
- **Input focus:** bottom border expands from center, 200ms ease-out.
- **Segmented control active:** slides (200ms ease-out).
- **Card tap:** scale 0.98 (100ms), back to 1.0 on release.
- **All durations:** respect `prefers-reduced-motion`. When on: instant transitions, no animation.

### 12.5 Accessibility

- Minimum touch target: 44px × 44px.
- Colour never the sole state indicator — always paired with icon or text.
- All interactive elements have descriptive aria-labels.
- Text contrast: 4.5:1 minimum for body, 3:1 for large text, against all surface backgrounds.
- Font sizes use rem/em (not px alone) to respect system font scaling.
- All inputs have associated labels (not placeholder-only).
- Focus ring: 2px `--color-primary` outline, offset 2px, on all focused elements.

### 12.6 Safe Area Handling

- Device notch and home indicator insets respected on all screens.
- Bottom nav height includes bottom safe area.
- Bottom sheet bottom padding includes bottom safe area.
- No content appears behind safe area insets.

### 12.7 Typography Anti-Patterns

**Never:**
- Use `#000000` for text — always `--color-on-surface` (#1C1C18).
- Use Playfair Display below 18px.
- Use Playfair Display for navigation, badges, or form inputs.
- Use Inter for screen hero headings or section display titles.
- Use more than two typefaces on one screen.
- Use `--font-mono` outside of amounts, timers, and reference numbers.

### 12.8 The "No-Line" Enforcement

Before writing any `border: 1px solid`, stop. Ask:
1. Can I use a background shift instead? (`--color-surface-low` vs `--color-surface-lowest`)
2. Can I add `--space-3` of whitespace to create the visual separation?
3. Is this a form field needing a ghost border? (`--color-outline-variant` at 15% opacity maximum)

The only two hard lines permitted in the entire application:
- **2px bottom border on focused inputs** (`--color-primary`).
- **3px left accent on priority announcement cards** (`--color-primary-brand`).

### 12.9 Offline Behaviour

- No network: amber slim banner below top bar. `--color-warning-light` bg, text "You're offline. Some features are unavailable." `--text-sm`, `--color-on-surface`. Auto-dismisses on reconnect.
- Cached screens: display cached content with "Updated [time ago]" `--text-xs`, `--color-outline`.
- Live-data screens: informational message instead of broken state.

---

*End of KLT Cyber Church App — Interface Specification v3.0*
*Design Language: Kingdom Radiant — dawn breaking over a worship night*
*Fonts: Bricolage Grotesque (display) · Plus Jakarta Sans (UI/body) · Spline Sans Mono (amounts)*
