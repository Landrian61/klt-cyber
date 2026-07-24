import { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';

import { FontFamily, Radius } from '@/constants/theme';
import { useThemeColors } from '@/hooks/use-theme-colors';

export type BadgeVariant =
  | 'minister' | 'pastoral' | 'hod' | 'member' | 'priority'
  | 'elder'
  | 'mentorshipComplete' | 'confirmed'
  | 'visitor'
  | 'pending'
  | 'ended'
  | 'live';

export interface BadgeProps {
  label: string;
  variant?: BadgeVariant;
}

export function Badge({ label, variant = 'member' }: BadgeProps) {
  const Colors = useThemeColors();

  // Kingdom Radiant badge system: role/leadership → blue tint (heaven, teaching);
  // membership & pending → gold tint (Kingdom); priority & LIVE → solid red
  // (the heartbeat); confirmed → green; visitor/ended → muted cream.
  const BADGE_COLORS = useMemo<Record<BadgeVariant, { bg: string; text: string }>>(() => ({
    minister: { bg: Colors.blueTint, text: Colors.tertiaryDeep },
    pastoral: { bg: Colors.blueTint, text: Colors.tertiaryDeep },
    hod: { bg: Colors.blueTint, text: Colors.tertiaryDeep },
    elder: { bg: Colors.blueTint, text: Colors.tertiaryDeep },
    member: { bg: Colors.goldTint, text: Colors.primaryDeep },
    priority: { bg: Colors.secondary, text: '#FFFFFF' },
    mentorshipComplete: { bg: Colors.successLight, text: Colors.success },
    confirmed: { bg: Colors.successLight, text: Colors.success },
    visitor: { bg: Colors.surfaceLow, text: Colors.outline },
    pending: { bg: Colors.goldTint, text: Colors.primaryDeep },
    ended: { bg: Colors.surfaceLow, text: Colors.outline },
    live: { bg: Colors.secondary, text: '#FFFFFF' },
  }), [Colors]);

  const colors = BADGE_COLORS[variant];

  return (
    <View style={[styles.badge, { backgroundColor: colors.bg }]}>
      <Text style={[styles.label, { color: colors.text }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    height: 22,
    paddingHorizontal: 11,
    paddingVertical: 2,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontFamily: FontFamily.bodyExtraBold,
    fontSize: 10.5,
    lineHeight: 14,
    letterSpacing: 0.4,
  },
});
