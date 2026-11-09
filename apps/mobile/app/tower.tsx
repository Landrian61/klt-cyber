import { useState } from 'react';
import {
  View, Text, Pressable, StyleSheet, SectionList, FlatList, ActivityIndicator,
} from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { useQuery } from 'convex/react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Animated, { FadeInUp } from 'react-native-reanimated';
import {
  RE_OPEN_STATE_LABELS,
  formatSpacePrice,
  formatSpaceSize,
  isFacilityOpenNow,
} from '@klt-cyber/shared';

import {
  FontFamily, Spacing, Radius, AmbientShadow,
} from '@/constants/theme';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { useBuildingClock } from '@/hooks/use-building-clock';
import { Cover } from '@/components/ui/cover';
import { ErrorState } from '@/components/ui/error-state';
import { OpenPill } from '@/components/ui/open-pill';
import { api } from '@/lib/api';

/**
 * The Tower of Faith (spec 0018, RE1-06, RE2-04, M7-01 to M7-03).
 *
 * Open to any signed in user, visitor or member: the Tower is the building the
 * congregation walks through, and what this screen shows is public church
 * information. There is no member gate here, deliberately.
 *
 * Two tabs, because they answer two different questions — "where is the
 * dentist and is it open" and "what can I rent" — and folding them into one
 * list would serve neither.
 *
 * The facilities tab is ONE scroll grouped by floor with sticky headers, not a
 * floor picker: a member looking for something does not know which floor it is
 * on, which is the whole reason they are looking.
 */

type Tab = 'facilities' | 'spaces';

const TABS: { key: Tab; label: string }[] = [
  { key: 'facilities', label: 'Facilities' },
  { key: 'spaces', label: 'Spaces to let' },
];

export default function TowerScreen() {
  const Colors = useThemeColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<Tab>('facilities');

  return (
    <View
      style={[
        styles.container,
        { paddingTop: insets.top, backgroundColor: Colors.surface },
      ]}
    >
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
        <Text style={[styles.headerTitle, { color: Colors.onSurface }]}>
          Tower of Faith
        </Text>
        <View style={styles.backButton} />
      </View>

      <View
        style={styles.tabs}
        accessibilityRole="tablist"
      >
        {TABS.map((entry) => {
          const selected = entry.key === tab;
          return (
            <Pressable
              key={entry.key}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setTab(entry.key);
              }}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              accessibilityLabel={entry.label}
              style={[
                styles.tab,
                {
                  backgroundColor: selected
                    ? Colors.primaryContainer
                    : Colors.surfaceLow,
                },
              ]}
            >
              <Text
                style={[
                  styles.tabLabel,
                  { color: selected ? Colors.primary : Colors.onSurfaceVariant },
                ]}
              >
                {entry.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {tab === 'facilities' ? <FacilitiesTab /> : <SpacesTab />}
    </View>
  );
}

// -- Facilities -----------------------------------------------------------

function FacilitiesTab() {
  const Colors = useThemeColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const groups = useQuery(api.facilities.listTowerFacilities, {});
  // Advances once a minute while focused, so a label cannot sit stale through
  // a closing time (AC-22).
  const now = useBuildingClock();

  if (groups === undefined) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={Colors.primary} />
      </View>
    );
  }

  if (groups === null) {
    return (
      <View style={styles.stateWrap}>
        <ErrorState />
      </View>
    );
  }

  if (groups.length === 0) {
    return (
      <EmptyTab
        icon="business-outline"
        title="The Tower is being prepared"
        message="Our facilities are being listed floor by floor. Check back soon and you will find them here, with their hours and a number to call."
      />
    );
  }

  const sections = groups.map((group) => ({
    title: group.floorName,
    data: group.facilities,
  }));

  return (
    <SectionList
      sections={sections}
      keyExtractor={(item) => item._id}
      stickySectionHeadersEnabled
      showsVerticalScrollIndicator={false}
      contentContainerStyle={[
        styles.listContent,
        { paddingBottom: insets.bottom + Spacing[8] },
      ]}
      renderSectionHeader={({ section }) => (
        <View
          style={[styles.floorHeader, { backgroundColor: Colors.surface }]}
        >
          <Text style={[styles.floorName, { color: Colors.onSurfaceVariant }]}>
            {section.title}
          </Text>
        </View>
      )}
      renderItem={({ item, index }) => {
        const state = isFacilityOpenNow(item.openingHours, now);
        return (
          <Animated.View entering={FadeInUp.duration(280).delay(index * 40)}>
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                // Cast as `library.tsx` does: Expo Router's typed routes are
                // generated by the dev server, so a route added in this change is
                // not in the union until that regenerates.
                router.push(`/facility-detail?id=${item._id}` as Href);
              }}
              accessibilityRole="button"
              accessibilityLabel={`${item.name}, ${RE_OPEN_STATE_LABELS[state]}`}
              style={[
                styles.card,
                AmbientShadow,
                { backgroundColor: Colors.surfaceLowest },
              ]}
            >
              <Cover
                uri={item.coverUrl}
                index={index}
                imageRadius={Radius.lg}
                style={styles.cardCover}
              />
              <View style={styles.cardBody}>
                <Text
                  numberOfLines={1}
                  style={[styles.cardTitle, { color: Colors.onSurface }]}
                >
                  {item.name}
                </Text>
                {item.tagline ? (
                  <Text
                    numberOfLines={2}
                    style={[styles.cardTagline, { color: Colors.onSurfaceVariant }]}
                  >
                    {item.tagline}
                  </Text>
                ) : null}
                <OpenPill state={state} />
              </View>
            </Pressable>
          </Animated.View>
        );
      }}
    />
  );
}

