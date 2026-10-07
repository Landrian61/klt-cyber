import { memo, useCallback } from 'react';
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
import type { SelectOption } from './select-list';

export interface MultiSelectListProps {
  options: SelectOption[];
  selectedIds: string[];
  onToggle: (id: string) => void;
  /** Once this many are selected, unselected rows dim and stop responding. */
  max: number;
  emptyText?: string;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/**
 * One selectable row. Memoized so a selection change only re-renders the
 * rows whose `selected`/`disabled` flip. Press feedback and the entrance/
 * reflow animations run on the UI thread, mirroring `SelectRow` in
 * `select-list.tsx`.
 */
const MultiSelectRow = memo(function MultiSelectRow({
  option,
  selected,
  disabled,
  index,
  onToggle,
}: {
  option: SelectOption;
  selected: boolean;
  disabled: boolean;
  index: number;
  onToggle: (id: string) => void;
}) {
  const Colors = useThemeColors();
  const reduceMotion = useReducedMotion();
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <AnimatedPressable
      disabled={disabled}
      onPressIn={() => {
        if (disabled) return;
        scale.value = withTiming(0.98, { duration: Duration.fast });
      }}
      onPressOut={() => {
        if (disabled) return;
        scale.value = withTiming(1, { duration: 150 });
      }}
      onPress={() => {
        if (disabled) return;
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onToggle(option.id);
      }}
      entering={reduceMotion ? undefined : FadeIn.duration(240).delay(index * 40)}
      layout={reduceMotion ? undefined : LinearTransition.springify().damping(18)}
      style={[
        animatedStyle,
        styles.row,
        { backgroundColor: selected ? Colors.primaryFixedDim : Colors.surfaceLowest },
        disabled && !selected ? styles.rowDisabled : null,
      ]}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected, disabled }}
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
        name={selected ? 'checkbox' : 'square-outline'}
        size={22}
        color={selected ? Colors.primary : Colors.outline}
      />
    </AnimatedPressable>
  );
});

/**
 * Multi-select checklist capped at `max` selections — once reached, remaining
 * unselected rows dim and stop responding (selected rows stay tappable to
 * deselect). Same tonal-background-plus-icon language as `SelectList`, but
 * checkbox rather than radio semantics, since more than one choice is valid.
 * A small counter beneath the list keeps the cap legible while choosing.
 */
export function MultiSelectList({
  options,
  selectedIds,
  onToggle,
  max,
  emptyText,
}: MultiSelectListProps) {
  const Colors = useThemeColors();

  const atCap = selectedIds.length >= max;

  const handleToggle = useCallback((id: string) => onToggle(id), [onToggle]);

  if (options.length === 0) {
    return (
      <Text style={[styles.empty, { color: Colors.outline }]}>
        {emptyText ?? 'Nothing to choose from yet.'}
      </Text>
    );
  }

  return (
    <View>
      <View style={styles.list}>
        {options.map((opt, index) => {
          const selected = selectedIds.includes(opt.id);
          return (
            <MultiSelectRow
              key={opt.id}
              option={opt}
              index={index}
              selected={selected}
              disabled={!selected && atCap}
              onToggle={handleToggle}
            />
          );
        })}
      </View>
      <Text style={[styles.counter, { color: Colors.outline }]}>
        {selectedIds.length} of {max} selected
      </Text>
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
  rowDisabled: { opacity: 0.45 },
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
  counter: {
    fontFamily: FontFamily.body,
    fontSize: 12,
    lineHeight: 16,
    marginTop: Spacing[3],
    textAlign: 'right',
  },
  empty: {
    fontFamily: FontFamily.body,
    fontSize: 14,
    lineHeight: 22.4,
  },
});
