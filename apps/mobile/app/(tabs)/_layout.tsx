import { useState, useCallback } from 'react';
import { View, StyleSheet } from 'react-native';
import { Tabs, useRouter, usePathname } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useQuery } from 'convex/react';

import { useThemeColors } from '@/hooks/use-theme-colors';
import { TopBar } from '@/components/navigation/top-bar';
import { BottomNavigation } from '@/components/navigation/bottom-navigation';
import type { TabName } from '@/components/navigation/bottom-nav-bar';
import { useMyAccount } from '@/hooks/use-my-account';
import { getInitials } from '@/lib/user-display';
import { api } from '@/lib/api';

const TAB_ROUTES: Record<Exclude<TabName, 'more'>, string> = {
  home: '/(tabs)',
  radio: '/(tabs)/radio',
  giving: '/(tabs)/giving',
  updates: '/(tabs)/updates',
};

const TAB_TITLES: Record<TabName, string> = {
  home: 'Home',
  radio: 'Radio',
  giving: 'Giving',
  updates: 'Updates',
  more: 'More',
};

function pathnameToTab(pathname: string): TabName {
  if (pathname.includes('radio')) return 'radio';
  if (pathname.includes('giving')) return 'giving';
  if (pathname.includes('updates')) return 'updates';
  return 'home';
}

export default function TabLayout() {
  const Colors = useThemeColors();
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const [moreVisible, setMoreVisible] = useState(false);
  const { user } = useMyAccount();
  // Resolves to 0 (not undefined) once loaded, including when signed out —
  // see convex/notifications.ts's own doc comment on this query.
  const unreadCount = useQuery(api.notifications.getMyUnreadNotificationCount) ?? 0;

  const activeTab: TabName = moreVisible ? 'more' : pathnameToTab(pathname);

  const handleTabPress = useCallback((tab: TabName) => {
    if (tab === 'more') {
      setMoreVisible((prev) => !prev);
    } else {
      setMoreVisible(false);
      router.navigate(TAB_ROUTES[tab] as any);
    }
  }, [router]);

  const topBarHeight = insets.top + 56;
  const bottomNavHeight = 56 + insets.bottom;

  return (
    <View style={[styles.container, { backgroundColor: Colors.surface }]}>
      <TopBar title={TAB_TITLES[pathnameToTab(pathname)]} unreadCount={unreadCount} userInitials={getInitials(user)} />

      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarStyle: { display: 'none' },
          sceneStyle: {
            backgroundColor: Colors.surface,
            paddingTop: topBarHeight,
            paddingBottom: bottomNavHeight,
          },
        }}
      >
        <Tabs.Screen name="index" options={{ title: 'Home' }} />
        <Tabs.Screen name="radio" options={{ title: 'Radio' }} />
        <Tabs.Screen name="giving" options={{ title: 'Giving' }} />
        <Tabs.Screen name="updates" options={{ title: 'Updates' }} />
      </Tabs>

      <BottomNavigation
        activeTab={activeTab}
        isMoreOpen={moreVisible}
        onTabPress={handleTabPress}
        onMoreClose={() => setMoreVisible(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
