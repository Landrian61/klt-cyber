import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { FontFamily, Spacing, Radius } from '@/constants/theme';
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

/**
 * Single-select radio list for optional pickers (Department — Step 5, Clan —
 * Step 6). Selection reads as a tonal background shift plus a gold check rather
 * than a 1px outline, per the Sacred Curator No-Line rule. Re-tapping the
 * current choice clears it, since these fields are all optional.
 */
export function SelectList({ options, selectedId, onSelect, emptyText }: SelectListProps) {
  const Colors = useThemeColors();

  if (options.length === 0) {
    return (
      <Text style={[styles.empty, { color: Colors.outline }]}>
        {emptyText ?? 'Nothing to choose from yet.'}
      </Text>
    );
  }

  return (
    <View style={styles.list}>
      {options.map((opt) => {
        const selected = selectedId === opt.id;
        return (
          <Pressable
            key={opt.id}
            onPress={() => onSelect(selected ? undefined : opt.id)}
            style={[
              styles.row,
              { backgroundColor: selected ? Colors.primaryFixedDim : Colors.surfaceLowest },
            ]}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
          >
            <View style={styles.rowText}>
              <Text
                style={[
                  styles.label,
                  { color: selected ? Colors.primary : Colors.onSurface },
                ]}
              >
                {opt.label}
              </Text>
              {opt.sublabel ? (
                <Text style={[styles.sublabel, { color: Colors.onSurfaceVariant }]}>
                  {opt.sublabel}
                </Text>
              ) : null}
            </View>
            {selected ? (
              <Ionicons name="checkmark-circle" size={22} color={Colors.primary} />
            ) : (
              <Ionicons name="ellipse-outline" size={22} color={Colors.outline} />
            )}
          </Pressable>
        );
      })}
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
