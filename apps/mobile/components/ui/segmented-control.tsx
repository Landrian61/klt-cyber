import { View, Text, Pressable, StyleSheet, LayoutChangeEvent } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';

import { FontFamily, Radius, Duration, GoldGradient } from '@/constants/theme';
import { useThemeColors } from '@/hooks/use-theme-colors';

export interface SegmentedControlProps {
  options: string[];
  selectedIndex: number;
  onChange: (index: number) => void;
}

export function SegmentedControl({ options, selectedIndex, onChange }: SegmentedControlProps) {
  const Colors = useThemeColors();
  const segmentWidth = useSharedValue(0);
  const translateX = useSharedValue(0);

  const handleLayout = (e: LayoutChangeEvent) => {
    const width = (e.nativeEvent.layout.width - 8) / options.length; // subtract padding
    segmentWidth.value = width;
    translateX.value = width * selectedIndex;
  };

  const handlePress = (index: number) => {
    translateX.value = withTiming(segmentWidth.value * index, { duration: Duration.normal });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onChange(index);
  };

  const animatedIndicatorStyle = useAnimatedStyle(() => ({
    width: segmentWidth.value,
    transform: [{ translateX: translateX.value }],
  }));

  return (
    <View style={[styles.container, { backgroundColor: Colors.surfaceLow }]} onLayout={handleLayout}>
      <Animated.View style={[styles.indicatorWrapper, animatedIndicatorStyle]}>
        <LinearGradient
          colors={[...GoldGradient.colors]}
          start={GoldGradient.start}
          end={GoldGradient.end}
          style={styles.indicator}
        />
      </Animated.View>
      {options.map((option, index) => (
        <Pressable
          key={option}
          onPress={() => handlePress(index)}
          style={styles.segment}
          accessibilityRole="tab"
          accessibilityState={{ selected: index === selectedIndex }}
        >
          <Text
            style={[
              styles.label,
              { color: index === selectedIndex ? Colors.onPrimary : Colors.onSurfaceVariant },
            ]}
          >
            {option}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    borderRadius: Radius.full,
    padding: 4,
    height: 40,
    position: 'relative',
  },
  indicatorWrapper: {
    position: 'absolute',
    top: 4,
    left: 4,
    bottom: 4,
  },
  indicator: {
    flex: 1,
    borderRadius: Radius.full,
  },
  segment: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  label: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 14,
    lineHeight: 22.4,
  },
});
