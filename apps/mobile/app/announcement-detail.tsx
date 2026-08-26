import { View, Text, Pressable, ScrollView, StyleSheet, Linking, ActivityIndicator } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useQuery } from 'convex/react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInUp } from 'react-native-reanimated';

import { FontFamily, Spacing } from '@/constants/theme';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { api } from '@/lib/api';
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
  const { id } = useLocalSearchParams<{ id: string }>();
  const announcements = useQuery(api.announcements.listActiveAnnouncements);
  const isLoading = announcements === undefined;
  const announcement = announcements?.find((a) => a._id === id);

  if (isLoading) {
    return (
      <View style={[styles.container, { backgroundColor: Colors.surface, paddingTop: insets.top }]}>
        <View style={styles.fallback}>
          <ActivityIndicator color={Colors.primary} />
        </View>
      </View>
    );
  }

  if (!announcement) {
    return (
      <View style={[styles.container, { backgroundColor: Colors.surface, paddingTop: insets.top }]}>
        <View style={styles.fallback}>
          <Text style={[styles.fallbackText, { color: Colors.onSurfaceVariant }]}>Announcement not found</Text>
          <Button label="Go back" variant="ghost" onPress={() => router.back()} />
        </View>
      </View>
    );
  }

  const badge = PRIORITY_BADGE[announcement.priority ?? 'normal'];

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
        {/* Badge + date */}
        <Animated.View entering={FadeInUp.duration(300).delay(100)} style={styles.metaRow}>
          {badge && <Badge label={badge.label} variant={badge.variant} />}
          {announcement.category && (
            <Text style={[styles.category, { color: Colors.outline }]}>{announcement.category}</Text>
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
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[3],
    marginBottom: Spacing[3],
  },
  category: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 11,
    lineHeight: 15.4,
    textTransform: 'capitalize',
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
