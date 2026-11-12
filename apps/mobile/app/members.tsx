import { useCallback, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useQuery } from 'convex/react';
import * as Haptics from 'expo-haptics';
import Animated, { FadeIn, FadeInUp, useReducedMotion } from 'react-native-reanimated';

import { DIRECTORY_COPY, matchesDirectorySearch } from '@klt-cyber/shared';

import { api, type Id } from '@/lib/api';
import { Sentry } from '@/lib/sentry';
import { FontFamily, GoldGradient, Radius, ShadowE1, Spacing } from '@/constants/theme';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { useIsOffline } from '@/hooks/use-is-offline';
import { Button } from '@/components/ui/button';
import { OfflineBanner } from '@/components/ui/offline-banner';
import { SelectList } from '@/components/ui/select-list';
import { MemberGate } from '@/components/member-gate';
import { MemberRow, type DirectoryListRow } from '@/components/directory/member-row';
import { DirectorySheet } from '@/components/directory/directory-sheet';
import { ShareConsentSheet } from '@/components/directory/share-consent-sheet';
import { DirectoryError } from '@/components/directory/directory-error';

// The member directory (spec 0022, SRS M5-01 to M5-05). One reactive list
// query; search and the two filters run in memory on the phone. What each row
// may show is decided on the server (`convex/lib/directory.ts`), never here.

type Picker = 'department' | 'clan' | null;

/** One shared empty list, so a row with no areas keeps a stable prop. */
const NO_AREAS: string[] = [];

