import type { ComponentProps, ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Animated, { FadeInUp, useReducedMotion } from 'react-native-reanimated';

import { FontFamily, Radius, ShadowE1, Spacing } from '@/constants/theme';
import { useThemeColors } from '@/hooks/use-theme-colors';

type IconName = ComponentProps<typeof Ionicons>['name'];

export interface SettingsHeaderProps {
  title: string;
  /** Called instead of `router.back()` when set (the edit screen's leave guard). */
  onBack?: () => void;
  backDisabled?: boolean;
}

/** The back arrow and title every settings screen opens with. */
export function SettingsHeader({ title, onBack, backDisabled }: SettingsHeaderProps) {
  const Colors = useThemeColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.header, { paddingTop: insets.top + Spacing[2] }]}>
      <Pressable
        onPress={() => {
          if (backDisabled) return;
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
          if (onBack) onBack();
          else router.back();
        }}
        disabled={backDisabled}
        hitSlop={12}
        accessibilityRole="button"
        accessibilityLabel="Go back"
        accessibilityState={{ disabled: !!backDisabled }}
        style={[styles.backButton, backDisabled && styles.dimmed]}
      >
        <Ionicons name="arrow-back" size={24} color={Colors.onSurface} />
      </Pressable>
      <Text style={[styles.headerTitle, { color: Colors.onSurface }]} accessibilityRole="header">
        {title}
      </Text>
      <View style={styles.backButton} />
    </View>
  );
}

export interface SettingsGroupProps {
  title: string;
  delay?: number;
  children: ReactNode;
}

/** A titled group: a small gold label above one lifted parchment card. */
export function SettingsGroup({ title, delay = 0, children }: SettingsGroupProps) {
  const Colors = useThemeColors();
  const reduceMotion = useReducedMotion();
  return (
    <Animated.View
      entering={reduceMotion ? undefined : FadeInUp.duration(320).delay(delay)}
      style={styles.group}
    >
      <Text style={[styles.groupLabel, { color: Colors.primary }]}>{title.toUpperCase()}</Text>
      <View style={[styles.groupCard, ShadowE1, { backgroundColor: Colors.surfaceLowest }]}>
        {children}
      </View>
    </Animated.View>
  );
}

export interface SettingsRowProps {
  icon: IconName;
  title: string;
  body?: string;
  onPress?: () => void;
  /** Crimson icon and title, for sign out and delete. */
  tone?: 'default' | 'destructive';
  /** Replaces the chevron (a switch, a spinner). */
  accessory?: ReactNode;
  busy?: boolean;
  disabled?: boolean;
  accessibilityHint?: string;
}

/**
 * One settings row. Tappable when it has `onPress`; a static row (the Google
 * sign in note) has none and shows no chevron.
 */
export function SettingsRow({
  icon,
  title,
  body,
  onPress,
  tone = 'default',
  accessory,
  busy,
  disabled,
  accessibilityHint,
}: SettingsRowProps) {
  const Colors = useThemeColors();
  const tint = tone === 'destructive' ? Colors.secondary : Colors.primary;
  const iconBg = tone === 'destructive' ? Colors.secondaryLight : Colors.primaryLight;

  const content = (
    <>
      <View style={[styles.iconWell, { backgroundColor: iconBg }]}>
        <Ionicons name={icon} size={18} color={tint} />
      </View>
      <View style={styles.rowText}>
        <Text
          style={[
            styles.rowTitle,
            { color: tone === 'destructive' ? Colors.secondary : Colors.onSurface },
          ]}
        >
          {title}
        </Text>
        {body ? (
          <Text style={[styles.rowBody, { color: Colors.onSurfaceVariant }]}>{body}</Text>
        ) : null}
      </View>
      {busy ? (
        <ActivityIndicator size="small" color={tint} />
      ) : accessory !== undefined ? (
        accessory
      ) : onPress ? (
        <Ionicons name="chevron-forward" size={18} color={Colors.outline} />
      ) : null}
    </>
  );

  if (!onPress) {
    return (
      <View style={styles.row} accessible accessibilityLabel={body ? `${title}. ${body}` : title}>
        {content}
      </View>
    );
  }

  return (
    <Pressable
      onPress={() => {
        if (disabled || busy) return;
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
        onPress();
      }}
      disabled={disabled || busy}
      style={({ pressed }) => [
        styles.row,
        pressed && { backgroundColor: Colors.surfaceLow },
        (disabled || busy) && styles.dimmed,
      ]}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityHint={accessibilityHint ?? body}
      accessibilityState={{ disabled: !!(disabled || busy), busy: !!busy }}
    >
      {content}
    </Pressable>
  );
}

/** The tonal gap between rows in one group (No Line Rule: a shift, not a rule). */
export function SettingsDivider() {
  const Colors = useThemeColors();
  return <View style={[styles.divider, { backgroundColor: Colors.surfaceLow }]} />;
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing[5],
    paddingBottom: Spacing[3],
  },
  backButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontFamily: FontFamily.display, fontSize: 20, lineHeight: 26 },
  dimmed: { opacity: 0.45 },
  group: { marginBottom: Spacing[6] },
  groupLabel: {
    fontFamily: FontFamily.bodyExtraBold,
    fontSize: 12,
    lineHeight: 16,
    letterSpacing: 1.4,
    marginBottom: Spacing[2],
    marginLeft: Spacing[1],
  },
  groupCard: { borderRadius: Radius.lg, overflow: 'hidden' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[3],
    paddingHorizontal: Spacing[4],
    paddingVertical: Spacing[3],
    minHeight: 64,
  },
  iconWell: {
    width: 36,
    height: 36,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowText: { flex: 1, gap: 2 },
  rowTitle: { fontFamily: FontFamily.bodySemiBold, fontSize: 15, lineHeight: 21 },
  rowBody: { fontFamily: FontFamily.body, fontSize: 13, lineHeight: 19 },
  divider: { height: 2, marginLeft: Spacing[4] + 36 + Spacing[3] },
});
