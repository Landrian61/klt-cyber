import { View, StyleSheet, ViewProps } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { Radius, Spacing, ShadowE1, ShadowE2, GoldGradient } from '@/constants/theme';
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
        style={[styles.hero, ShadowE2, style]}
        {...rest}
      >
        {children}
      </LinearGradient>
    );
  }

  if (variant === 'sunken') {
    return (
      <View style={[styles.sunken, { backgroundColor: Colors.primaryFixedDim }, style]} {...rest}>
        {children}
      </View>
    );
  }

  if (variant === 'priority') {
    // No-Line: a soft red-tint wash fades in from the left edge — the heartbeat
    // of a priority notice — rather than a hard stripe.
    return (
      <View
        style={[styles.priority, ShadowE2, { backgroundColor: Colors.surfaceLowest }, style]}
        {...rest}
      >
        <LinearGradient
          colors={[Colors.redTint, 'transparent']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.priorityWash}
          pointerEvents="none"
        />
        {children}
      </View>
    );
  }

  return (
    <View style={[styles.editorial, ShadowE1, { backgroundColor: Colors.surfaceLowest }, style]} {...rest}>
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
    borderRadius: Radius.lg,
    padding: Spacing[4],
    overflow: 'hidden',
  },
  priorityWash: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 64,
  },
});
