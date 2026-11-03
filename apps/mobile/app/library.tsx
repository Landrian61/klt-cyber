import { useMemo, useState } from 'react';
import {
  View, Text, Pressable, StyleSheet, FlatList, ScrollView, ActivityIndicator, TextInput,
} from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { useQuery } from 'convex/react';
import type { FunctionReturnType } from 'convex/server';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  FadeInUp, useSharedValue, useAnimatedStyle, withTiming,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import {
  LIBRARY_ITEM_TYPES,
  LIBRARY_ITEM_TYPE_LABELS,
  formatUgx,
  type LibraryItemType,
} from '@klt-cyber/shared';

import {
  FontFamily, Spacing, Radius, AmbientShadow, Duration,
} from '@/constants/theme';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { Cover } from '@/components/ui/cover';
import { Badge } from '@/components/ui/badge';
import { ErrorState } from '@/components/ui/error-state';
import { api } from '@/lib/api';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/**
 * The Library (L1-05, L1-06, L2-01, L2-02, L3-04, M10-01).
 *
 * Everything the church carries, in one list: books and merchandise you
 * collect at the desk, and teachings you read or play without leaving the app.
 * One list rather than two tabs, deliberately — a free recording of a teaching
 * belongs beside the book it came from, not behind its own screen.
 *
 * Open to any signed in user, visitor or member alike: the catalogue is church
 * content, and knowing what the Library carries is not a members-only
 * privilege. The only thing a member is never shown is HOW MANY of something
 * there are — just whether it has run out — so the Library's stock position
 * stays internal (AC-16).
 *
 * The segment, the chips and the search all narrow TOGETHER rather than
 * replacing one another, and all of it runs on the already-loaded list: the
 * whole visible catalogue arrives in one query, so filtering is instant and
 * costs no round trip.
 */

type CatalogueItem = NonNullable<
  FunctionReturnType<typeof api.library.listCatalogue>
>[number];

type FormatSegment = 'all' | 'physical' | 'free';

const SEGMENTS: { key: FormatSegment; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'physical', label: 'At the desk' },
  { key: 'free', label: 'Free' },
];

function LibraryRow({
  item, index, onPress,
}: { item: CatalogueItem; index: number; onPress: () => void }) {
  const Colors = useThemeColors();
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const priceLine = item.free
    ? 'Free in the app'
    : item.priceUgx === null
      ? 'Ask at the Library desk'
      : formatUgx(item.priceUgx);

  // "Out of stock" goes into the spoken label as well as the chip. Colour and
  // a chip alone would send a screen reader user to the desk for something
  // that is not there (INTERFACE_SPEC §12.5).
  const spokenLabel = [
    item.title,
    item.author,
    item.categoryName,
    priceLine,
    item.outOfStock ? 'Out of stock' : '',
  ].filter(Boolean).join(', ');

  return (
    <Animated.View entering={FadeInUp.duration(300).delay(Math.min(index, 8) * 60)}>
      <AnimatedPressable
        onPressIn={() => { scale.value = withTiming(0.98, { duration: Duration.fast }); }}
        onPressOut={() => { scale.value = withTiming(1, { duration: 150 }); }}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          onPress();
        }}
        style={[styles.row, animatedStyle, AmbientShadow, { backgroundColor: Colors.surfaceLowest }]}
        accessibilityRole="button"
        accessibilityLabel={spokenLabel}
      >
        <Cover uri={item.coverImageUrl} index={index} imageRadius={0} style={styles.rowImage}>
          {item.free && (
            <View style={styles.rowFormatBadge}>
              <Ionicons
                name={item.format === 'audio' ? 'headset' : 'document-text'}
                size={13}
                color="#FFFFFF"
              />
            </View>
          )}
        </Cover>

        <View style={styles.rowContent}>
          <Text style={[styles.rowTitle, { color: Colors.onSurface }]} numberOfLines={2}>
            {item.title}
          </Text>
          {item.author && (
            <Text style={[styles.rowAuthor, { color: Colors.onSurfaceVariant }]} numberOfLines={1}>
              {item.author}
            </Text>
          )}
          <Text
            style={[
              styles.rowPrice,
              { color: item.free ? Colors.tertiary : Colors.primaryDeep },
            ]}
            numberOfLines={1}
          >
            {priceLine}
          </Text>
          <View style={styles.rowTags}>
            {item.categoryName && <Badge label={item.categoryName} variant="category" />}
            {item.outOfStock && <Badge label="Out of stock" variant="cancelled" />}
          </View>
        </View>

        <View style={styles.rowChevron}>
          <Ionicons name="chevron-forward" size={18} color={Colors.outline} />
        </View>
      </AnimatedPressable>
    </Animated.View>
  );
}

