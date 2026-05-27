import { View, type ViewProps } from 'react-native';

import { useThemeColors } from '@/hooks/use-theme-colors';

export type ThemedViewProps = ViewProps;

export function ThemedView({ style, ...otherProps }: ThemedViewProps) {
  const Colors = useThemeColors();

  return <View style={[{ backgroundColor: Colors.surface }, style]} {...otherProps} />;
}
