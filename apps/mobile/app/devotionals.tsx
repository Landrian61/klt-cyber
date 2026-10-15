import {
  View, Text, Pressable, StyleSheet, FlatList, ActivityIndicator,
} from 'react-native';
import { useState } from 'react';
import { useRouter } from 'expo-router';
import { useQuery } from 'convex/react';
import { useTodayKey } from '@/hooks/use-today-key';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInUp } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';

import { FontFamily, Spacing, Radius, AmbientShadow } from '@/constants/theme';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { api, type Doc } from '@/lib/api';
import { formatDateKey } from '@/lib/format-date-key';

type Devotional = Doc<'devotionals'>;

function DevotionalRow({
  item,
  index,
  todayKey,
}: {
  item: Devotional;
  index: number;
  todayKey: string;
}) {
  const Colors = useThemeColors();
  const [expanded, setExpanded] = useState(false);
  const isToday = item.date === todayKey;

  return (
    <Animated.View entering={FadeInUp.duration(300).delay(index * 50)}>
      <Pressable
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          setExpanded((prev) => !prev);
        }}
        style={[styles.row, AmbientShadow, { backgroundColor: Colors.surfaceLowest }]}
        accessibilityRole="button"
        accessibilityLabel={`${item.title}, ${item.scriptureReference}`}
      >
        <View style={styles.rowHeader}>
          <View style={styles.rowTitleArea}>
            <Text style={[styles.rowTitle, { color: Colors.onSurface }]} numberOfLines={2}>
              {item.title}
            </Text>
            {isToday && (
              <View style={[styles.todayPill, { backgroundColor: Colors.primaryLight }]}>
                <Text style={[styles.todayPillText, { color: Colors.primary }]}>Today</Text>
              </View>
            )}
          </View>
          <Ionicons
            name={expanded ? 'chevron-up' : 'chevron-down'}
            size={18}
            color={Colors.outline}
          />
        </View>
        <Text style={[styles.rowScripture, { color: Colors.primary }]}>
          {item.scriptureReference}
        </Text>
        <Text style={[styles.rowDate, { color: Colors.outline }]}>
          {formatDateKey(item.date)}
        </Text>
        {expanded && (
          <Text style={[styles.rowBody, { color: Colors.onSurfaceVariant }]}>
            {item.body}
          </Text>
        )}
      </Pressable>
    </Animated.View>
  );
}

export default function DevotionalsScreen() {
  const Colors = useThemeColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const todayKey = useTodayKey();
  const devotionals = useQuery(api.devotionals.listRecent, { todayKey });
  const isLoading = devotionals === undefined;

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
        <Text style={[styles.headerTitle, { color: Colors.onSurface }]}>Devotionals</Text>
        <View style={styles.backButton} />
      </View>

      {isLoading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={Colors.primary} />
        </View>
      ) : (
        <FlatList
          data={devotionals}
          keyExtractor={(item) => item._id}
          contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + Spacing[6] }]}
          showsVerticalScrollIndicator={false}
          renderItem={({ item, index }) => (
            <DevotionalRow item={item} index={index} todayKey={todayKey} />
          )}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Ionicons name="book-outline" size={40} color={Colors.outline} />
              <Text style={[styles.emptyTitle, { color: Colors.onSurfaceVariant }]}>
                No devotionals yet
              </Text>
              <Text style={[styles.emptySubtitle, { color: Colors.outline }]}>
                Daily devotionals will appear here once they are published.
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
  backButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontFamily: FontFamily.display,
    fontSize: 20,
    lineHeight: 26,
  },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  list: {
    paddingHorizontal: Spacing[5],
    gap: Spacing[3],
    flexGrow: 1,
  },
  row: {
    borderRadius: Radius.lg,
    padding: Spacing[4],
  },
  rowHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: Spacing[2],
  },
  rowTitleArea: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: Spacing[2],
  },
  rowTitle: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 15,
    lineHeight: 20,
  },
  todayPill: {
    borderRadius: Radius.full,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  todayPillText: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 10,
    lineHeight: 14,
  },
  rowScripture: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 12,
    lineHeight: 18,
    marginTop: Spacing[1],
  },
  rowDate: {
    fontFamily: FontFamily.body,
    fontSize: 11,
    lineHeight: 15.4,
    marginTop: 2,
  },
  rowBody: {
    fontFamily: FontFamily.body,
    fontSize: 14,
    lineHeight: 22.4,
    marginTop: Spacing[3],
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: Spacing[10],
  },
  emptyTitle: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 16,
    lineHeight: 24,
    marginTop: Spacing[3],
  },
  emptySubtitle: {
    fontFamily: FontFamily.body,
    fontSize: 12,
    lineHeight: 18,
    marginTop: Spacing[1],
    textAlign: 'center',
    paddingHorizontal: Spacing[8],
  },
});
