/**
 * KLT Cyber Church — Colour Palette
 *
 * Design language: "Kingdom Radiant" — dawn breaking over a worship night.
 * Deep heaven-blue depth, blazing gold glory, red heartbeat, on a warm cream
 * base. A single warm light theme (no dark mode). See docs/INTERFACE_SPEC.md §1.
 *
 * The three sacred KLT colours (from the Kingdom Life Tabernacle crown logo):
 *   Gold  — Kingdom & glory
 *   Red   — the blood, passion, urgency (LIVE / priority)
 *   Blue  — heaven, the Spirit, community, teaching
 */

export type ColorPalette = {
  [K in keyof typeof LightColors]: string;
};

export const LightColors = {
  // ─── Primary: Gold (Kingdom & glory) ──────────────────────────────
  primary: '#C47F08', // gold.700 — deep on-cream gold: links, active tab, labels, icons
  primaryBrand: '#DD9814', // gold.500 — brand highlight, active fills, celebration
  primaryDeep: '#7A4E04', // gold.900 — strong gold text: amounts & timers on cream
  primaryContainer: '#C47F08', // gradient base
  primaryFixedDim: '#FBECC9', // selected card fill (solid light gold)
  primaryLight: '#FCEFD1', // light gold tint — badge/icon containers, hero-gradient start
  goldTint: 'rgba(221, 152, 20, 0.16)', // translucent badge/selected wash
  goldGlowShadow: 'rgba(196, 127, 8, 0.45)', // primary CTA glow
  onPrimary: '#3A2604', // SIGNATURE: dark cocoa text ON gold — never white on gold

  // ─── Secondary: Red (the blood, passion, urgency) — the KLT logo red ──
  secondary: '#C10810', // red.500 — LIVE, priority, unread, destructive
  secondaryDark: '#8F060C', // red.700 — pressed / dark accents
  secondaryLight: '#FAE3E2', // solid light red — destructive/error tint surfaces
  redTint: 'rgba(193, 8, 16, 0.12)', // priority card wash, red badges
  onSecondary: '#FFFFFF',

  // ─── Tertiary: Blue (heaven, the Spirit, community, teaching) ──────
  tertiary: '#2C63D9', // blue.500 — links, community, teaching, info
  tertiaryDeep: '#12306E', // blue.700 — heaven-depth heroes, scripture on cream
  tertiaryDeepest: '#0C2154', // blue.900 — deepest hero gradient stop
  tertiaryLight: '#E4ECFB', // solid light blue — category/info badges
  blueTint: 'rgba(44, 99, 217, 0.12)', // info states, category badges
  onTertiary: '#FFFFFF',

  // ─── Surface (Cream — warm, never clinical) ───────────────────────
  surface: '#FDF8F0', // cream.bg — app background
  surfaceLow: '#F6EDDE', // cream.sunken — inset zones, input rests, skeletons
  surfaceContainer: '#F1E7D6', // alternate section background
  surfaceLowest: '#FFFFFF', // lifted cards only, with warm shadow
  surfaceHigh: '#E8DCC6', // pressed surfaces, toggle-off track
  surfaceVariant: '#F3EADB', // alternate section background
  surfaceBright: '#FFFDFA', // highlight surfaces

  // ─── Text ─────────────────────────────────────────────────────────
  onSurface: '#241B10', // ink — primary text, warm near-black
  onSurfaceVariant: '#5C4F3D', // secondary body text
  outline: '#8A7C68', // muted — captions, timestamps, placeholders
  faint: '#B5A88F', // faint — disabled, subtlest hints
  outlineVariant: 'rgba(138, 124, 104, 0.16)', // ghost borders in forms

  // ─── Semantic (even errors speak warmly) ──────────────────────────
  success: '#2E8B57',
  successLight: '#E3F1EA',
  warning: '#C47F08',
  warningLight: '#FCEFD1',
  error: '#C10810',
  errorLight: '#FAE3E2',
  live: '#C10810',
  unread: '#C10810',

  // ─── System ───────────────────────────────────────────────────────
  glassBackground: 'rgba(253, 248, 240, 0.94)', // warm translucent chrome
  glassTint: 'light' as const,
  scrim: 'rgba(12, 33, 84, 0.55)', // blue-tinted scrim over hero imagery
  subtleScrim: 'rgba(12, 33, 84, 0.15)',
  shadowColor: '#12306E', // warm blue glow — the source of all elevation
} as const;
