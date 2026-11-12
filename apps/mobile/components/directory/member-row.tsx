import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { DIRECTORY_COPY } from '@klt-cyber/shared';

import type { FunctionReturnType } from 'convex/server';

import type { api, Id } from '@/lib/api';
import { Duration, FontFamily, Radius, ShadowE1, Spacing } from '@/constants/theme';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { MemberAvatar } from '@/components/directory/member-avatar';

/**
 * The row shape `directory.list` returns, inferred from the query itself so
 * the phone can never drift from the server's `DirectoryRow`.
 */
export type DirectoryListRow = FunctionReturnType<typeof api.directory.list>['rows'][number];

export function directoryFullName(name: DirectoryListRow['name']): string {
  return [name.first, name.middle, name.last].filter(Boolean).join(' ');
}

export interface MemberRowProps {
  row: DirectoryListRow;
  /** Department names, already resolved by the screen from the list's `departments`. */
  areas: string[];
  isSelf?: boolean;
  onOpen: (userId: Id<'users'>) => void;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/**
 * One directory row: avatar, name, clan, Areas of Service, and the contact
 * mark when the server says both sides share (AC-8). Memoized so search
 * keystrokes only re-render rows that actually change.
 */
export const MemberRow = memo(function MemberRow({ row, areas, isSelf, onOpen }: MemberRowProps) {
  const Colors = useThemeColors();
  const scale = useSharedValue(1);
  const pressStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const fullName = directoryFullName(row.name);
  const subtitle = [row.clan?.name, row.occupation].filter(Boolean).join(' · ');

  const label = [
    isSelf ? `${fullName}, ${DIRECTORY_COPY.selfLabel}` : fullName,
    row.clan?.name,
    areas.length > 0 ? areas.join(', ') : undefined,
    row.contactable ? DIRECTORY_COPY.contactMarkLabel : undefined,
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <AnimatedPressable
      onPressIn={() => {
        scale.value = withTiming(0.98, { duration: Duration.fast });
      }}
      onPressOut={() => {
        scale.value = withTiming(1, { duration: Duration.fast });
      }}
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onOpen(row.userId);
      }}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint="Opens their directory card"
      style={[
        styles.card,
        ShadowE1,
        { backgroundColor: isSelf ? Colors.primaryFixedDim : Colors.surfaceLowest },
        pressStyle,
      ]}
    >
      <MemberAvatar name={row.name} photoUrl={row.photoUrl} />
      <View style={styles.info}>
        <View style={styles.nameLine}>
          <Text style={[styles.name, { color: Colors.onSurface }]} numberOfLines={1}>
            {fullName}
          </Text>
          {isSelf && (
            <View style={[styles.youPill, { backgroundColor: Colors.primary }]}>
              <Text style={[styles.youText, { color: Colors.onPrimary }]}>{DIRECTORY_COPY.selfLabel}</Text>
            </View>
          )}
        </View>
        {subtitle.length > 0 && (
          <Text style={[styles.subtitle, { color: Colors.onSurfaceVariant }]} numberOfLines={1}>
            {subtitle}
          </Text>
        )}
        {areas.length > 0 && (
          <Text style={[styles.areas, { color: Colors.outline }]} numberOfLines={1}>
            {areas.join(' · ')}
          </Text>
        )}
      </View>
      {row.contactable && !isSelf && (
        <View style={[styles.mark, { backgroundColor: Colors.primaryLight }]}>
          <Ionicons name="call" size={14} color={Colors.primary} />
        </View>
      )}
      <Ionicons name="chevron-forward" size={18} color={Colors.faint} />
    </AnimatedPressable>
  );
});

const styles = StyleSheet.create({
  card: {
    borderRadius: Radius.lg,
    paddingVertical: Spacing[3],
    paddingHorizontal: Spacing[4],
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[3],
    minHeight: 72,
  },
  info: {
    flex: 1,
  },
  nameLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[2],
  },
  name: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 15,
    lineHeight: 22,
    flexShrink: 1,
  },
  youPill: {
    borderRadius: Radius.full,
    paddingHorizontal: Spacing[2],
    height: 20,
    justifyContent: 'center',
  },
  youText: {
    fontFamily: FontFamily.bodyBold,
    fontSize: 11,
  },
  subtitle: {
    fontFamily: FontFamily.body,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 2,
  },
  areas: {
    fontFamily: FontFamily.body,
    fontSize: 11,
    lineHeight: 16,
    marginTop: 2,
  },
  mark: {
    width: 28,
    height: 28,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
