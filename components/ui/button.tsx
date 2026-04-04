import { Pressable, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
} from 'react-native-reanimated';

import { Colors, FontFamily, Radius, Duration, GoldGradient } from '@/constants/theme';

export type ButtonVariant = 'primary' | 'ghost' | 'destructive' | 'textLink' | 'icon';

export interface ButtonProps {
  label?: string;
  variant?: ButtonVariant;
  onPress?: () => void;
  disabled?: boolean;
  loading?: boolean;
  fullWidth?: boolean;
  icon?: React.ReactNode;
  accessibilityLabel?: string;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function Button({
  label,
  variant = 'primary',
  onPress,
  disabled = false,
  loading = false,
  fullWidth = true,
  icon,
  accessibilityLabel,
}: ButtonProps) {
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = () => {
    scale.value = withTiming(0.98, { duration: Duration.fast });
  };

  const handlePressOut = () => {
    scale.value = withTiming(1, { duration: Duration.fast });
  };

  const handlePress = () => {
    if (disabled || loading) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onPress?.();
  };

  if (variant === 'icon') {
    return (
      <AnimatedPressable
        onPress={handlePress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        style={[animatedStyle, styles.iconButton]}
        accessibilityLabel={accessibilityLabel}
        accessibilityRole="button"
      >
        {icon}
      </AnimatedPressable>
    );
  }

  if (variant === 'textLink') {
    return (
      <Pressable
        onPress={handlePress}
        accessibilityLabel={accessibilityLabel || label}
        accessibilityRole="link"
      >
        <Text style={[styles.textLinkLabel, disabled && styles.disabledTextLink]}>
          {label}
        </Text>
      </Pressable>
    );
  }

  if (variant === 'primary') {
    return (
      <AnimatedPressable
        onPress={handlePress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        style={[animatedStyle, fullWidth && styles.fullWidth]}
        disabled={disabled || loading}
        accessibilityLabel={accessibilityLabel || label}
        accessibilityRole="button"
      >
        <LinearGradient
          colors={disabled ? [Colors.surfaceHigh, Colors.surfaceHigh] : [...GoldGradient.colors]}
          start={GoldGradient.start}
          end={GoldGradient.end}
          style={[styles.base, fullWidth && styles.fullWidth]}
        >
          {loading ? (
            <ActivityIndicator size="small" color={Colors.onPrimary} />
          ) : (
            <Text style={[styles.primaryLabel, disabled && styles.disabledLabel]}>
              {label}
            </Text>
          )}
        </LinearGradient>
      </AnimatedPressable>
    );
  }

  // Ghost and Destructive variants
  const isDestructive = variant === 'destructive';

  return (
    <AnimatedPressable
      onPress={handlePress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      disabled={disabled || loading}
      style={[
        animatedStyle,
        styles.base,
        isDestructive ? styles.destructive : styles.ghost,
        fullWidth && styles.fullWidth,
      ]}
      accessibilityLabel={accessibilityLabel || label}
      accessibilityRole="button"
    >
      {loading ? (
        <ActivityIndicator
          size="small"
          color={isDestructive ? Colors.secondary : Colors.primary}
        />
      ) : (
        <Text
          style={[
            styles.ghostLabel,
            isDestructive && styles.destructiveLabel,
            disabled && styles.disabledLabel,
          ]}
        >
          {label}
        </Text>
      )}
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  base: {
    height: 52,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  fullWidth: {
    width: '100%',
  },
  primaryLabel: {
    color: Colors.onPrimary,
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 16,
    lineHeight: 24,
  },
  ghost: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: 'rgba(120, 86, 0, 0.20)',
  },
  ghostLabel: {
    color: Colors.primary,
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 16,
    lineHeight: 24,
  },
  destructive: {
    backgroundColor: Colors.secondaryLight,
    borderWidth: 1,
    borderColor: 'rgba(171, 51, 50, 0.20)',
  },
  destructiveLabel: {
    color: Colors.secondary,
  },
  textLinkLabel: {
    color: Colors.primary,
    fontFamily: FontFamily.bodyMedium,
    fontSize: 14,
    lineHeight: 22.4,
    textDecorationLine: 'underline',
  },
  disabledLabel: {
    color: Colors.outline,
  },
  disabledTextLink: {
    color: Colors.outline,
  },
  iconButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.full,
  },
});