// -- Spaces to let --------------------------------------------------------

function SpacesTab() {
  const Colors = useThemeColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const spaces = useQuery(api.realEstate.listSpacesToLet, {});

  if (spaces === undefined) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={Colors.primary} />
      </View>
    );
  }

  if (spaces === null) {
    return (
      <View style={styles.stateWrap}>
        <ErrorState />
      </View>
    );
  }

  if (spaces.length === 0) {
    return (
      <EmptyTab
        icon="key-outline"
        title="No spaces available right now"
        message="When a shop or office in the Tower becomes free, it will be listed here with its size, photos and a number to reach the letting desk."
      />
    );
  }

  return (
    <FlatList
      data={spaces}
      keyExtractor={(item) => item._id}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={[
        styles.listContent,
        { paddingTop: Spacing[3], paddingBottom: insets.bottom + Spacing[8] },
      ]}
      renderItem={({ item, index }) => (
        <Animated.View entering={FadeInUp.duration(280).delay(index * 40)}>
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.push(`/space-detail?id=${item._id}` as Href);
            }}
            accessibilityRole="button"
            accessibilityLabel={`${item.title}, ${formatSpacePrice(item.priceUgxPerMonth)}`}
            style={[
              styles.card,
              AmbientShadow,
              { backgroundColor: Colors.surfaceLowest },
            ]}
          >
            <Cover
              uri={item.coverUrl}
              index={index}
              imageRadius={Radius.lg}
              style={styles.cardCover}
            />
            <View style={styles.cardBody}>
              <Text
                numberOfLines={1}
                style={[styles.cardTitle, { color: Colors.onSurface }]}
              >
                {item.title}
              </Text>
              <Text
                numberOfLines={1}
                style={[styles.cardTagline, { color: Colors.onSurfaceVariant }]}
              >
                {item.floorName}
                {item.sizeSqm !== undefined
                  ? ` · ${formatSpaceSize(item.sizeSqm)}`
                  : ''}
              </Text>
              <View style={styles.cardMeta}>
                {/* Mono, because this is a figure. */}
                <Text style={[styles.price, { color: Colors.primary }]}>
                  {formatSpacePrice(item.priceUgxPerMonth)}
                </Text>
                {item.status === 'reserved' ? (
                  <View
                    style={[
                      styles.pill,
                      { backgroundColor: Colors.surfaceContainer },
                    ]}
                  >
                    <Text
                      style={[styles.pillText, { color: Colors.onSurfaceVariant }]}
                    >
                      Reserved
                    </Text>
                  </View>
                ) : null}
              </View>
            </View>
          </Pressable>
        </Animated.View>
      )}
    />
  );
}

// -- Shared bits ----------------------------------------------------------

function EmptyTab({
  icon,
  title,
  message,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  message: string;
}) {
  const Colors = useThemeColors();
  return (
    <View style={styles.stateWrap}>
      <Ionicons name={icon} size={40} color={Colors.outline} />
      <Text style={[styles.emptyTitle, { color: Colors.onSurface }]}>
        {title}
      </Text>
      <Text style={[styles.emptyBody, { color: Colors.onSurfaceVariant }]}>
        {message}
      </Text>
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
  headerTitle: { fontSize: 18, lineHeight: 24, fontFamily: FontFamily.displaySemi },

  tabs: {
    flexDirection: 'row',
    gap: Spacing[2],
    paddingHorizontal: Spacing[5],
    paddingBottom: Spacing[3],
  },
  tab: {
    flex: 1,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.full,
    paddingHorizontal: Spacing[4],
  },
  tabLabel: { fontSize: 14, lineHeight: 20, fontFamily: FontFamily.bodySemiBold },

  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  stateWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing[3],
    paddingHorizontal: Spacing[8],
  },
  emptyTitle: { fontSize: 18, lineHeight: 24, fontFamily: FontFamily.displaySemi, textAlign: 'center' },
  emptyBody: { fontSize: 14, lineHeight: 21, fontFamily: FontFamily.body, textAlign: 'center' },

  listContent: { paddingHorizontal: Spacing[5], gap: Spacing[3] },

  floorHeader: {
    paddingTop: Spacing[3],
    paddingBottom: Spacing[2],
  },
  floorName: {
    fontSize: 12,
    lineHeight: 16,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    fontFamily: FontFamily.bodySemiBold,
  },

  card: {
    flexDirection: 'row',
    gap: Spacing[3],
    padding: Spacing[3],
    borderRadius: Radius.xl,
    alignItems: 'center',
  },
  cardCover: { width: 72, height: 72, borderRadius: Radius.lg, overflow: 'hidden' },
  cardBody: { flex: 1, gap: Spacing[1] },
  cardTitle: { fontSize: 16, lineHeight: 22, fontFamily: FontFamily.bodySemiBold },
  cardTagline: { fontSize: 13, lineHeight: 19, fontFamily: FontFamily.body },
  cardMeta: { flexDirection: 'row', alignItems: 'center', gap: Spacing[2] },
  price: { fontSize: 13, lineHeight: 18, fontFamily: FontFamily.monoBold },

  pill: {
    alignSelf: 'flex-start',
    paddingHorizontal: Spacing[2],
    paddingVertical: 2,
    borderRadius: Radius.full,
  },
  pillText: { fontSize: 11, lineHeight: 16, fontFamily: FontFamily.bodySemiBold },
});
