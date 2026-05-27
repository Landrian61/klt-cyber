import { useState } from 'react';
import { View, Text, FlatList, Pressable, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { FontFamily, Spacing, Radius } from '@/constants/theme';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { Button } from '@/components/ui/button';

type NotificationType = 'birthday' | 'activity' | 'leadership' | 'giving' | 'broadcast' | 'system';

interface Notification {
  id: string;
  type: NotificationType;
  sender: string;
  message: string;
  timestamp: string;
  unread: boolean;
}

// Placeholder notifications
const NOTIFICATIONS: Notification[] = [
  { id: '1', type: 'broadcast', sender: 'Reign Radio', message: 'Morning Glory is now live with Pastor James. Tap to listen.', timestamp: '2 min ago', unread: true },
  { id: '2', type: 'activity', sender: 'KLT Church', message: 'Bible Study starts in 30 minutes. Tap to check in.', timestamp: '1 hour ago', unread: true },
  { id: '3', type: 'giving', sender: 'Finance Team', message: 'Your Tithe of UGX 100,000 was received. God bless you.', timestamp: 'Yesterday', unread: false },
  { id: '4', type: 'birthday', sender: 'Pastor James', message: 'Happy Birthday Andrew! Wishing you God\'s richest blessings today.', timestamp: '3 days ago', unread: false },
  { id: '5', type: 'system', sender: 'KLT Church', message: 'Your Hebron clan membership has been approved.', timestamp: '1 week ago', unread: false },
];

export default function NotificationsScreen() {
  const Colors = useThemeColors();
  const router = useRouter();
  const [filter, setFilter] = useState<'all' | 'unread'>('all');

  const TYPE_STYLES: Record<NotificationType, { bg: string; iconColor: string; icon: keyof typeof Ionicons.glyphMap }> = {
    birthday: { bg: Colors.warningLight, iconColor: Colors.warning, icon: 'gift-outline' },
    activity: { bg: Colors.primaryLight, iconColor: Colors.primary, icon: 'calendar-outline' },
    leadership: { bg: Colors.primaryLight, iconColor: Colors.primary, icon: 'star-outline' },
    giving: { bg: Colors.successLight, iconColor: Colors.success, icon: 'checkmark-circle-outline' },
    broadcast: { bg: Colors.primaryLight, iconColor: Colors.primary, icon: 'radio-outline' },
    system: { bg: Colors.surfaceLow, iconColor: Colors.outline, icon: 'information-circle-outline' },
  };

  const filtered = filter === 'unread'
    ? NOTIFICATIONS.filter((n) => n.unread)
    : NOTIFICATIONS;

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
        <Button label="Mark all read" variant="textLink" onPress={() => {}} />
      </View>

      {/* List */}
      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        renderItem={({ item }) => {
          const typeStyle = TYPE_STYLES[item.type];
          return (
            <Pressable style={[styles.notifCard, { backgroundColor: item.unread ? Colors.primaryFixedDim : Colors.surfaceLowest }]}>
              <View style={[styles.notifIcon, { backgroundColor: typeStyle.bg }]}>
                <Ionicons name={typeStyle.icon} size={18} color={typeStyle.iconColor} />
              </View>
              <View style={styles.notifContent}>
                <Text style={[styles.notifSender, { color: Colors.onSurface }]}>{item.sender}</Text>
                <Text style={[styles.notifMessage, { color: Colors.onSurfaceVariant }]} numberOfLines={2}>{item.message}</Text>
                <Text style={[styles.notifTimestamp, { color: Colors.outline }]}>{item.timestamp}</Text>
              </View>
              {item.unread && <View style={[styles.unreadDot, { backgroundColor: Colors.primary }]} />}
            </Pressable>
          );
        }}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Ionicons name="notifications-off-outline" size={40} color={Colors.outline} />
            <Text style={[styles.emptyTitle, { color: Colors.onSurfaceVariant }]}>No notifications yet</Text>
          </View>
        }
      />
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
