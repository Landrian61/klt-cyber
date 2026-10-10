import { View, Text, StyleSheet } from 'react-native';

import { FontFamily, Radius, Spacing } from '@/constants/theme';
import { useThemeColors } from '@/hooks/use-theme-colors';

// Non-blocking connectivity notice (AC-2): a screen that already has data
// keeps showing it — this never replaces a working screen, it just says why
// a retry might not land yet. Clears on its own once `useIsOffline` flips.
export function OfflineBanner() {
  const Colors = useThemeColors();

  return (
    <View
      style={[styles.container, { backgroundColor: Colors.surfaceHigh }]}
      accessible
      accessibilityRole="text"
      accessibilityLiveRegion="polite"
    >
      <View style={[styles.dot, { backgroundColor: Colors.secondary }]} />
      <Text style={[styles.label, { color: Colors.onSurfaceVariant }]}>
        You&apos;re offline — showing what was already loaded.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[2],
    paddingHorizontal: Spacing[4],
    paddingVertical: Spacing[2],
    borderRadius: Radius.md,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: Radius.full,
  },
  label: {
    fontFamily: FontFamily.body,
    fontSize: 13,
    flexShrink: 1,
  },
});
