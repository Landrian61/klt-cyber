/**
 * KLT Cyber Church — Light & Dark Color Palettes
 *
 * Dark mode is designed as a "dimly lit cathedral" — warm dark tones, not cold blacks.
 * Gold accents are brightened for contrast on dark surfaces.
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

export const DarkColors: ColorPalette = {
  // Primary (Gold — brightened for dark backgrounds)
  primary: '#C49A2C',
  primaryBrand: '#D4A828',
  primaryContainer: '#B88A18',
  primaryFixedDim: '#3D3220',
  primaryLight: '#2A2418',
  onPrimary: '#FFFFFF',

  // Secondary (Crimson — lightened)
  secondary: '#E05A59',
  secondaryLight: '#3A2020',
  onSecondary: '#FFFFFF',

  // Tertiary (Royal Blue — lightened)
  tertiary: '#4A8FD4',
  tertiaryLight: '#1A2A3A',
  onTertiary: '#FFFFFF',

  // Surface (Warm dark — cathedral at night)
  surface: '#141413',
  surfaceLow: '#1C1B19',
  surfaceContainer: '#242320',
  surfaceLowest: '#1E1D1B',
  surfaceHigh: '#2E2D2A',
  surfaceVariant: '#282723',
  surfaceBright: '#1A1918',

  // Text (Light on dark)
  onSurface: '#E8E4DA',
  onSurfaceVariant: '#A8A392',
  outline: '#6E6A5E',
  outlineVariant: 'rgba(168, 163, 146, 0.15)',

  // Semantic
  success: '#4CAF50',
  successLight: '#1A2E1B',
  warning: '#D4A828',
  warningLight: '#2A2418',
  error: '#E05A59',
  errorLight: '#3A2020',
  live: '#E05A59',
  unread: '#C49A2C',

  // System
  glassBackground: 'rgba(20, 20, 19, 0.85)',
  glassTint: 'dark' as const,
  scrim: 'rgba(0, 0, 0, 0.55)',
  subtleScrim: 'rgba(0, 0, 0, 0.25)',
  shadowColor: '#000000',
} as const;
