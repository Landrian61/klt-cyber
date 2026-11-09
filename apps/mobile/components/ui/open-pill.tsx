import { View, Text, StyleSheet } from 'react-native';
import { RE_OPEN_STATE_LABELS, type RealEstateOpenState } from '@klt-cyber/shared';

import { FontFamily, Spacing, Radius } from '@/constants/theme';
import { useThemeColors } from '@/hooks/use-theme-colors';

/**
 * "Open now", "Closed" or "Hours not listed" (spec 0018, AC-18, AC-22).
 *
 * Three states, and the third is not a quieter version of "Closed": it means
 * nobody has recorded the hours. Colouring it like "Closed" would tell the
 * member the building is shut when the data says no such thing, so it takes
 * the neutral surface tone instead of the crimson one.
 *
 * The label text carries the state as well as the colour, so the distinction
 * survives for a member who cannot tell the two tones apart.
 */
export function OpenPill({ state }: { state: RealEstateOpenState }) {
  const Colors = useThemeColors();
  const tone =
    state === 'open'
      ? { bg: Colors.primaryContainer, fg: Colors.primary }
      : state === 'closed'
        ? { bg: Colors.redTint, fg: Colors.secondary }
        : { bg: Colors.surfaceContainer, fg: Colors.onSurfaceVariant };

  return (
    <View style={[styles.pill, { backgroundColor: tone.bg }]}>
      <Text style={[styles.pillText, { color: tone.fg }]}>
        {RE_OPEN_STATE_LABELS[state]}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    alignSelf: 'flex-start',
    paddingHorizontal: Spacing[2],
    paddingVertical: 2,
    borderRadius: Radius.full,
  },
  pillText: { fontSize: 11, lineHeight: 16, fontFamily: FontFamily.bodySemiBold },
});
