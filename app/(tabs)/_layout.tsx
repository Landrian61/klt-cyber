import { useState, useCallback } from 'react';
import { View, StyleSheet } from 'react-native';
import { Tabs, useRouter, usePathname } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Colors } from '@/constants/theme';
import { TopBar } from '@/components/navigation/top-bar';
import { BottomNavBar } from '@/components/navigation/bottom-nav-bar';
import { MoreSheet } from '@/components/navigation/more-sheet';

type TabName = 'home' | 'radio' | 'members' | 'updates' | 'more';

const TAB_ROUTES: Record<Exclude<TabName, 'more'>, string> = {
  home: '/(tabs)',
  radio: '/(tabs)/radio',
  members: '/(tabs)/members',
  updates: '/(tabs)/updates',
};

function pathnameToTab(pathname: string): TabName {
  if (pathname.includes('radio')) return 'radio';
  if (pathname.includes('members')) return 'members';
  if (pathname.includes('updates')) return 'updates';
  return 'home';
}

export default function TabLayout() {
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const [moreVisible, setMoreVisible] = useState(false);

  const activeTab: TabName = moreVisible ? 'more' : pathnameToTab(pathname);

  const handleTabPress = useCallback((tab: TabName) => {
    if (tab === 'more') {
      setMoreVisible(true);
    } else {
      setMoreVisible(false);
      router.navigate(TAB_ROUTES[tab] as any);
    }
  }, [router]);

  const topBarHeight = insets.top + 56;
  const bottomNavHeight = 64 + insets.bottom;

  return (
    <View style={styles.container}>
      <TopBar unreadCount={3} userInitials="A" />

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
        <Tabs.Screen name="members" options={{ title: 'Members' }} />
        <Tabs.Screen name="updates" options={{ title: 'Updates' }} />
      </Tabs>

      <BottomNavBar activeTab={activeTab} onTabPress={handleTabPress} />
      <MoreSheet visible={moreVisible} onClose={() => setMoreVisible(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.surface,
  },
});
