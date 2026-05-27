import { useEffect } from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
} from 'react-native-reanimated';

import { useThemeColors } from '@/hooks/use-theme-colors';
import { BottomNavBar, type TabName } from '@/components/navigation/bottom-nav-bar';
import { MorePanel } from '@/components/navigation/more-panel';

export interface BottomNavigationProps {
  activeTab: TabName;
  isMoreOpen: boolean;
  onTabPress: (tab: TabName) => void;
  onMoreClose: () => void;
}

export function BottomNavigation({
  activeTab,
  isMoreOpen,
  onTabPress,
  onMoreClose,
}: BottomNavigationProps) {
  const Colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const scrimOpacity = useSharedValue(0);

  useEffect(() => {
    scrimOpacity.value = withTiming(isMoreOpen ? 1 : 0, { duration: 200 });
  }, [isMoreOpen, scrimOpacity]);

  const scrimStyle = useAnimatedStyle(() => ({
    opacity: scrimOpacity.value,
  }));

  const barAndSafeAreaHeight = 56 + insets.bottom;

  return (
    <>
      {/* Scrim — covers content area only */}
      <Animated.View
        style={[styles.scrim, { bottom: barAndSafeAreaHeight }, scrimStyle]}
        pointerEvents={isMoreOpen ? 'auto' : 'none'}
      >
        <Pressable style={styles.scrimPressable} onPress={onMoreClose} />
      </Animated.View>

      {/* More panel — floats above the bar, transparent behind so rounded corners show */}
      <View style={[styles.panelContainer, { bottom: barAndSafeAreaHeight }]}>
        <MorePanel isOpen={isMoreOpen} onClose={onMoreClose} />
      </View>

      {/* Nav bar + safe area — solid background */}
      <View style={[styles.barContainer, { height: barAndSafeAreaHeight, paddingBottom: insets.bottom, backgroundColor: Colors.surfaceLowest }]}>
        <BottomNavBar
          activeTab={activeTab}
          isMoreOpen={isMoreOpen}
          onTabPress={onTabPress}
        />
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  panelContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 100,
  },
  barContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 101,
  },
  scrim: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 99,
    backgroundColor: 'rgba(28, 28, 24, 0.15)',
  },
  scrimPressable: {
    flex: 1,
  },
});
