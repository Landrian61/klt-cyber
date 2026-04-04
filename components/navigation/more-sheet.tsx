import { View, Text, Pressable, StyleSheet, Dimensions, Modal } from 'react-native';
import { BlurView } from 'expo-blur';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import { Colors, FontFamily, Spacing, Radius, Glass, Overlay } from '@/constants/theme';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const SHEET_HEIGHT = SCREEN_HEIGHT * 0.7;

interface MoreSheetItem {
  key: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  route?: string;
  special?: boolean;
}

const ITEMS: MoreSheetItem[] = [
  { key: 'giving', label: 'Giving', icon: 'heart-outline', route: '/giving' },
  { key: 'library', label: 'Library', icon: 'book-outline', route: '/library' },
  { key: 'media', label: 'Media & Events', icon: 'play-circle-outline', route: '/media' },
  { key: 'admin', label: 'Administration', icon: 'shield-checkmark-outline', special: true },
  { key: 'tower', label: 'Tower of Faith', icon: 'business-outline', route: '/tower' },
  { key: 'appointments', label: 'Appointments', icon: 'calendar-outline', route: '/appointments' },
  { key: 'inquiries', label: 'Inquiries', icon: 'chatbubble-ellipses-outline', route: '/inquiries' },
  { key: 'procurement', label: 'Procurement', icon: 'briefcase-outline', route: '/procurement' },
];

export interface MoreSheetProps {
  visible: boolean;
  onClose: () => void;
}

export function MoreSheet({ visible, onClose }: MoreSheetProps) {
  const router = useRouter();

  const handleItemPress = (item: MoreSheetItem) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onClose();
    if (item.route) {
      // Navigate after sheet closes
      setTimeout(() => router.push(item.route as any), 200);
    }
    // TODO: Handle admin special case (secondary auth modal)
  };

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      {/* Scrim overlay */}
      <Pressable style={styles.overlay} onPress={onClose}>
        <View />
      </Pressable>

      {/* Sheet */}
      <View style={styles.sheetContainer}>
        <BlurView intensity={Glass.blurIntensity} tint={Glass.blurTint} style={styles.sheet}>
          {/* Drag handle */}
          <View style={styles.handleContainer}>
            <View style={styles.handle} />
          </View>

          {/* Title */}
          <Text style={styles.title}>More</Text>

          {/* 4×2 grid */}
          <View style={styles.grid}>
            {ITEMS.map((item) => (
              <Pressable
                key={item.key}
                onPress={() => handleItemPress(item)}
                style={styles.gridItem}
                accessibilityLabel={item.label}
              >
                <View style={styles.iconContainer}>
                  <Ionicons name={item.icon} size={26} color={Colors.primary} />
                  {item.special && (
                    <View style={styles.lockBadge}>
                      <Ionicons name="lock-closed" size={8} color={Colors.primary} />
                    </View>
                  )}
                </View>
                <Text style={styles.itemLabel}>{item.label}</Text>
              </Pressable>
            ))}
          </View>
        </BlurView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: Overlay.scrim,
  },
  sheetContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: SHEET_HEIGHT,
  },
  sheet: {
    flex: 1,
    backgroundColor: Glass.background,
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    overflow: 'hidden',
  },
  handleContainer: {
    alignItems: 'center',
    paddingTop: 10,
  },
  handle: {
    width: 36,
    height: 3,
    borderRadius: Radius.full,
    backgroundColor: Colors.outline,
    opacity: 0.3,
  },
  title: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 16,
    lineHeight: 24,
    color: Colors.onSurface,
    paddingHorizontal: Spacing[5],
    marginTop: Spacing[4],
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: Spacing[4],
    gap: Spacing[3],
    marginTop: Spacing[3],
  },
  gridItem: {
    width: '22%',
    flexGrow: 1,
    backgroundColor: Colors.surfaceLowest,
    borderRadius: Radius.lg,
    alignItems: 'center',
    paddingVertical: Spacing[4],
    paddingHorizontal: Spacing[2],
  },
  iconContainer: {
    width: 52,
    height: 52,
    backgroundColor: Colors.primaryLight,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  lockBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: Colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemLabel: {
    fontFamily: FontFamily.bodyMedium,
    fontSize: 11,
    lineHeight: 15.4,
    color: Colors.onSurface,
    textAlign: 'center',
    marginTop: Spacing[2],
  },
});
