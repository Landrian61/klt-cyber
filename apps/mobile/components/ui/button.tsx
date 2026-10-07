import { Pressable, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
} from 'react-native-reanimated';

import { FontFamily, Radius, Duration, GoldGradient, GoldGlow } from '@/constants/theme';
import { useThemeColors } from '@/hooks/use-theme-colors';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'destructive' | 'textLink' | 'icon';

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
    scale.value = withTiming(0.97, { duration: Duration.fast });
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
        <Text style={[styles.textLinkLabel, { color: Colors.primary }, disabled && { color: Colors.faint }]}>
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
        style={[animatedStyle, fullWidth && styles.fullWidth, !disabled && GoldGlow, disabled && styles.disabledPrimary]}
        disabled={disabled || loading}
        accessibilityLabel={accessibilityLabel || label}
        accessibilityRole="button"
      >
        <LinearGradient
          colors={[...GoldGradient.colors]}
          start={GoldGradient.start}
          end={GoldGradient.end}
          style={[styles.base, fullWidth && styles.fullWidth]}
        >
          {loading ? (
            <ActivityIndicator size="small" color={Colors.onPrimary} />
          ) : (
            <Text style={[styles.primaryLabel, { color: Colors.onPrimary }]}>{label}</Text>
          )}
        </LinearGradient>
      </AnimatedPressable>
    );
  }

  // Secondary (gold tint), Ghost (soft inset ring), Destructive (solid red).
  const isDestructive = variant === 'destructive';
  const isGhost = variant === 'ghost';

  const fill = isDestructive
    ? Colors.secondary
    : isGhost
      ? 'transparent'
      : Colors.goldTint; // secondary
  const textColor = isDestructive
    ? Colors.onSecondary
    : isGhost
      ? Colors.onSurface
      : Colors.primaryDeep;

  return (
    <AnimatedPressable
      onPress={handlePress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      disabled={disabled || loading}
      style={[
        animatedStyle,
        styles.base,
        styles.soft,
        { backgroundColor: fill },
        isGhost && { borderWidth: 1.5, borderColor: 'rgba(36,27,16,0.18)' },
        disabled && { opacity: 0.5 },
        fullWidth && styles.fullWidth,
      ]}
      accessibilityLabel={accessibilityLabel || label}
      accessibilityRole="button"
    >
      {loading ? (
        <ActivityIndicator size="small" color={textColor} />
      ) : (
        <Text style={[styles.softLabel, { color: textColor }]}>{label}</Text>
      )}
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  base: {
    height: 54,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  // Secondary / ghost / destructive sit a touch shorter than the primary CTA.
  soft: {
    height: 50,
  },
  fullWidth: {
    width: '100%',
  },
  disabledPrimary: {
    opacity: 0.4,
  },
  primaryLabel: {
    fontFamily: FontFamily.bodyExtraBold,
    fontSize: 16,
    lineHeight: 24,
  },
  softLabel: {
    fontFamily: FontFamily.bodyBold,
    fontSize: 15,
    lineHeight: 22,
  },
  textLinkLabel: {
    fontFamily: FontFamily.bodyExtraBold,
    fontSize: 14,
    lineHeight: 20,
  },
  iconButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.full,
  },
});
