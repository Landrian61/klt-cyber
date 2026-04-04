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

  const BADGE_COLORS = useMemo<Record<BadgeVariant, { bg: string; text: string }>>(() => ({
    minister: { bg: Colors.primaryLight, text: Colors.primary },
    pastoral: { bg: Colors.primaryLight, text: Colors.primary },
    hod: { bg: Colors.primaryLight, text: Colors.primary },
    member: { bg: Colors.primaryLight, text: Colors.primary },
    priority: { bg: Colors.primaryLight, text: Colors.primary },
    elder: { bg: '#FBF3E0', text: '#785600' },
    mentorshipComplete: { bg: Colors.successLight, text: Colors.success },
    confirmed: { bg: Colors.successLight, text: Colors.success },
    visitor: { bg: Colors.tertiaryLight, text: Colors.tertiary },
    pending: { bg: Colors.warningLight, text: Colors.warning },
    ended: { bg: Colors.surfaceLow, text: Colors.onSurfaceVariant },
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
    paddingHorizontal: 10,
    paddingVertical: 2,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 11,
    lineHeight: 15.4,
  },
});
