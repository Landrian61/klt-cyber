import { useTheme } from '@/contexts/theme-context';
import type { ColorPalette } from '@/constants/colors';

/**
 * Returns the active color palette (light or dark) based on system preference.
 * Use this in every component instead of importing Colors directly.
 *
 * Usage:
 *   const Colors = useThemeColors();
 *   <View style={{ backgroundColor: Colors.surface }} />
 */
export function useThemeColors(): ColorPalette {
  return useTheme().colors;
}
