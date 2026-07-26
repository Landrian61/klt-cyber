import { useEffect } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  interpolate,
  Easing,
} from 'react-native-reanimated';

import { FontFamily, Spacing } from '@/constants/theme';
import { useThemeColors } from '@/hooks/use-theme-colors';

const PANEL_HEIGHT = 206;

interface MorePanelItem {
  key: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  route?: string;
  locked?: boolean;
}

const ITEMS: MorePanelItem[] = [
  { key: 'members', label: 'Members', icon: 'people-outline', route: '/members' },
  { key: 'library', label: 'Library', icon: 'book-outline' },
  { key: 'media', label: 'Media', icon: 'play-circle-outline' },
  { key: 'admin', label: 'Admin', icon: 'shield-checkmark-outline', locked: true },
  { key: 'tower', label: 'Tower', icon: 'business-outline' },
  { key: 'appointments', label: 'Booking', icon: 'calendar-outline' },
  { key: 'inquiries', label: 'Inquiries', icon: 'chatbubble-ellipses-outline' },
  { key: 'procurement', label: 'Procure', icon: 'briefcase-outline' },
];

export interface MorePanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export function MorePanel({ isOpen, onClose }: MorePanelProps) {
  const Colors = useThemeColors();
  const router = useRouter();
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withTiming(isOpen ? 1 : 0, {
      duration: isOpen ? 250 : 200,
      easing: isOpen ? Easing.out(Easing.cubic) : Easing.in(Easing.cubic),
    });
  }, [isOpen, progress]);

  const animatedStyle = useAnimatedStyle(() => ({
    height: interpolate(progress.value, [0, 1], [0, PANEL_HEIGHT]),
    opacity: interpolate(progress.value, [0, 0.3, 1], [0, 1, 1]),
  }));

  const handleItemPress = (item: MorePanelItem) => {
    onClose();
    if (item.route) {
      setTimeout(() => router.push(item.route as any), 100);
    }
  };

  return (
    <Animated.View style={[styles.panel, { backgroundColor: Colors.surfaceLowest }, animatedStyle]}>
      {/* Drag handle */}
      <View style={styles.handleContainer}>
        <View style={[styles.handle, { backgroundColor: Colors.surfaceHigh }]} />
      </View>
      <View style={styles.grid}>
        {ITEMS.map((item) => (
          <Pressable
            key={item.key}
            onPress={() => handleItemPress(item)}
            style={styles.gridItem}
            accessibilityLabel={item.label}
          >
            <View style={[styles.iconCircle, { backgroundColor: Colors.redTint }]}>
              <Ionicons name={item.icon} size={22} color={Colors.secondary} />
              {item.locked && (
                <View style={[styles.lockBadge, { backgroundColor: Colors.redTint, borderColor: Colors.surfaceLowest }]}>
                  <Ionicons name="lock-closed" size={6} color={Colors.secondary} />
                </View>
              )}
            </View>
            <Text style={[styles.itemLabel, { color: Colors.onSurfaceVariant }]} numberOfLines={1}>{item.label}</Text>
          </Pressable>
        ))}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  panel: {
    borderTopLeftRadius: 36,
    borderTopRightRadius: 36,
    overflow: 'hidden',
  },
  handleContainer: {
    alignItems: 'center',
    paddingTop: 10,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: Spacing[4],
    paddingTop: Spacing[5],
    paddingBottom: Spacing[6],
  },
  gridItem: {
    width: '25%',
    alignItems: 'center',
    marginBottom: Spacing[4],
  },
  iconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  lockBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemLabel: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 10,
    lineHeight: 14,
    textAlign: 'center',
    marginTop: 6,
  },
});