export default function LibraryScreen() {
  const Colors = useThemeColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [segment, setSegment] = useState<FormatSegment>('all');
  const [typeFilter, setTypeFilter] = useState<LibraryItemType | null>(null);
  const [search, setSearch] = useState('');

  const items = useQuery(api.library.listCatalogue, {});

  const isLoading = items === undefined;
  // `null` means the query resolved with no session — the sign-out teardown
  // window, which every screen renders as its loading state rather than as a
  // failure, because the redirect is already on its way.
  const failed = items === null;

  // Which type chips to offer: only the ones something in the catalogue
  // actually is, so the row never advertises a filter that returns nothing.
  const availableTypes = useMemo(() => {
    const present = new Set((items ?? []).map((item) => item.itemType));
    return LIBRARY_ITEM_TYPES.filter((type) => present.has(type));
  }, [items]);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return (items ?? []).filter((item) => {
      if (segment === 'physical' && item.free) return false;
      if (segment === 'free' && !item.free) return false;
      if (typeFilter && item.itemType !== typeFilter) return false;
      if (needle.length === 0) return true;
      return (
        item.title.toLowerCase().includes(needle) ||
        (item.author ?? '').toLowerCase().includes(needle)
      );
    });
  }, [items, segment, typeFilter, search]);

  const narrowed = segment !== 'all' || typeFilter !== null || search.trim().length > 0;

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
        <Text style={[styles.headerTitle, { color: Colors.onSurface }]}>Library</Text>
        <View style={styles.backButton} />
      </View>

      {failed ? (
        <ErrorState retry={() => setSearch((value) => value)} />
      ) : (
        <>
          <View style={[styles.searchWrap, { borderBottomColor: Colors.outlineVariant }]}>
            <Ionicons name="search" size={18} color={Colors.outline} />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Search by title or author"
              placeholderTextColor={Colors.outline}
              accessibilityLabel="Search the Library"
              returnKeyType="search"
              autoCorrect={false}
              style={[styles.searchInput, { color: Colors.onSurface }]}
            />
            {search.length > 0 && (
              <Pressable
                onPress={() => setSearch('')}
                hitSlop={12}
                accessibilityRole="button"
                accessibilityLabel="Clear search"
              >
                <Ionicons name="close" size={18} color={Colors.outline} />
              </Pressable>
            )}
          </View>

          <View style={styles.segmentRow}>
            {SEGMENTS.map((option) => {
              const active = segment === option.key;
              return (
                <Pressable
                  key={option.key}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setSegment(option.key);
                  }}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={`Show ${option.label}`}
                  style={[
                    styles.segment,
                    {
                      backgroundColor: active ? Colors.primaryFixedDim : Colors.surfaceLow,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.segmentLabel,
                      { color: active ? Colors.primaryDeep : Colors.onSurfaceVariant },
                    ]}
                  >
                    {option.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {availableTypes.length > 1 && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.chipRow}
            >
              {availableTypes.map((type) => {
                const active = typeFilter === type;
                return (
                  <Pressable
                    key={type}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      setTypeFilter(active ? null : type);
                    }}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    style={[
                      styles.chip,
                      {
                        backgroundColor: active ? Colors.goldTint : Colors.surfaceLow,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.chipLabel,
                        { color: active ? Colors.primaryDeep : Colors.onSurfaceVariant },
                      ]}
                    >
                      {LIBRARY_ITEM_TYPE_LABELS[type]}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          )}

          {isLoading ? (
            <View style={styles.loading}>
              <ActivityIndicator color={Colors.primary} />
            </View>
          ) : (
            <FlatList
              data={filtered}
              keyExtractor={(item) => item._id}
              contentContainerStyle={[
                styles.list,
                { paddingBottom: insets.bottom + Spacing[6] },
              ]}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item, index }) => (
                <LibraryRow
                  item={item}
                  index={index}
                  // Cast for the same reason lib/notification-links.ts casts:
                  // the typed-routes map is regenerated by the dev server, so
                  // a route added in this change is not in it until Expo next
                  // runs.
                  onPress={() => router.push(`/library-item?id=${item._id}` as Href)}
                />
              )}
              ListEmptyComponent={
                <View style={styles.emptyState}>
                  <Ionicons
                    name={narrowed ? 'search-outline' : 'library-outline'}
                    size={40}
                    color={Colors.outline}
                  />
                  <Text style={[styles.emptyTitle, { color: Colors.onSurfaceVariant }]}>
                    {narrowed ? 'Nothing matches that' : 'The Library is being set up'}
                  </Text>
                  <Text style={[styles.emptySubtitle, { color: Colors.outline }]}>
                    {narrowed
                      ? 'Try a shorter search, or clear the filters.'
                      : 'Books, teachings and free recordings will show up here.'}
                  </Text>
                </View>
              }
            />
          )}
        </>
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
    paddingHorizontal: Spacing[4],
    paddingVertical: Spacing[3],
  },
  backButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { ...{ fontSize: 18, lineHeight: 24 }, fontFamily: FontFamily.displaySemi },

  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[2],
    marginHorizontal: Spacing[5],
    borderBottomWidth: 1,
  },
  searchInput: {
    flex: 1,
    fontFamily: FontFamily.body,
    fontSize: 15,
    paddingVertical: Spacing[3],
  },

  segmentRow: {
    flexDirection: 'row',
    gap: Spacing[2],
    paddingHorizontal: Spacing[5],
    paddingTop: Spacing[4],
  },
  segment: {
    paddingHorizontal: Spacing[4],
    paddingVertical: Spacing[2],
    borderRadius: Radius.full,
  },
  segmentLabel: { fontFamily: FontFamily.bodySemiBold, fontSize: 13 },

  chipRow: {
    flexDirection: 'row',
    gap: Spacing[2],
    paddingHorizontal: Spacing[5],
    paddingTop: Spacing[3],
  },
  chip: {
    paddingHorizontal: Spacing[3],
    paddingVertical: Spacing[2],
    borderRadius: Radius.full,
  },
  chipLabel: { fontFamily: FontFamily.bodyMedium, fontSize: 12.5 },

  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { paddingHorizontal: Spacing[5], paddingTop: Spacing[4], gap: Spacing[3] },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: Radius.lg,
    overflow: 'hidden',
  },
  rowImage: { width: 76, height: 92, justifyContent: 'flex-end', alignItems: 'flex-end' },
  rowFormatBadge: {
    margin: Spacing[1],
    width: 22,
    height: 22,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(12, 33, 84, 0.72)',
  },
  rowContent: { flex: 1, paddingVertical: Spacing[3], paddingHorizontal: Spacing[4], gap: 3 },
  rowTitle: { fontFamily: FontFamily.bodySemiBold, fontSize: 16, lineHeight: 22 },
  rowAuthor: { fontFamily: FontFamily.body, fontSize: 13 },
  rowPrice: { fontFamily: FontFamily.mono, fontSize: 13 },
  rowTags: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing[1], marginTop: 2 },
  rowChevron: { paddingRight: Spacing[3] },

  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing[16],
    gap: Spacing[2],
  },
  emptyTitle: { fontFamily: FontFamily.bodySemiBold, fontSize: 16, textAlign: 'center' },
  emptySubtitle: {
    fontFamily: FontFamily.body,
    fontSize: 13,
    textAlign: 'center',
    paddingHorizontal: Spacing[8],
  },
});
