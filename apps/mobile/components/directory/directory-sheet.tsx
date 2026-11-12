import { type ReactNode } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { SlideInDown, useReducedMotion } from 'react-native-reanimated';

import { AmbientShadowUp, Duration, FontFamily, Radius, Spacing } from '@/constants/theme';
import { useThemeColors } from '@/hooks/use-theme-colors';

export interface DirectorySheetProps {
  visible: boolean;
  title: string;
  /** Called on scrim tap and on the Android back button. */
  onDismiss: () => void;
  children: ReactNode;
}

/**
 * The bottom sheet the directory's consent and filter pickers sit on (spec
 * 0022). Plain React Native `Modal` so feature 14 can reuse the consent sheet
 * without a new dependency. Slides up on the UI thread; under reduced motion
 * it just appears.
 */
export function DirectorySheet({ visible, title, onDismiss, children }: DirectorySheetProps) {
  const Colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onDismiss} statusBarTranslucent>
      <View style={styles.root}>
        <Pressable
          style={[StyleSheet.absoluteFill, { backgroundColor: Colors.scrim }]}
          onPress={onDismiss}
          accessibilityRole="button"
          accessibilityLabel="Close"
        />
        <Animated.View
          entering={reduceMotion ? undefined : SlideInDown.duration(Duration.sheetIn)}
          style={[
            styles.sheet,
            AmbientShadowUp,
            { backgroundColor: Colors.surface, paddingBottom: insets.bottom + Spacing[5] },
          ]}
          accessibilityViewIsModal
        >
          <View style={[styles.handle, { backgroundColor: Colors.surfaceHigh }]} />
          <Text style={[styles.title, { color: Colors.onSurface }]} accessibilityRole="header">
            {title}
          </Text>
          {children}
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: Radius.sheet,
    borderTopRightRadius: Radius.sheet,
    paddingHorizontal: Spacing[5],
    paddingTop: Spacing[3],
    maxHeight: '85%',
  },
  handle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: Radius.full,
    marginBottom: Spacing[4],
  },
  title: {
    fontFamily: FontFamily.displaySemi,
    fontSize: 20,
    lineHeight: 26,
    marginBottom: Spacing[3],
  },
});
