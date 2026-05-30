import { useState } from 'react';
import { View, Text, Pressable, Platform, StyleSheet } from 'react-native';
import DateTimePicker, {
  type DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';

import { FontFamily, Spacing, Radius } from '@/constants/theme';
import { useThemeColors } from '@/hooks/use-theme-colors';

export interface DateFieldProps {
  label: string;
  /** ISO date string `YYYY-MM-DD`, or undefined when unset. */
  value?: string;
  onChange: (value: string | undefined) => void;
  placeholder?: string;
  helperText?: string;
}

function toISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function fromISO(s?: string): Date | undefined {
  if (!s) return undefined;
  const [y, m, d] = s.split('-').map(Number);
  if (!y || !m || !d) return undefined;
  return new Date(y, m - 1, d);
}

/**
 * A date picker styled to match the `Input` primitive. Emits / clears an ISO
 * `YYYY-MM-DD` string (the shape the data model and zod validators expect).
 */
export function DateField({
  label,
  value,
  onChange,
  placeholder = 'Select a date',
  helperText,
}: DateFieldProps) {
  const Colors = useThemeColors();
  const [show, setShow] = useState(false);

  const handleChange = (event: DateTimePickerEvent, date?: Date) => {
    // Android fires a one-shot dialog; iOS uses an inline spinner.
    if (Platform.OS !== 'ios') setShow(false);
    if (event.type === 'set' && date) onChange(toISO(date));
  };

  return (
    <View style={styles.container}>
      <Text style={[styles.label, { color: Colors.onSurface }]}>{label}</Text>

      <Pressable
        onPress={() => setShow(true)}
        style={[styles.inputContainer, { backgroundColor: Colors.surfaceLowest }]}
        accessibilityRole="button"
        accessibilityLabel={`${label}${value ? `, ${value}` : ''}`}
      >
        <Ionicons
          name="calendar-outline"
          size={18}
          color={value ? Colors.primary : Colors.outline}
          style={styles.leftIcon}
        />
        <Text style={[styles.value, { color: value ? Colors.onSurface : Colors.outline }]}>
          {value ?? placeholder}
        </Text>
        {value ? (
          <Pressable
            onPress={() => onChange(undefined)}
            hitSlop={8}
            accessibilityLabel="Clear date"
          >
            <Ionicons name="close-circle" size={18} color={Colors.outline} />
          </Pressable>
        ) : null}
      </Pressable>

      {helperText ? (
        <Text style={[styles.helper, { color: Colors.onSurfaceVariant }]}>{helperText}</Text>
      ) : null}

      {show && (
        <DateTimePicker
          value={fromISO(value) ?? new Date(2000, 0, 1)}
          mode="date"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          maximumDate={new Date()}
          onChange={handleChange}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  label: {
    fontFamily: FontFamily.bodyMedium,
    fontSize: 13,
    lineHeight: 18,
    marginBottom: Spacing[2],
  },
  inputContainer: {
    borderRadius: Radius.lg,
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing[4],
  },
  leftIcon: {
    marginRight: Spacing[3],
  },
  value: {
    flex: 1,
    fontFamily: FontFamily.body,
    fontSize: 15,
    lineHeight: 22,
    paddingVertical: 14,
  },
  helper: {
    fontFamily: FontFamily.body,
    fontSize: 12,
    lineHeight: 16,
    marginTop: 6,
    paddingLeft: 2,
  },
});
