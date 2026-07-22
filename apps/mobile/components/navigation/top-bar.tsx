import { View, Text, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FontFamily, Spacing, GoldGradient } from '@/constants/theme';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { Button } from '@/components/ui/button';

export interface TopBarProps {
  title?: string;
  unreadCount?: number;
  userInitials?: string;
  userPhoto?: string;
}

export function TopBar({ title, unreadCount = 0, userInitials = 'U' }: TopBarProps) {
  const Colors = useThemeColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <BlurView intensity={20} tint={Colors.glassTint as 'light'} style={[styles.container, { paddingTop: insets.top, backgroundColor: Colors.glassBackground }]}>
      <View style={styles.bar}>
        {/* Left — logo + page title */}
        <View style={styles.leftGroup}>
          <Image
            source={require('@/assets/images/faviconV2.png')}
            style={styles.logoImage}
            contentFit="cover"
          />
          {title && <Text style={[styles.pageTitle, { color: Colors.onSurface }]}>{title}</Text>}
        </View>

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
                  <View style={[styles.badge, { backgroundColor: Colors.secondary }]}>
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
                style={[styles.avatar, { borderColor: Colors.primary }]}
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
  },
  bar: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing[5],
  },
  leftGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[3],
  },
  logoImage: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  pageTitle: {
    fontFamily: FontFamily.display,
    fontSize: 18,
    lineHeight: 24,
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
