/**
 * KLT Cyber Church — "Kingdom Radiant" Design System
 *
 * Colours live in constants/colors.ts. Use the `useThemeColors()` hook in
 * components. This file exports LightColors as `Colors` for non-component code,
 * plus typography, spacing, radius, elevation, gradients and motion tokens.
 *
 * Fonts: Bricolage Grotesque (display) · Plus Jakarta Sans (UI/body) ·
 * Spline Sans Mono (amounts, timers, references). See docs/INTERFACE_SPEC.md §1.3.
 */

export { LightColors as Colors, LightColors } from '@/constants/colors';
export type { ColorPalette } from '@/constants/colors';

// ─── Typography ────────────────────────────────────────────────

export const FontFamily = {
  /** Display — greetings, screen/card titles, celebration. Bricolage 800. */
  display: 'BricolageGrotesque-ExtraBold',
  /** Section headers (h2). Bricolage 700. */
  displaySemi: 'BricolageGrotesque-Bold',
  /** All UI text, labels, body copy, forms, navigation. Plus Jakarta Sans. */
  body: 'PlusJakartaSans-Regular',
  bodyMedium: 'PlusJakartaSans-Medium',
  bodySemiBold: 'PlusJakartaSans-SemiBold',
  bodyBold: 'PlusJakartaSans-Bold',
  bodyExtraBold: 'PlusJakartaSans-ExtraBold',
  /** SCRIPTURE only — italic Jakarta. */
  italic: 'PlusJakartaSans-Italic',
  /** Giving amounts, countdowns, reference numbers. */
  mono: 'SplineSansMono-Medium',
  monoBold: 'SplineSansMono-SemiBold',
} as const;

/** Type scale — sizes in px, lineHeight as absolute px. */
export const TypeScale = {
  textXs: { fontSize: 11, lineHeight: 15.4, fontFamily: FontFamily.body },
  textSm: { fontSize: 13, lineHeight: 18, fontFamily: FontFamily.bodyMedium },
  textBase: { fontSize: 15, lineHeight: 23, fontFamily: FontFamily.body },
  textMd: { fontSize: 16, lineHeight: 24, fontFamily: FontFamily.bodySemiBold },
  textLg: { fontSize: 18, lineHeight: 24, fontFamily: FontFamily.displaySemi },
  textXl: { fontSize: 24, lineHeight: 30, fontFamily: FontFamily.display },
  text2xl: { fontSize: 32, lineHeight: 38, fontFamily: FontFamily.monoBold },
  textDisplay: { fontSize: 32, lineHeight: 38, fontFamily: FontFamily.display, letterSpacing: -0.3 },
  /** Scripture — italic Jakarta, generous leading. */
  scripture: { fontSize: 15, lineHeight: 26, fontFamily: FontFamily.italic },
} as const;

// ─── Spacing (8-point grid, all multiples of 4) ───────────────

export const Spacing = {
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  8: 32,
  10: 40,
  12: 48,
  16: 64,
  20: 80,
} as const;

// ─── Roundedness (soft, rounded — nothing sharp) ──────────────

export const Radius = {
  sm: 10,
  md: 14,
  lg: 20,
  xl: 24,
  sheet: 28,
  full: 9999,
} as const;

// ─── Elevation & Depth (warm blue glow — no hard lines) ───────

/** e1 — list cards, small tiles. */
export const ShadowE1 = {
  shadowColor: '#12306E',
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.07,
  shadowRadius: 10,
  elevation: 2,
} as const;

/** e2 — heroes, sheets, key cards. Also the default "ambient" lift. */
export const ShadowE2 = {
  shadowColor: '#12306E',
  shadowOffset: { width: 0, height: 6 },
  shadowOpacity: 0.1,
  shadowRadius: 20,
  elevation: 5,
} as const;

/** Gold glow — PRIMARY CTA ONLY. */
export const GoldGlow = {
  shadowColor: '#D98E0B',
  shadowOffset: { width: 0, height: 10 },
  shadowOpacity: 0.45,
  shadowRadius: 30,
  elevation: 8,
} as const;

/** @deprecated Use ShadowE2. Kept so existing imports keep compiling. */
export const AmbientShadow = ShadowE2;

/** Upward glow for bottom nav / sheets. */
export const AmbientShadowUp = {
  shadowColor: '#12306E',
  shadowOffset: { width: 0, height: -4 },
  shadowOpacity: 0.08,
  shadowRadius: 20,
  elevation: 5,
} as const;

// ─── Glass / translucent chrome ───────────────────────────────

export const Glass = {
  background: 'rgba(253, 248, 240, 0.94)',
  blurIntensity: 20,
  blurTint: 'light' as const,
} as const;

// ─── Gradients ────────────────────────────────────────────────

/** Gold-leaf gradient — primary CTAs, active states, avatars. 135deg. */
export const GoldGradient = {
  colors: ['#F7C64B', '#D98E0B'] as const,
  start: { x: 0, y: 0 },
  end: { x: 1, y: 1 },
} as const;

export const GoldGradientHorizontal = {
  colors: ['#F7C64B', '#D98E0B'] as const,
  start: { x: 0, y: 0.5 },
  end: { x: 1, y: 0.5 },
} as const;

/** Heaven gradient — heroes, scripture zones. Deep blue lit from below. */
export const HeavenGradient = {
  colors: ['#0C2154', '#12306E', '#2C63D9'] as const,
  start: { x: 0.1, y: 0 },
  end: { x: 0.9, y: 1 },
} as const;

/** Warm gold-on-gold gradient — the giving summary hero. */
export const GivingGradient = {
  colors: ['#8A5A05', '#D98E0B'] as const,
  start: { x: 0, y: 0 },
  end: { x: 0.9, y: 1 },
} as const;

// ─── Overlay ──────────────────────────────────────────────────

export const Overlay = {
  scrim: 'rgba(12, 33, 84, 0.55)',
} as const;

// ─── Animation Durations ──────────────────────────────────────

export const Duration = {
  fast: 120,
  normal: 240,
  slow: 320,
  sheetIn: 240,
  sheetOut: 180,
  tabSwitch: 120,
  inputFocus: 200,
  floatingLabel: 150,
} as const;
