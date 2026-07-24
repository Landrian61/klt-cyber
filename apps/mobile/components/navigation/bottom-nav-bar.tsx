import { useEffect } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  interpolate,
} from 'react-native-reanimated';

import { FontFamily } from '@/constants/theme';
import { useThemeColors } from '@/hooks/use-theme-colors';

export type TabName = 'home' | 'radio' | 'giving' | 'updates' | 'more';

interface TabItem {
  key: TabName;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  iconActive: keyof typeof Ionicons.glyphMap;
}

const TABS: TabItem[] = [
  { key: 'home', label: 'Home', icon: 'home-outline', iconActive: 'home' },
  { key: 'radio', label: 'Radio', icon: 'radio-outline', iconActive: 'radio' },
  { key: 'giving', label: 'Giving', icon: 'heart-outline', iconActive: 'heart' },
  { key: 'updates', label: 'Updates', icon: 'megaphone-outline', iconActive: 'megaphone' },
  { key: 'more', label: 'More', icon: 'grid-outline', iconActive: 'grid-outline' },
];

export interface BottomNavBarProps {
  activeTab: TabName;
  isMoreOpen: boolean;
  onTabPress: (tab: TabName) => void;
}

function TabButton({
  tab,
  isActive,
  isMoreOpen,
  onPress,
}: {
  tab: TabItem;
  isActive: boolean;
  isMoreOpen: boolean;
  onPress: () => void;
}) {
  const Colors = useThemeColors();
  const dotScale = useSharedValue(isActive && tab.key !== 'more' ? 1 : 0);
  const moreRotation = useSharedValue(0);

  useEffect(() => {
    if (tab.key === 'more') {
      moreRotation.value = withTiming(isMoreOpen ? 1 : 0, { duration: 200 });
    } else {
      dotScale.value = withSpring(isActive ? 1 : 0, { damping: 12 });
    }
  }, [isActive, isMoreOpen, tab.key, dotScale, moreRotation]);

  const iconStyle = useAnimatedStyle(() => {
    if (tab.key !== 'more') return {};
    return {
      transform: [{ rotate: `${interpolate(moreRotation.value, [0, 1], [0, 45])}deg` }],
    };
  });

  const dotStyle = useAnimatedStyle(() => ({
    transform: [{ scale: dotScale.value }],
    opacity: dotScale.value,
  }));

  const handlePress = () => {
    onPress();
  };

  const isHighlighted = tab.key === 'more' ? isMoreOpen : isActive;

  return (
    <Pressable
      onPress={handlePress}
      style={styles.tabItem}
      accessibilityRole="tab"
      accessibilityState={{ selected: isHighlighted }}
      accessibilityLabel={tab.label}
    >
      <Animated.View style={iconStyle}>
        <Ionicons
          name={isHighlighted ? tab.iconActive : tab.icon}
          size={22}
          color={isHighlighted ? Colors.secondary : Colors.outline}
        />
      </Animated.View>

      <Text style={[
        styles.label,
        { color: isHighlighted ? Colors.secondary : Colors.outline },
      ]}>
        {tab.label}
      </Text>

      {/* Active dot indicator */}
      {tab.key !== 'more' && (
        <Animated.View style={[styles.activeDot, { backgroundColor: Colors.secondary }, dotStyle]} />
      )}
    </Pressable>
  );
}

export function BottomNavBar({ activeTab, isMoreOpen, onTabPress }: BottomNavBarProps) {
  const Colors = useThemeColors();

  return (
    <View style={[styles.bar, { backgroundColor: Colors.surfaceLowest }]}>
      {TABS.map((tab) => (
        <TabButton
          key={tab.key}
          tab={tab}
          isActive={activeTab === tab.key}
          isMoreOpen={isMoreOpen}
          onPress={() => onTabPress(tab.key)}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    gap: 2,
  },
  label: {
    fontSize: 10,
    lineHeight: 14,
    fontFamily: FontFamily.bodySemiBold,
  },
  activeDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    marginTop: 1,
  },
});
