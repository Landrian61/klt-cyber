import { View, StyleSheet, ViewProps } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { Radius, Spacing, AmbientShadow, GoldGradient } from '@/constants/theme';
import { useThemeColors } from '@/hooks/use-theme-colors';

export type CardVariant = 'editorial' | 'hero' | 'sunken' | 'priority';

export interface CardProps extends ViewProps {
  variant?: CardVariant;
  children: React.ReactNode;
}

export function Card({ variant = 'editorial', children, style, ...rest }: CardProps) {
  const Colors = useThemeColors();

  if (variant === 'hero') {
    return (
      <LinearGradient
        colors={[...GoldGradient.colors]}
        start={GoldGradient.start}
        end={GoldGradient.end}
        style={[styles.hero, AmbientShadow, style]}
        {...rest}
      >
        {children}
      </LinearGradient>
    );
  }

  const variantStyle =
    variant === 'sunken'
      ? [styles.sunken, { backgroundColor: Colors.primaryFixedDim }]
      : variant === 'priority'
        ? [styles.priority, { backgroundColor: Colors.surfaceLowest, borderLeftColor: Colors.primaryBrand }]
        : [styles.editorial, { backgroundColor: Colors.surfaceLowest }];

  return (
    <View style={[variantStyle, style]} {...rest}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  editorial: {
    borderRadius: Radius.lg,
    padding: Spacing[4],
  },
  hero: {
    borderRadius: Radius.xl,
    padding: Spacing[5],
  },
  sunken: {
    borderRadius: Radius.lg,
    padding: Spacing[4],
  },
  priority: {
    borderLeftWidth: 3,
    borderTopRightRadius: Radius.lg,
    borderBottomRightRadius: Radius.lg,
    padding: Spacing[4],
  },
});
