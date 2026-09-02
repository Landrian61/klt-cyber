import { useState } from 'react';
import { View, Text, FlatList, Pressable, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery } from 'convex/react';
import * as Haptics from 'expo-haptics';

import { FontFamily, Spacing, Radius } from '@/constants/theme';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { Button } from '@/components/ui/button';
import { api, type Doc } from '@/lib/api';
import { formatRelativeTime } from '@/lib/content-format';
import { resolveDeepLinkHref } from '@/lib/notification-links';

type NotificationItem = Doc<'notifications'> & { read: boolean };

export default function NotificationsScreen() {
  const Colors = useThemeColors();
  const router = useRouter();
  const [filter, setFilter] = useState<'all' | 'unread'>('all');

  const notifications = useQuery(api.notifications.listMyNotifications);
  const markRead = useMutation(api.notifications.markNotificationRead);
  const markAllRead = useMutation(api.notifications.markAllNotificationsRead);
  const dismissNotification = useMutation(api.notifications.dismissNotification);

  const isLoading = notifications === undefined;
  const items: NotificationItem[] = notifications ?? [];

  // Keyed by `deepLink.type`, not a fixed enum — schema.ts's `deepLink.type`
  // is a free-form string, so an unrecognized/future type falls back to
  // DEFAULT_TYPE_STYLE rather than throwing.
  const TYPE_STYLE_BY_DEEPLINK: Record<string, { bg: string; iconColor: string; icon: keyof typeof Ionicons.glyphMap }> = {
    announcement: { bg: Colors.primaryLight, iconColor: Colors.primary, icon: 'megaphone-outline' },
    event: { bg: Colors.primaryLight, iconColor: Colors.primary, icon: 'calendar-outline' },
    program: { bg: Colors.primaryLight, iconColor: Colors.primary, icon: 'calendar-outline' },
  };
  const DEFAULT_TYPE_STYLE = { bg: Colors.surfaceLow, iconColor: Colors.outline, icon: 'notifications-outline' as const };

  const filtered = filter === 'unread' ? items.filter((n) => !n.read) : items;
  const hasUnread = items.some((n) => !n.read);

  const handlePress = (item: NotificationItem) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (!item.read) markRead({ notificationId: item._id }).catch(() => {});
    // Falls back to Home rather than doing nothing when the type has no
    // mobile screen yet — see resolveDeepLinkHref's default case.
    router.push(resolveDeepLinkHref(item.deepLink) ?? '/(tabs)');
  };

  const handleMarkAllRead = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    markAllRead().catch(() => {});
  };

  // Long-press menu (INTERFACE_SPEC.md §9: "Long-press: 'Mark as read' /
  // 'Delete'"). "Delete" is per-user (dismissNotification), not a real
  // document delete — see convex/schema.ts's notificationDismissals comment.
  const handleLongPress = (item: NotificationItem) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Alert.alert(item.title, undefined, [
      ...(!item.read
        ? [{ text: 'Mark as read', onPress: () => markRead({ notificationId: item._id }).catch(() => {}) }]
        : []),
      { text: 'Delete', style: 'destructive' as const, onPress: () => dismissNotification({ notificationId: item._id }).catch(() => {}) },
      { text: 'Cancel', style: 'cancel' as const },
    ]);
  };

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
        <View style={styles.titleArea}>
          <Text style={[styles.title, { color: Colors.onSurface }]}>Notifications</Text>
        </View>
      </View>

      {/* Tab row */}
      <View style={styles.tabRow}>
        <View style={styles.tabGroup}>
          <Pressable onPress={() => setFilter('all')}>
            <Text style={[styles.tabText, { color: Colors.onSurfaceVariant }, filter === 'all' && styles.tabTextActiveFontOnly, filter === 'all' && { color: Colors.onSurface }]}>All</Text>
            {filter === 'all' && <View style={[styles.tabUnderline, { backgroundColor: Colors.primary }]} />}
          </Pressable>
          <Pressable onPress={() => setFilter('unread')}>
            <Text style={[styles.tabText, { color: Colors.onSurfaceVariant }, filter === 'unread' && styles.tabTextActiveFontOnly, filter === 'unread' && { color: Colors.onSurface }]}>Unread</Text>
            {filter === 'unread' && <View style={[styles.tabUnderline, { backgroundColor: Colors.primary }]} />}
          </Pressable>
        </View>
        {hasUnread && <Button label="Mark all read" variant="textLink" onPress={handleMarkAllRead} />}
      </View>

      {/* List */}
      {isLoading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={Colors.primary} />
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item._id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => {
            const typeStyle = TYPE_STYLE_BY_DEEPLINK[item.deepLink.type] ?? DEFAULT_TYPE_STYLE;
            return (
              <Pressable
                onPress={() => handlePress(item)}
                onLongPress={() => handleLongPress(item)}
                style={[styles.notifCard, { backgroundColor: item.read ? Colors.surfaceLowest : Colors.primaryFixedDim }]}
              >
                <View style={[styles.notifIcon, { backgroundColor: typeStyle.bg }]}>
                  <Ionicons name={typeStyle.icon} size={18} color={typeStyle.iconColor} />
                </View>
                <View style={styles.notifContent}>
                  <Text style={[styles.notifSender, { color: Colors.onSurface }]}>{item.title}</Text>
                  <Text style={[styles.notifMessage, { color: Colors.onSurfaceVariant }]} numberOfLines={2}>{item.body}</Text>
                  <Text style={[styles.notifTimestamp, { color: Colors.outline }]}>{formatRelativeTime(item._creationTime)}</Text>
                </View>
                {!item.read && <View style={[styles.unreadDot, { backgroundColor: Colors.primary }]} />}
              </Pressable>
            );
          }}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Ionicons name="notifications-off-outline" size={40} color={Colors.outline} />
              <Text style={[styles.emptyTitle, { color: Colors.onSurfaceVariant }]}>
                {filter === 'unread' ? "You're all caught up" : 'No notifications yet'}
              </Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
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
  titleArea: {
    paddingLeft: Spacing[4],
    paddingRight: Spacing[12],
  },
  title: {
    fontFamily: FontFamily.display,
    fontSize: 24,
    lineHeight: 28.8,
  },
  tabRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing[5],
    marginTop: Spacing[4],
  },
  tabGroup: {
    flexDirection: 'row',
    gap: Spacing[5],
  },
  tabText: {
    fontFamily: FontFamily.body,
    fontSize: 14,
    lineHeight: 22.4,
    paddingBottom: Spacing[2],
  },
  tabTextActiveFontOnly: {
    fontFamily: FontFamily.bodySemiBold,
  },
  tabUnderline: {
    height: 2,
    borderRadius: 1,
  },
  loading: {
    paddingVertical: Spacing[10],
    alignItems: 'center',
  },
  list: {
    paddingHorizontal: Spacing[5],
    paddingTop: Spacing[4],
    gap: Spacing[3],
    paddingBottom: Spacing[6],
  },
  notifCard: {
    borderRadius: Radius.lg,
    padding: Spacing[3],
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
  },
  notifIcon: {
    width: 36,
    height: 36,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notifContent: {
    flex: 1,
    marginLeft: Spacing[3],
  },
  notifSender: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 12,
    lineHeight: 18,
  },
  notifMessage: {
    fontFamily: FontFamily.body,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 1,
  },
  notifTimestamp: {
    fontFamily: FontFamily.body,
    fontSize: 11,
    lineHeight: 15.4,
    marginTop: Spacing[1],
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginLeft: Spacing[2],
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
});
