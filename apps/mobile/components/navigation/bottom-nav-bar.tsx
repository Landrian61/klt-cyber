import { useEffect, useRef, useState } from 'react';
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

/** Underline width — matches the icon glyph size. */
const INDICATOR_WIDTH = 22;

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
  const moreRotation = useSharedValue(0);

  useEffect(() => {
    if (tab.key === 'more') {
      moreRotation.value = withTiming(isMoreOpen ? 1 : 0, { duration: 200 });
    }
  }, [isMoreOpen, tab.key, moreRotation]);

  const iconStyle = useAnimatedStyle(() => {
    if (tab.key !== 'more') return {};
    return {
      transform: [{ rotate: `${interpolate(moreRotation.value, [0, 1], [0, 45])}deg` }],
    };
  });

  const isHighlighted = tab.key === 'more' ? isMoreOpen : isActive;

  return (
    <Pressable
      onPress={onPress}
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

      {/* Transparent slot so the flex `gap` spaces icon, label and the (bar-level)
          sliding underline evenly. The visible line is rendered by BottomNavBar. */}
      <View style={styles.indicatorSlot} />
    </Pressable>
  );
}

export function BottomNavBar({ activeTab, isMoreOpen, onTabPress }: BottomNavBarProps) {
  const Colors = useThemeColors();
  const [barWidth, setBarWidth] = useState(0);

  // A single underline that travels to the active tab — the movement between
  // tabs is the indicator, giving a clear sense of direction.
  const translateX = useSharedValue(0);
  const isFirstPlacement = useRef(true);

  const activeIndex = Math.max(0, TABS.findIndex((t) => t.key === activeTab));
  const slotWidth = barWidth / TABS.length;

  useEffect(() => {
    if (!barWidth) return;
    const target = activeIndex * slotWidth + (slotWidth - INDICATOR_WIDTH) / 2;
    if (isFirstPlacement.current) {
      // Land under the active tab on first mount without sliding in from the edge.
      translateX.value = target;
      isFirstPlacement.current = false;
    } else {
      translateX.value = withSpring(target, { damping: 20, stiffness: 200, mass: 0.8 });
    }
  }, [activeIndex, slotWidth, barWidth, translateX]);

  const indicatorStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  return (
    <View
      style={[styles.bar, { backgroundColor: Colors.surfaceLowest }]}
      onLayout={(e) => setBarWidth(e.nativeEvent.layout.width)}
    >
      {barWidth > 0 && (
        <Animated.View
          style={[styles.indicator, { width: INDICATOR_WIDTH, backgroundColor: Colors.secondary }, indicatorStyle]}
          pointerEvents="none"
        />
      )}

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
    gap: 4,
  },
  label: {
    fontSize: 10,
    lineHeight: 14,
    fontFamily: FontFamily.bodySemiBold,
  },
  // Reserves the line's row in the flex flow (kept in sync with `indicator`).
  indicatorSlot: {
    width: INDICATOR_WIDTH,
    height: 3,
  },
  indicator: {
    position: 'absolute',
    left: 0,
    bottom: 4.5,
    height: 3,
    borderRadius: 2,
  },
});
