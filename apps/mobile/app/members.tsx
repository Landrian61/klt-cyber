import { useState, useMemo } from 'react';
import {
  ScrollView, View, Text, TextInput, Pressable, FlatList, StyleSheet,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

import {
  FontFamily, Spacing, Radius, GoldGradient,
} from '@/constants/theme';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { MemberGate } from '@/components/member-gate';

const FILTERS = ['All', 'Elders', 'HODs', 'Ministers', 'Mentorship Complete', 'Youth', 'Men', 'Women', 'Visitors'];

// Placeholder members data
const MEMBERS = [
  { id: '1', name: 'Andrew Luswata', clan: 'Hebron', departments: ['Media', 'IT'], badges: ['member'] },
  { id: '2', name: 'Grace Nambi', clan: 'Bethel', departments: ['Worship'], badges: ['minister'] },
  { id: '3', name: 'Samuel Okello', clan: 'Shiloh', departments: ['Ushering'], badges: ['elder'] },
  { id: '4', name: 'Faith Nakato', clan: 'Hebron', departments: ['Children'], badges: ['hod'] },
  { id: '5', name: 'David Mugisha', clan: 'Bethel', departments: ['Media'], badges: ['member'] },
];

function getInitials(name: string): string {
  return name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase();
}

function MembersScreen() {
  const Colors = useThemeColors();
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState('All');

  const filteredMembers = useMemo(() => {
    return MEMBERS.filter((m) => {
      const matchesSearch = !search || m.name.toLowerCase().includes(search.toLowerCase());
      return matchesSearch;
    });
  }, [search]);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: Colors.surface }]} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Button
          variant="icon"
          onPress={() => router.back()}
          accessibilityLabel="Go back"
          icon={<Ionicons name="arrow-back" size={24} color={Colors.onSurface} />}
        />
        <View style={styles.headerTitle}>
          <Text style={[styles.title, { color: Colors.onSurface }]}>Members</Text>
        </View>
      </View>

      {/* Search bar */}
      <View style={styles.searchContainer}>
        <View style={[styles.searchBar, { backgroundColor: Colors.surfaceLow }]}>
          <Ionicons name="search" size={18} color={Colors.outline} />
          <TextInput
            style={[styles.searchInput, { color: Colors.onSurface }]}
            value={search}
            onChangeText={setSearch}
            placeholder="Search by name, clan or department..."
            placeholderTextColor={Colors.outline}
          />
          {search.length > 0 && (
            <Pressable onPress={() => setSearch('')}>
              <Text style={[styles.cancelText, { color: Colors.primary }]}>Cancel</Text>
            </Pressable>
          )}
        </View>
      </View>

      {/* Filter pills */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterRow}
      >
        {FILTERS.map((filter) => {
          const isActive = activeFilter === filter;
          if (isActive) {
            return (
              <Pressable key={filter} onPress={() => setActiveFilter(filter)}>
                <LinearGradient
                  colors={[...GoldGradient.colors]}
                  start={GoldGradient.start}
                  end={GoldGradient.end}
                  style={styles.filterPill}
                >
                  <Text style={styles.filterTextActive}>{filter}</Text>
                </LinearGradient>
              </Pressable>
            );
          }
          return (
            <Pressable
              key={filter}
              onPress={() => setActiveFilter(filter)}
              style={[styles.filterPillInactive, { backgroundColor: Colors.surfaceLow }]}
            >
              <Text style={[styles.filterTextInactive, { color: Colors.onSurfaceVariant }]}>{filter}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {/* Results count */}
      <View style={styles.resultsCount}>
        <Text style={[styles.resultsText, { color: Colors.outline }]}>{filteredMembers.length} members</Text>
      </View>

      {/* Member list */}
      <FlatList
        data={filteredMembers}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        renderItem={({ item }) => (
          <Pressable style={[styles.memberCard, { backgroundColor: Colors.surfaceLowest }]} accessibilityLabel={item.name}>
            <LinearGradient
              colors={[...GoldGradient.colors]}
              start={GoldGradient.start}
              end={GoldGradient.end}
              style={styles.memberAvatar}
            >
              <Text style={styles.memberInitials}>{getInitials(item.name)}</Text>
            </LinearGradient>
            <View style={styles.memberInfo}>
              <Text style={[styles.memberName, { color: Colors.onSurface }]}>{item.name}</Text>
              <Text style={[styles.memberClan, { color: Colors.onSurfaceVariant }]}>{item.clan}</Text>
              <Text style={[styles.memberDepts, { color: Colors.outline }]}>{item.departments.join(' · ')}</Text>
            </View>
            <View style={styles.memberBadges}>
              {item.badges.map((b) => (
                <Badge key={b} label={b.charAt(0).toUpperCase() + b.slice(1)} variant={b as any} />
              ))}
            </View>
          </Pressable>
        )}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Ionicons name="search" size={40} color={Colors.outline} />
            <Text style={[styles.emptyTitle, { color: Colors.onSurfaceVariant }]}>No members found</Text>
            <Text style={[styles.emptySubtitle, { color: Colors.outline }]}>Adjust your search or filter.</Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}

// Member-only directory: visitors are nudged to complete their profile first.
export default function MembersRoute() {
  return (
    <MemberGate featureLabel="the member directory">
      <MembersScreen />
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
  },
  headerTitle: {
    paddingLeft: Spacing[4],
  },
  title: {
    fontFamily: FontFamily.display,
    fontSize: 24,
    lineHeight: 28.8,
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
  cancelText: {
    fontFamily: FontFamily.bodyMedium,
    fontSize: 14,
  },
  filterRow: {
    paddingLeft: Spacing[5],
    paddingRight: Spacing[3],
    gap: Spacing[2],
    marginTop: Spacing[3],
  },
  filterPill: {
    height: 32,
    borderRadius: Radius.full,
    paddingHorizontal: Spacing[4],
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterPillInactive: {
    height: 32,
    borderRadius: Radius.full,
    paddingHorizontal: Spacing[4],
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterTextActive: {
    fontFamily: FontFamily.bodyMedium,
    fontSize: 12,
    color: '#FFFFFF',
  },
  filterTextInactive: {
    fontFamily: FontFamily.body,
    fontSize: 12,
  },
  resultsCount: {
    paddingHorizontal: Spacing[5],
    marginTop: Spacing[3],
  },
  resultsText: {
    fontFamily: FontFamily.body,
    fontSize: 11,
    lineHeight: 15.4,
  },
  list: {
    paddingHorizontal: Spacing[5],
    paddingTop: Spacing[2],
    gap: Spacing[3],
    paddingBottom: Spacing[4],
  },
  memberCard: {
    borderRadius: Radius.lg,
    padding: Spacing[3],
    paddingHorizontal: Spacing[4],
    flexDirection: 'row',
    alignItems: 'center',
  },
  memberAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  memberInitials: {
    fontFamily: FontFamily.bodyBold,
    fontSize: 14,
    color: '#FFFFFF',
  },
  memberInfo: {
    flex: 1,
    marginLeft: Spacing[3],
  },
  memberName: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 14,
    lineHeight: 22.4,
  },
  memberClan: {
    fontFamily: FontFamily.body,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 3,
  },
  memberDepts: {
    fontFamily: FontFamily.body,
    fontSize: 11,
    lineHeight: 15.4,
    marginTop: 2,
  },
  memberBadges: {
    gap: Spacing[1],
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
  },
});