function FilterChip({
  label,
  value,
  onOpen,
  onClear,
}: {
  label: string;
  value?: string;
  onOpen: () => void;
  onClear: () => void;
}) {
  const Colors = useThemeColors();
  const tap = (fn: () => void) => () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    fn();
  };

  if (!value) {
    return (
      <Pressable
        onPress={tap(onOpen)}
        accessibilityRole="button"
        accessibilityLabel={`Filter by ${label}`}
        style={[styles.chip, { backgroundColor: Colors.surfaceLow }]}
      >
        <Text style={[styles.chipText, { color: Colors.onSurfaceVariant }]}>{label}</Text>
        <Ionicons name="chevron-down" size={14} color={Colors.onSurfaceVariant} />
      </Pressable>
    );
  }
  // The label and the clear button are SIBLINGS inside the gradient, not one
  // nested in the other: a nested button is folded into its parent by screen
  // readers, and the clear action could never be focused on its own.
  return (
    <LinearGradient
      colors={[...GoldGradient.colors]}
      start={GoldGradient.start}
      end={GoldGradient.end}
      style={[styles.chip, styles.chipActive]}
    >
      <Pressable
        onPress={tap(onOpen)}
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${value}. Change`}
        style={styles.chipLabel}
      >
        <Text style={[styles.chipTextActive, { color: Colors.onPrimary }]} numberOfLines={1}>
          {value}
        </Text>
      </Pressable>
      <Pressable
        onPress={tap(onClear)}
        hitSlop={12}
        accessibilityRole="button"
        accessibilityLabel={`Clear ${label} filter`}
      >
        <Ionicons name="close-circle" size={16} color={Colors.onPrimary} />
      </Pressable>
    </LinearGradient>
  );
}

function LoadingRows() {
  const Colors = useThemeColors();
  return (
    <View style={styles.list} accessibilityLabel="Loading members" accessible>
      {[0, 1, 2, 3, 4].map((i) => (
        <View key={i} style={[styles.skeleton, { backgroundColor: Colors.surfaceLow, opacity: 1 - i * 0.15 }]} />
      ))}
    </View>
  );
}

function MembersScreen() {
  const Colors = useThemeColors();
  const router = useRouter();
  const reduceMotion = useReducedMotion();
  const isOffline = useIsOffline();
  const directory = useQuery(api.directory.list, {});

  const [search, setSearch] = useState('');
  const [departmentId, setDepartmentId] = useState<string | undefined>();
  const [clanId, setClanId] = useState<string | undefined>();
  const [picker, setPicker] = useState<Picker>(null);
  const [consentOpen, setConsentOpen] = useState(false);

  const departmentNames = useMemo(
    () => new Map((directory?.departments ?? []).map((d) => [d.id as string, d.name])),
    [directory?.departments],
  );
  const clanNames = useMemo(
    () => new Map((directory?.clans ?? []).map((c) => [c.id as string, c.name])),
    [directory?.clans],
  );

  // A chosen filter only applies while its option still exists. The list is
  // reactive, so a department or clan can vanish under an open screen; the
  // chip and the filter read the same lookup, so they can never disagree.
  const departmentLabel = departmentId ? departmentNames.get(departmentId) : undefined;
  const clanLabel = clanId ? clanNames.get(clanId) : undefined;
  const activeDepartmentId = departmentLabel ? departmentId : undefined;
  const activeClanId = clanLabel ? clanId : undefined;

  // Each row's area names, worked out once per list response, so a row's
  // `areas` prop keeps its identity across keystrokes and the memoized
  // MemberRow can skip re-rendering.
  const areasByUser = useMemo(() => {
    const map = new Map<string, string[]>();
    if (!directory) return map;
    for (const row of [directory.self, ...directory.rows]) {
      map.set(
        row.userId,
        row.departmentIds.map((id) => departmentNames.get(id)).filter((n): n is string => !!n),
      );
    }
    return map;
  }, [directory, departmentNames]);

  const filtered = useMemo(() => {
    if (!directory) return [];
    return directory.rows.filter(
      (row) =>
        (!activeDepartmentId || row.departmentIds.includes(activeDepartmentId as Id<'departments'>)) &&
        (!activeClanId || row.clan?.id === activeClanId) &&
        matchesDirectorySearch(row, search),
    );
  }, [directory, activeDepartmentId, activeClanId, search]);

  const narrowed = search.trim().length > 0 || !!activeDepartmentId || !!activeClanId;
  const clearAll = useCallback(() => {
    setSearch('');
    setDepartmentId(undefined);
    setClanId(undefined);
  }, []);

  const open = useCallback(
    (userId: Id<'users'>) => router.push(`/member-detail?userId=${userId}` as Href),
    [router],
  );
  const areasOf = useCallback(
    (row: DirectoryListRow) => areasByUser.get(row.userId) ?? NO_AREAS,
    [areasByUser],
  );

  const header = (
    <View style={styles.header}>
      <Button
        variant="icon"
        onPress={() => router.back()}
        accessibilityLabel="Go back"
        icon={<Ionicons name="arrow-back" size={24} color={Colors.onSurface} />}
      />
      <Text style={[styles.title, { color: Colors.onSurface }]} accessibilityRole="header">
        {DIRECTORY_COPY.title}
      </Text>
    </View>
  );

  if (directory === undefined) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: Colors.surface }]} edges={['top']}>
        {header}
        {isOffline && (
          <View style={styles.offline}>
            <OfflineBanner />
          </View>
        )}
        <LoadingRows />
      </SafeAreaView>
    );
  }

  const viewerSharing = directory.viewerSharing;

  const listHeader = (
    <View style={styles.listHeader}>
      {!viewerSharing && (
        <Animated.View
          entering={reduceMotion ? undefined : FadeIn.duration(300)}
          style={[styles.banner, { backgroundColor: Colors.tertiaryLight }]}
        >
          <View style={styles.bannerText}>
            <Ionicons name="lock-closed-outline" size={20} color={Colors.tertiaryDeep} />
            <View style={styles.bannerCopy}>
              <Text style={[styles.bannerTitle, { color: Colors.tertiaryDeep }]}>
                {DIRECTORY_COPY.privateBanner.title}
              </Text>
              <Text style={[styles.bannerBody, { color: Colors.onSurfaceVariant }]}>
                {DIRECTORY_COPY.privateBanner.body}
              </Text>
            </View>
          </View>
          <Button
            label={DIRECTORY_COPY.privateBanner.action}
            variant="primary"
            fullWidth
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setConsentOpen(true);
            }}
          />
        </Animated.View>
      )}
      <MemberRow row={directory.self} areas={areasOf(directory.self)} isSelf onOpen={open} />
      <Text style={[styles.count, { color: Colors.outline }]} accessibilityLiveRegion="polite">
        {DIRECTORY_COPY.resultsCount(filtered.length)}
      </Text>
    </View>
  );

  const empty =
    directory.rows.length === 0 ? (
      <View style={styles.empty}>
        <Ionicons name="people-outline" size={40} color={Colors.outline} />
        <Text style={[styles.emptyTitle, { color: Colors.onSurface }]}>{DIRECTORY_COPY.emptyDirectory.title}</Text>
        <Text style={[styles.emptyBody, { color: Colors.outline }]}>{DIRECTORY_COPY.emptyDirectory.body}</Text>
      </View>
    ) : (
      <View style={styles.empty}>
        <Ionicons name="search" size={40} color={Colors.outline} />
        <Text style={[styles.emptyTitle, { color: Colors.onSurface }]}>{DIRECTORY_COPY.empty.title}</Text>
        <Text style={[styles.emptyBody, { color: Colors.outline }]}>{DIRECTORY_COPY.empty.body}</Text>
        {narrowed && (
          <View style={styles.emptyAction}>
            <Button label={DIRECTORY_COPY.empty.action} variant="ghost" fullWidth={false} onPress={clearAll} />
          </View>
        )}
      </View>
    );

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: Colors.surface }]} edges={['top']}>
      {header}
      {isOffline && (
        <View style={styles.offline}>
          <OfflineBanner />
        </View>
      )}

      <View style={styles.searchContainer}>
        <View style={[styles.searchBar, { backgroundColor: Colors.surfaceLow }]}>
          <Ionicons name="search" size={18} color={Colors.outline} />
          <TextInput
            style={[styles.searchInput, { color: Colors.onSurface }]}
            value={search}
            onChangeText={setSearch}
            placeholder={
              viewerSharing ? DIRECTORY_COPY.searchPlaceholderSharing : DIRECTORY_COPY.searchPlaceholder
            }
            placeholderTextColor={Colors.outline}
            accessibilityLabel="Search members"
            autoCorrect={false}
            returnKeyType="search"
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
      </View>

      <View style={styles.filterRow}>
        <FilterChip
          label={DIRECTORY_COPY.filters.department}
          value={departmentLabel}
          onOpen={() => setPicker('department')}
          onClear={() => setDepartmentId(undefined)}
        />
        <FilterChip
          label={DIRECTORY_COPY.filters.clan}
          value={clanLabel}
          onOpen={() => setPicker('clan')}
          onClear={() => setClanId(undefined)}
        />
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(item) => item.userId}
        contentContainerStyle={styles.list}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={listHeader}
        ListEmptyComponent={empty}
        renderItem={({ item, index }) => (
          <Animated.View
            entering={reduceMotion ? undefined : FadeInUp.duration(300).delay(Math.min(index, 8) * 40)}
          >
            <MemberRow row={item} areas={areasOf(item)} onOpen={open} />
          </Animated.View>
        )}
      />

      <DirectorySheet
        visible={picker !== null}
        title={picker === 'clan' ? DIRECTORY_COPY.filters.clan : DIRECTORY_COPY.filters.department}
        onDismiss={() => setPicker(null)}
      >
        <SelectList
          options={(picker === 'clan' ? directory.clans : directory.departments).map((o) => ({
            id: o.id,
            label: o.name,
          }))}
          selectedId={picker === 'clan' ? clanId : departmentId}
          onSelect={(id) => {
            if (picker === 'clan') setClanId(id);
            else setDepartmentId(id);
            setPicker(null);
          }}
        />
      </DirectorySheet>

      <ShareConsentSheet visible={consentOpen} onClose={() => setConsentOpen(false)} />
    </SafeAreaView>
  );
}

function MembersWithBoundary() {
  const [attempt, setAttempt] = useState(0);
  return (
    <Sentry.ErrorBoundary
      key={attempt}
      fallback={({ error }) => <DirectoryError error={error} retry={() => setAttempt((a) => a + 1)} />}
    >
      <MembersScreen />
    </Sentry.ErrorBoundary>
  );
}

// Member only directory: visitors are nudged to complete their profile first (M5-05).
export default function MembersRoute() {
  return (
    <MemberGate featureLabel="the member directory">
      <MembersWithBoundary />
    </MemberGate>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing[2],
    gap: Spacing[2],
  },
  title: {
    fontFamily: FontFamily.display,
    fontSize: 24,
    lineHeight: 28.8,
  },
  offline: {
    paddingHorizontal: Spacing[5],
    marginTop: Spacing[2],
  },
  searchContainer: {
    paddingHorizontal: Spacing[5],
    marginTop: Spacing[4],
  },
  searchBar: {
    height: 46,
    borderRadius: Radius.full,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing[4],
    gap: Spacing[2],
  },
  searchInput: {
    flex: 1,
    fontFamily: FontFamily.body,
    fontSize: 14,
  },
  filterRow: {
    flexDirection: 'row',
    paddingHorizontal: Spacing[5],
    gap: Spacing[2],
    marginTop: Spacing[3],
  },
  chip: {
    height: 36,
    borderRadius: Radius.full,
    paddingHorizontal: Spacing[4],
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[1],
  },
  chipActive: {
    maxWidth: '55%',
    paddingRight: Spacing[3],
    gap: Spacing[2],
  },
  chipLabel: {
    flexShrink: 1,
    justifyContent: 'center',
    minHeight: 36,
  },
  chipText: {
    fontFamily: FontFamily.bodyMedium,
    fontSize: 13,
  },
  chipTextActive: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 13,
    flexShrink: 1,
  },
  list: {
    paddingHorizontal: Spacing[5],
    paddingTop: Spacing[4],
    paddingBottom: Spacing[10],
    gap: Spacing[3],
  },
  listHeader: {
    gap: Spacing[3],
  },
  banner: {
    borderRadius: Radius.lg,
    padding: Spacing[4],
    gap: Spacing[4],
    ...ShadowE1,
  },
  bannerText: {
    flexDirection: 'row',
    gap: Spacing[3],
  },
  bannerCopy: {
    flex: 1,
  },
  bannerTitle: {
    fontFamily: FontFamily.bodyBold,
    fontSize: 15,
    lineHeight: 22,
  },
  bannerBody: {
    fontFamily: FontFamily.body,
    fontSize: 13,
    lineHeight: 20,
    marginTop: 2,
  },
  count: {
    fontFamily: FontFamily.bodyMedium,
    fontSize: 12,
    marginTop: Spacing[2],
  },
  skeleton: {
    height: 72,
    borderRadius: Radius.lg,
  },
  empty: {
    alignItems: 'center',
    paddingVertical: Spacing[10],
    paddingHorizontal: Spacing[6],
  },
  emptyTitle: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 16,
    lineHeight: 24,
    marginTop: Spacing[3],
  },
  emptyBody: {
    fontFamily: FontFamily.body,
    fontSize: 13,
    lineHeight: 20,
    marginTop: Spacing[1],
    textAlign: 'center',
  },
  emptyAction: {
    marginTop: Spacing[4],
  },
});
