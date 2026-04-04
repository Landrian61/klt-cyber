import { View, Text, Pressable, StyleSheet } from 'react-native';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';

import { Colors, FontFamily, Glass, AmbientShadowUp } from '@/constants/theme';

type TabName = 'home' | 'radio' | 'members' | 'updates' | 'more';

interface TabItem {
  key: TabName;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  iconActive: keyof typeof Ionicons.glyphMap;
}

const TABS: TabItem[] = [
  { key: 'home', label: 'Home', icon: 'home-outline', iconActive: 'home' },
  { key: 'radio', label: 'Radio', icon: 'radio-outline', iconActive: 'radio' },
  { key: 'members', label: 'Members', icon: 'people-outline', iconActive: 'people' },
  { key: 'updates', label: 'Updates', icon: 'megaphone-outline', iconActive: 'megaphone' },
  { key: 'more', label: 'More', icon: 'grid-outline', iconActive: 'grid' },
];

export interface BottomNavBarProps {
  activeTab: TabName;
  onTabPress: (tab: TabName) => void;
}

export function BottomNavBar({ activeTab, onTabPress }: BottomNavBarProps) {
  const insets = useSafeAreaInsets();

  const handlePress = (tab: TabName) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onTabPress(tab);
  };

  return (
    <BlurView
      intensity={Glass.blurIntensity}
      tint={Glass.blurTint}
      style={[styles.container, AmbientShadowUp, { paddingBottom: insets.bottom }]}
    >
      <View style={styles.bar}>
        {TABS.map((tab) => {
          const isActive = activeTab === tab.key;
          return (
            <Pressable
              key={tab.key}
              onPress={() => handlePress(tab.key)}
              style={styles.tabItem}
              accessibilityRole="tab"
              accessibilityState={{ selected: isActive }}
              accessibilityLabel={tab.label}
            >
              {/* Gold top ribbon for active */}
              {isActive && <View style={styles.activeRibbon} />}

              <Ionicons
                name={isActive ? tab.iconActive : tab.icon}
                size={24}
                color={isActive ? Colors.primary : Colors.outline}
              />
              <Text style={[styles.label, isActive ? styles.labelActive : styles.labelInactive]}>
                {tab.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </BlurView>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 100,
    backgroundColor: Glass.background,
  },
  bar: {
    height: 64,
    flexDirection: 'row',
    alignItems: 'center',
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    position: 'relative',
  },
  activeRibbon: {
    position: 'absolute',
    top: 0,
    width: 24,
    height: 2,
    backgroundColor: Colors.primary,
    borderRadius: 1,
  },
  label: {
    fontFamily: FontFamily.bodyMedium,
    fontSize: 11,
    marginTop: 4,
  },
  labelActive: {
    color: Colors.primary,
  },
  labelInactive: {
    color: Colors.outline,
  },
});
