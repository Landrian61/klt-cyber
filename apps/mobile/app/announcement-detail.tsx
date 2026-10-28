import { View, Text, Pressable, ScrollView, StyleSheet, Linking, ActivityIndicator } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useQuery } from 'convex/react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import Animated, { FadeInUp } from 'react-native-reanimated';

import { announcementCategoryChip } from '@klt-cyber/shared';

import { FontFamily, Spacing, Radius } from '@/constants/theme';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { api, type Id } from '@/lib/api';
import { formatFullDate } from '@/lib/content-format';

const PRIORITY_BADGE: Record<string, { label: string; variant: 'priority' | 'member' | 'pending' }> = {
  high: { label: 'Priority', variant: 'priority' },
  normal: { label: 'Update', variant: 'member' },
  low: { label: 'Notice', variant: 'pending' },
};

export default function AnnouncementDetailScreen() {
  const Colors = useThemeColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id?: string }>();
  // A direct read, not a lookup in the active feed: a notice tapped after the
  // announcement's window has closed must still open it (spec 0013, AC-12).
  const announcement = useQuery(
    api.announcements.getAnnouncement,
    id ? { announcementId: id as Id<'announcements'> } : 'skip',
  );
  // Without the `id` check a skipped query never resolves and this spins
  // forever, the same trap item-detail.tsx guards against.
  const isLoading = Boolean(id) && announcement === undefined;

  if (isLoading) {
    return (
      <View style={[styles.container, { backgroundColor: Colors.surface, paddingTop: insets.top }]}>
        <View style={styles.fallback}>
          <ActivityIndicator color={Colors.primary} />
        </View>
      </View>
    );
  }

  // Disabled, archived, deleted or a bad id all read the same: naming the
  // difference would tell the reader about content they cannot see.
  if (!announcement) {
    return (
      <View style={[styles.container, { backgroundColor: Colors.surface, paddingTop: insets.top }]}>
        <View style={styles.fallback}>
          <Text style={[styles.fallbackText, { color: Colors.onSurfaceVariant }]}>
            This announcement is no longer available
          </Text>
          <Button label="Go back" variant="ghost" onPress={() => router.back()} />
        </View>
      </View>
    );
  }

  const hasEnded = announcement.endDate < Date.now();
  const badge = PRIORITY_BADGE[announcement.priority ?? 'normal'];
  // Same shared rule the Updates list uses, so a member never sees one wording
  // on the card and another on the detail (spec 0010, AC-1).
  const categoryChip = announcementCategoryChip(announcement.category);

  return (
    <View style={[styles.container, { backgroundColor: Colors.surface, paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.backButton} accessibilityLabel="Go back">
          <Ionicons name="arrow-back" size={24} color={Colors.onSurface} />
        </Pressable>
        <View style={styles.backButton} />
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + Spacing[6] }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Ended, but still readable (AC-12). Tonal wash, no border. */}
        {hasEnded && (
          <Animated.View
            entering={FadeInUp.duration(300)}
            style={[styles.endedNote, { backgroundColor: Colors.surfaceLow }]}
            accessibilityRole="summary"
          >
            <Ionicons name="time-outline" size={20} color={Colors.outline} />
            <Text style={[styles.endedText, { color: Colors.onSurfaceVariant }]}>
              This announcement has ended
            </Text>
          </Animated.View>
        )}

        {/* Cover image, if the announcement has one */}
        {announcement.coverImageUrl && (
          <Animated.View entering={FadeInUp.duration(300)}>
            <Image source={{ uri: announcement.coverImageUrl }} style={styles.cover} contentFit="cover" />
          </Animated.View>
        )}

        {/* Badge + date */}
        <Animated.View entering={FadeInUp.duration(300).delay(100)} style={styles.metaRow}>
          {badge && <Badge label={badge.label} variant={badge.variant} />}
          {categoryChip && (
            <Badge
              label={categoryChip.label}
              variant={categoryChip.known ? 'category' : 'categoryUnknown'}
            />
          )}
          <Text style={[styles.date, { color: Colors.outline }]}>{formatFullDate(announcement.startDate)}</Text>
        </Animated.View>

        {/* Title */}
        <Animated.Text entering={FadeInUp.duration(300).delay(180)} style={[styles.title, { color: Colors.onSurface }]}>
          {announcement.title}
        </Animated.Text>

        {/* Body */}
        <Animated.Text entering={FadeInUp.duration(300).delay(260)} style={[styles.body, { color: Colors.onSurfaceVariant }]}>
          {announcement.body}
        </Animated.Text>

        {/* Links (added by the admin — CTAs to more info, forms, external pages) */}
        {announcement.links && announcement.links.length > 0 && (
          <Animated.View entering={FadeInUp.duration(300).delay(340)} style={styles.linkSection}>
            {announcement.links.map((link) => (
              <Button
                key={`${link.label}-${link.url}`}
                label={link.label}
                variant="ghost"
                fullWidth
                onPress={() => Linking.openURL(link.url).catch(() => {})}
              />
            ))}
          </Animated.View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  fallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing[4],
  },
  fallbackText: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 16,
    lineHeight: 24,
    textAlign: 'center',
  },
  endedNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[3],
    borderRadius: Radius.lg,
    padding: Spacing[4],
    marginBottom: Spacing[4],
  },
  endedText: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 15,
    lineHeight: 22,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing[5],
    paddingVertical: Spacing[2],
  },
  backButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    paddingHorizontal: Spacing[5],
  },
  cover: {
    width: '100%',
    height: 220,
    borderRadius: Radius.lg,
    marginBottom: Spacing[4],
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[3],
    marginBottom: Spacing[3],
  },
  date: {
    fontFamily: FontFamily.body,
    fontSize: 11,
    lineHeight: 15.4,
  },
  title: {
    fontFamily: FontFamily.display,
    fontSize: 24,
    lineHeight: 30,
    marginBottom: Spacing[4],
  },
  body: {
    fontFamily: FontFamily.body,
    fontSize: 15,
    lineHeight: 24,
  },
  linkSection: {
    marginTop: Spacing[6],
    gap: Spacing[3],
  },
});
