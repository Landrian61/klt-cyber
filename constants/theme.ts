/**
 * KLT Cyber Church — Sacred Curator Design System
 *
 * Colors are now in constants/colors.ts (light + dark palettes).
 * Use `useThemeColors()` hook in components for reactive dark mode support.
 * This file exports LightColors as `Colors` for backward compatibility in non-component code.
 */

export { LightColors as Colors, LightColors, DarkColors } from '@/constants/colors';
export type { ColorPalette } from '@/constants/colors';

// ─── Typography ────────────────────────────────────────────────

export const FontFamily = {
  /** Hero text, sermon titles, scripture, section headings (>=18px only) */
  display: 'Merriweather-Bold',
  /** All UI text, labels, body copy, forms, navigation */
  body: 'Inter-Regular',
  bodyMedium: 'Inter-Medium',
  bodySemiBold: 'Inter-SemiBold',
  bodyBold: 'Inter-Bold',
  /** Giving amounts, countdowns, reference numbers */
  mono: 'JetBrainsMono-Regular',
  monoBold: 'JetBrainsMono-Bold',
} as const;

/** Type scale — sizes in px, lineHeight as multiplier */
export const TypeScale = {
  textXs: { fontSize: 11, lineHeight: 15.4, fontFamily: FontFamily.body },
  textSm: { fontSize: 12, lineHeight: 18, fontFamily: FontFamily.body },
  textBase: { fontSize: 14, lineHeight: 22.4, fontFamily: FontFamily.body },
  textMd: { fontSize: 16, lineHeight: 24, fontFamily: FontFamily.bodyMedium },
  textLg: { fontSize: 20, lineHeight: 26, fontFamily: FontFamily.bodySemiBold },
  textXl: { fontSize: 24, lineHeight: 28.8, fontFamily: FontFamily.display },
  text2xl: { fontSize: 32, lineHeight: 35.2, fontFamily: FontFamily.monoBold },
  textDisplay: { fontSize: 56, lineHeight: 56, fontFamily: FontFamily.display, letterSpacing: -0.5 },
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

// ─── Roundedness ───────────────────────────────────────────────

export const Radius = {
  sm: 4,
  md: 8,
  lg: 12,
  xl: 20,
  full: 9999,
} as const;

// ─── Elevation & Depth ────────────────────────────────────────

/** Ambient shadow for FABs and high-priority modals only */
export const AmbientShadow = {
  shadowColor: '#1C1C18',
  shadowOffset: { width: 0, height: 8 },
  shadowOpacity: 0.04,
  shadowRadius: 32,
  elevation: 4,
} as const;

/** Upward ambient shadow for bottom nav / sheets */
export const AmbientShadowUp = {
  shadowColor: '#1C1C18',
  shadowOffset: { width: 0, height: -4 },
  shadowOpacity: 0.04,
  shadowRadius: 24,
  elevation: 4,
} as const;

// ─── Glass & Gold Presets ──────────────────────────────────────

export const Glass = {
  background: 'rgba(252, 249, 242, 0.82)',
  blurIntensity: 20,
  blurTint: 'light' as const,
} as const;

export const GoldGradient = {
  colors: ['#785600', '#986d00'] as const,
  start: { x: 0, y: 0 },
  end: { x: 1, y: 1 },
} as const;

export const GoldGradientHorizontal = {
  colors: ['#785600', '#B8860B'] as const,
  start: { x: 0, y: 0.5 },
  end: { x: 1, y: 0.5 },
} as const;

// ─── Overlay ──────────────────────────────────────────────────

export const Overlay = {
  scrim: 'rgba(28, 28, 24, 0.45)',
} as const;

// ─── Animation Durations ──────────────────────────────────────

export const Duration = {
  fast: 100,
  normal: 200,
  slow: 300,
  sheetIn: 200,
  sheetOut: 150,
  tabSwitch: 100,
  inputFocus: 200,
  floatingLabel: 150,
} as const;
