import { Colors } from '@/constants/theme';

/**
 * Returns a color token from the Sacred Curator palette.
 * Simplified — the app uses a single warm parchment palette, no light/dark split.
 */
export function useThemeColor(colorName: keyof typeof Colors): string {
  return Colors[colorName];
}
