/**
 * KLT Cyber Church — Color Palette
 *
 * The app uses a single warm "parchment" light theme (the Sacred Curator
 * design language). Dark mode has been removed.
 */

export type ColorPalette = {
  [K in keyof typeof LightColors]: string;
};

export const LightColors = {
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

  // Surface (Parchment)
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

  // System
  glassBackground: 'rgba(252, 249, 242, 0.82)',
  glassTint: 'light' as const,
  scrim: 'rgba(28, 28, 24, 0.45)',
  subtleScrim: 'rgba(28, 28, 24, 0.15)',
  shadowColor: '#1C1C18',
} as const;
