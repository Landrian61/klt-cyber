import { View, Text, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Colors, FontFamily, Spacing, Glass, GoldGradient } from '@/constants/theme';
import { Button } from '@/components/ui/button';

export interface TopBarProps {
  unreadCount?: number;
  userInitials?: string;
  userPhoto?: string;
}

export function TopBar({ unreadCount = 0, userInitials = 'U' }: TopBarProps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <BlurView intensity={Glass.blurIntensity} tint={Glass.blurTint} style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.bar}>
        {/* Left — wordmark */}
        <Text style={styles.wordmark}>KLT Cyber Church</Text>

        {/* Right — bell + avatar */}
        <View style={styles.rightGroup}>
          {/* Notification bell */}
          <Button
            variant="icon"
            onPress={() => router.push('/notifications')}
            accessibilityLabel={`Notifications${unreadCount > 0 ? `, ${unreadCount} unread` : ''}`}
            icon={
              <View>
                <Ionicons name="notifications-outline" size={22} color={Colors.onSurfaceVariant} />
                {unreadCount > 0 && (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>
                      {unreadCount > 9 ? '9+' : unreadCount}
                    </Text>
                  </View>
                )}
              </View>
            }
          />

          {/* Profile avatar */}
          <Button
            variant="icon"
            onPress={() => router.push('/profile')}
            accessibilityLabel="My profile"
            icon={
              <LinearGradient
                colors={[...GoldGradient.colors]}
                start={GoldGradient.start}
                end={GoldGradient.end}
                style={styles.avatar}
              >
                <Text style={styles.avatarText}>{userInitials}</Text>
              </LinearGradient>
            }
          />
        </View>
      </View>
    </BlurView>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 100,
    backgroundColor: Glass.background,
  },
  bar: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing[5],
  },
  wordmark: {
    fontFamily: FontFamily.display,
    fontSize: 16,
    lineHeight: 24,
    color: Colors.primary,
  },
  rightGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[1],
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -6,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: Colors.secondary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  badgeText: {
    fontFamily: FontFamily.bodyBold,
    fontSize: 9,
    color: '#FFFFFF',
    lineHeight: 12,
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontFamily: FontFamily.bodyBold,
    fontSize: 12,
    color: '#FFFFFF',
    lineHeight: 16,
  },
});
