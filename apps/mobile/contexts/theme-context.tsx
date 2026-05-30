import { createContext, useContext } from 'react';

import { LightColors, type ColorPalette } from '@/constants/colors';

interface ThemeContextValue {
  colors: ColorPalette;
  colorScheme: 'light' | 'dark';
  isDark: boolean;
}

// Dark mode has been removed. The app always renders the warm "parchment"
// light theme regardless of the system appearance. The shape is kept so
// existing consumers (useTheme / useThemeColors) continue to work unchanged.
const LIGHT_THEME: ThemeContextValue = {
  colors: LightColors,
  colorScheme: 'light',
  isDark: false,
};

const ThemeContext = createContext<ThemeContextValue>(LIGHT_THEME);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return <ThemeContext.Provider value={LIGHT_THEME}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}
