import { ActivityIndicator, FlatList, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from 'convex/react';
import type { FunctionReturnType } from 'convex/server';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInUp } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';

import { AmbientShadow, FontFamily, Radius, Spacing } from '@/constants/theme';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { ErrorState } from '@/components/ui/error-state';
import { useSetRadioFollow } from '@/components/radio/follow-toggle';
import { api } from '@/lib/api';

type FollowRow = NonNullable<FunctionReturnType<typeof api.radioFollows.listMine>>[number];

const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function whenLabel(row: FollowRow): string {
  if (row.recurrence === 'occasional') return 'Occasional';
  const [h, m] = row.startTime.split(':').map(Number);
  const h12 = h % 12 === 0 ? 12 : h % 12;
  const time = `${h12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
  return `${row.days.map((d) => WEEKDAY_SHORT[d]).join(', ')} · ${time}`;
}

/**
 * Followed radio programs (spec 0019, AC-9, AC-10, M6-05), reached from My
 * Profile. Every active program with a switch; a followed program sends a
 * push when it goes live. The state is the same one the Radio schedule's
 * bells show, and a change here flips those too without a refresh.
 */
export default function RadioFollowsScreen() {
  const Colors = useThemeColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const programs = useQuery(api.radioFollows.listMine, {});
  const setFollow = useSetRadioFollow();

  return (
    <View style={[styles.container, { paddingTop: insets.top, backgroundColor: Colors.surface }]}>
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          style={styles.backButton}
        >
          <Ionicons name="arrow-back" size={24} color={Colors.onSurface} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: Colors.onSurface }]} accessibilityRole="header">
          Radio programs
        </Text>
        <View style={styles.backButton} />
      </View>

      {programs === null ? (
        <View style={styles.centered}>
          <ErrorState />
        </View>
      ) : programs === undefined ? (
        <View style={styles.centered}>
          <ActivityIndicator color={Colors.primary} />
        </View>
      ) : (
        <FlatList
          data={programs}
          keyExtractor={(item) => item._id}
          contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + Spacing[6] }]}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            <Text style={[styles.intro, { color: Colors.onSurfaceVariant }]}>
              We send you a push when a program you follow goes live on Reign Radio.
            </Text>
          }
          renderItem={({ item, index }) => (
            <Animated.View
              entering={FadeInUp.duration(300).delay(Math.min(index, 6) * 50)}
              style={[styles.row, AmbientShadow, { backgroundColor: Colors.surfaceLowest }]}
            >
              <View style={styles.rowBody}>
                <Text style={[styles.rowName, { color: Colors.onSurface }]} numberOfLines={1}>
                  {item.name}
                </Text>
                <Text style={[styles.rowMeta, { color: Colors.onSurfaceVariant }]} numberOfLines={1}>
                  {whenLabel(item)}
                </Text>
              </View>
              <Switch
                value={item.isFollowed}
                onValueChange={(following) => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                  setFollow({ programId: item._id, following }).catch(() => {});
                }}
                trackColor={{ false: Colors.surfaceHigh, true: Colors.primaryFixedDim }}
                thumbColor={item.isFollowed ? Colors.primary : Colors.outline}
                accessibilityLabel={`Follow ${item.name}`}
              />
            </Animated.View>
          )}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="radio-outline" size={40} color={Colors.outline} />
              <Text style={[styles.emptyTitle, { color: Colors.onSurfaceVariant }]}>
                No radio programs yet
              </Text>
              <Text style={[styles.emptyBody, { color: Colors.outline }]}>
                Once the Media team adds programs, you can follow them here.
              </Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing[5],
    paddingVertical: Spacing[3],
  },
  backButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontFamily: FontFamily.display, fontSize: 20, lineHeight: 26 },
  centered: { flex: 1, justifyContent: 'center', padding: Spacing[5] },
  list: { paddingHorizontal: Spacing[5], gap: Spacing[3] },
  intro: { fontFamily: FontFamily.body, fontSize: 13, lineHeight: 19, marginBottom: Spacing[2] },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[3],
    borderRadius: Radius.lg,
    paddingHorizontal: Spacing[4],
    paddingVertical: Spacing[3],
    minHeight: 64,
  },
  rowBody: { flex: 1, gap: 2 },
  rowName: { fontFamily: FontFamily.bodySemiBold, fontSize: 15, lineHeight: 21 },
  rowMeta: { fontFamily: FontFamily.body, fontSize: 12, lineHeight: 17 },
  empty: { alignItems: 'center', gap: Spacing[2], paddingTop: Spacing[8] },
  emptyTitle: { fontFamily: FontFamily.bodySemiBold, fontSize: 15, lineHeight: 21 },
  emptyBody: { fontFamily: FontFamily.body, fontSize: 13, lineHeight: 19, textAlign: 'center' },
});
