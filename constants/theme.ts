/**
 * KLT Cyber Church — Sacred Curator Design System
 *
 * All design tokens derived from INTERFACE_SPEC.md.
 * Import these constants in every component — never hardcode values.
 */

// ─── Color Tokens ──────────────────────────────────────────────

export const Colors = {
  // Primary (Gold)
  primary: '#785600',
  primaryBrand: '#B8860B',
  primaryContainer: '#986d00',
  primaryFixedDim: '#F5E6C8',
  primaryLight: '#FBF3E0',
  onPrimary: '#FFFFFF',

  // Secondary (Crimson)
  secondary: '#AB3332',
  secondaryLight: '#F9E5E5',
  onSecondary: '#FFFFFF',

  // Tertiary (Royal Blue)
  tertiary: '#145DA3',
  tertiaryLight: '#E3EEF9',
  onTertiary: '#FFFFFF',

  // Surface (Parchment — warm, never cold white)
  surface: '#FCF9F2',
  surfaceLow: '#F5F1E8',
  surfaceContainer: '#EDE9DF',
  surfaceLowest: '#FFFFFF',
  surfaceHigh: '#E3DFD4',
  surfaceVariant: '#EAE5DB',
  surfaceBright: '#FDFAF5',

  // Text
  onSurface: '#1C1C18',
  onSurfaceVariant: '#5C5947',
  outline: '#8C8470',
  outlineVariant: 'rgba(140, 132, 112, 0.15)',

  // Semantic
  success: '#2E7D32',
  successLight: '#E8F5E9',
  warning: '#B8860B',
  warningLight: '#FBF3E0',
  error: '#AB3332',
  errorLight: '#F9E5E5',
  live: '#AB3332',
  unread: '#785600',
} as const;

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
  elevation: 4, // Android
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
