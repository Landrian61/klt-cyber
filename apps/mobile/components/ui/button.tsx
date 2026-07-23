import { Pressable, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
} from 'react-native-reanimated';

import { FontFamily, Radius, Duration, GoldGradient } from '@/constants/theme';
import { useThemeColors } from '@/hooks/use-theme-colors';

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
  const Colors = useThemeColors();
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
        <Text style={[styles.textLinkLabel, { color: Colors.primary }, disabled && { color: Colors.outline }]}>
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
            <Text style={[styles.primaryLabel, { color: Colors.onPrimary }, disabled && { color: Colors.outline }]}>
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
        // No-Line Rule: depth comes from a tonal fill, never a 1px outline.
        { backgroundColor: isDestructive ? Colors.secondaryLight : Colors.surfaceLow },
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
            { color: Colors.primary },
            isDestructive && { color: Colors.secondary },
            disabled && { color: Colors.outline },
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
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 16,
    lineHeight: 24,
  },
  ghostLabel: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 16,
    lineHeight: 24,
  },
  textLinkLabel: {
    fontFamily: FontFamily.bodyMedium,
    fontSize: 14,
    lineHeight: 22.4,
    textDecorationLine: 'underline',
  },
  iconButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.full,
  },
});
