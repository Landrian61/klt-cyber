import { memo, useCallback, useRef } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Animated, {
  FadeIn,
  LinearTransition,
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  useReducedMotion,
} from 'react-native-reanimated';

import { FontFamily, Spacing, Radius, Duration } from '@/constants/theme';
import { useThemeColors } from '@/hooks/use-theme-colors';

export interface SelectOption {
  id: string;
  label: string;
  sublabel?: string;
}

export interface SelectListProps {
  options: SelectOption[];
  /** The selected option id, or undefined for none. */
  selectedId?: string;
  /** Tapping the selected row again clears it (emits undefined). */
  onSelect: (id: string | undefined) => void;
  emptyText?: string;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/**
 * One selectable row. Memoized so a selection change only re-renders the two
 * rows whose `selected` flips — never the whole list. Press feedback (scale +
 * haptic) and the entrance/reflow animations all run on the UI thread.
 */
const SelectRow = memo(function SelectRow({
  option,
  selected,
  index,
  onToggle,
}: {
  option: SelectOption;
  selected: boolean;
  index: number;
  onToggle: (id: string) => void;
}) {
  const Colors = useThemeColors();
  const reduceMotion = useReducedMotion();
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <AnimatedPressable
      onPressIn={() => {
        scale.value = withTiming(0.98, { duration: Duration.fast });
      }}
      onPressOut={() => {
        scale.value = withTiming(1, { duration: 150 });
      }}
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onToggle(option.id);
      }}
      entering={reduceMotion ? undefined : FadeIn.duration(240).delay(index * 40)}
      layout={reduceMotion ? undefined : LinearTransition.springify().damping(18)}
      style={[
        animatedStyle,
        styles.row,
        { backgroundColor: selected ? Colors.primaryFixedDim : Colors.surfaceLowest },
      ]}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
    >
      <View style={styles.rowText}>
        <Text style={[styles.label, { color: selected ? Colors.primary : Colors.onSurface }]}>
          {option.label}
        </Text>
        {option.sublabel ? (
          <Text style={[styles.sublabel, { color: Colors.onSurfaceVariant }]}>
            {option.sublabel}
          </Text>
        ) : null}
      </View>
      <Ionicons
        name={selected ? 'checkmark-circle' : 'ellipse-outline'}
        size={22}
        color={selected ? Colors.primary : Colors.outline}
      />
    </AnimatedPressable>
  );
});

/**
 * Single-select radio list for optional pickers (Department — Step 5, Clan —
 * Step 6). Selection reads as a tonal background shift plus a gold check rather
 * than a 1px outline, per the Sacred Curator No-Line rule. Re-tapping the
 * current choice clears it, since these fields are all optional.
 *
 * Rendered inside the step scaffold's ScrollView, so it maps memoized rows
 * rather than nesting a FlatList (which would break the parent's scrolling).
 */
export function SelectList({ options, selectedId, onSelect, emptyText }: SelectListProps) {
  const Colors = useThemeColors();

  // Keep `onToggle` stable (so memoized rows hold) while still reading the
  // latest selection — a ref sidesteps threading `selectedId` through deps.
  const selectedRef = useRef(selectedId);
  selectedRef.current = selectedId;
  const onToggle = useCallback(
    (id: string) => onSelect(selectedRef.current === id ? undefined : id),
    [onSelect],
  );

  if (options.length === 0) {
    return (
      <Text style={[styles.empty, { color: Colors.outline }]}>
        {emptyText ?? 'Nothing to choose from yet.'}
      </Text>
    );
  }

  return (
    <View style={styles.list}>
      {options.map((opt, index) => (
        <SelectRow
          key={opt.id}
          option={opt}
          index={index}
          selected={selectedId === opt.id}
          onToggle={onToggle}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: Spacing[2] },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: Radius.lg,
    paddingHorizontal: Spacing[4],
    paddingVertical: Spacing[4],
  },
  rowText: { flex: 1, marginRight: Spacing[3] },
  label: {
    fontFamily: FontFamily.bodyMedium,
    fontSize: 15,
    lineHeight: 22,
  },
  sublabel: {
    fontFamily: FontFamily.body,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 2,
  },
  empty: {
    fontFamily: FontFamily.body,
    fontSize: 14,
    lineHeight: 22.4,
  },
});
