import { View, StyleSheet, ViewProps } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { Colors, Radius, Spacing, AmbientShadow, GoldGradient } from '@/constants/theme';

export type CardVariant = 'editorial' | 'hero' | 'sunken' | 'priority';

export interface CardProps extends ViewProps {
  variant?: CardVariant;
  children: React.ReactNode;
}

export function Card({ variant = 'editorial', children, style, ...rest }: CardProps) {
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
      ? styles.sunken
      : variant === 'priority'
        ? styles.priority
        : styles.editorial;

  return (
    <View style={[variantStyle, style]} {...rest}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  editorial: {
    backgroundColor: Colors.surfaceLowest,
    borderRadius: Radius.lg,
    padding: Spacing[4],
  },
  hero: {
    borderRadius: Radius.xl,
    padding: Spacing[5],
  },
  sunken: {
    backgroundColor: Colors.primaryFixedDim,
    borderRadius: Radius.lg,
    padding: Spacing[4],
  },
  priority: {
    backgroundColor: Colors.surfaceLowest,
    borderLeftWidth: 3,
    borderLeftColor: Colors.primaryBrand,
    borderTopRightRadius: Radius.lg,
    borderBottomRightRadius: Radius.lg,
    padding: Spacing[4],
  },
});
