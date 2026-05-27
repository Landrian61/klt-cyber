import { createContext, useContext, useMemo } from 'react';
import { useColorScheme } from 'react-native';

import { LightColors, DarkColors, type ColorPalette } from '@/constants/colors';

interface ThemeContextValue {
  colors: ColorPalette;
  colorScheme: 'light' | 'dark';
  isDark: boolean;
}

const ThemeContext = createContext<ThemeContextValue>({
  colors: LightColors,
  colorScheme: 'light',
  isDark: false,
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useColorScheme();
  const colorScheme = systemScheme === 'dark' ? 'dark' : 'light';

  const value = useMemo<ThemeContextValue>(() => ({
    colors: colorScheme === 'dark' ? DarkColors : LightColors,
    colorScheme,
    isDark: colorScheme === 'dark',
  }), [colorScheme]);

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}
