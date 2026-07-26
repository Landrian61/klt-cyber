import { useState } from 'react';
import { View, Text, Pressable, Switch, Platform, StyleSheet } from 'react-native';
import DateTimePicker, {
  type DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';

import { FontFamily, Spacing, Radius } from '@/constants/theme';
import { useThemeColors } from '@/hooks/use-theme-colors';

/** Day + month are captured together; year is independently optional. */
export interface DobValue {
  day: number; // 1–31
  month: number; // 1–12
  year?: number; // omitted when the member declines to share
}

export interface DobFieldProps {
  label: string;
  value?: DobValue;
  onChange: (value: DobValue | undefined) => void;
  helperText?: string;
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function formatDob(v: DobValue): string {
  const month = MONTHS[v.month - 1] ?? '';
  return v.year ? `${v.day} ${month} ${v.year}` : `${v.day} ${month}`;
}

/**
 * Date-of-birth control (docs/Profile-completion-mobile.md, Step 1). Standard
 * native pickers assume a complete date, but here the birth year is optional:
 * someone may share their birthday and decline the year. So the native picker
 * captures a full day/month/year, and a separate "Include birth year" toggle
 * decides whether the year is carried through — day + month always move
 * together, year independently.
 */
export function DobField({ label, value, onChange, helperText }: DobFieldProps) {
  const Colors = useThemeColors();
  const [show, setShow] = useState(false);
  // Remember the last full date picked so toggling the year back on restores it
  // rather than forcing a re-pick.
  const [pickedYear, setPickedYear] = useState<number>(value?.year ?? 2000);

  const includeYear = value?.year !== undefined;

  const handlePicked = (event: DateTimePickerEvent, date?: Date) => {
    if (Platform.OS !== 'ios') setShow(false);
    if (event.type === 'set' && date) {
      const year = date.getFullYear();
      setPickedYear(year);
      onChange({
        day: date.getDate(),
        month: date.getMonth() + 1,
        // Preserve the user's current year preference across re-picks.
        ...(includeYear || !value ? { year } : {}),
      });
    }
  };

  const toggleYear = (next: boolean) => {
    if (!value) return; // nothing set yet — the toggle is inert
    if (next) onChange({ ...value, year: pickedYear });
    else onChange({ day: value.day, month: value.month });
  };

  const baseDate = new Date(value?.year ?? pickedYear, value ? value.month - 1 : 0, value?.day ?? 1);

  return (
    <View style={styles.container}>
      <Text style={[styles.label, { color: Colors.onSurface }]}>{label}</Text>

      <Pressable
        onPress={() => setShow(true)}
        style={[styles.field, { backgroundColor: Colors.surfaceLowest }]}
        accessibilityRole="button"
        accessibilityLabel={`${label}${value ? `, ${formatDob(value)}` : ''}`}
      >
        <Ionicons
          name="gift-outline"
          size={18}
          color={value ? Colors.primary : Colors.outline}
          style={styles.leftIcon}
        />
        <Text style={[styles.value, { color: value ? Colors.onSurface : Colors.outline }]}>
          {value ? formatDob(value) : 'Add your birthday'}
        </Text>
        {value ? (
          <Pressable onPress={() => onChange(undefined)} hitSlop={8} accessibilityLabel="Clear date of birth">
            <Ionicons name="close-circle" size={18} color={Colors.outline} />
          </Pressable>
        ) : null}
      </Pressable>

      {value ? (
        <View style={styles.yearRow}>
          <Text style={[styles.yearLabel, { color: Colors.onSurfaceVariant }]}>
            Include birth year
          </Text>
          <Switch
            value={includeYear}
            onValueChange={toggleYear}
            trackColor={{ false: Colors.surfaceHigh, true: Colors.primaryFixedDim }}
            thumbColor={includeYear ? Colors.primary : Colors.surfaceLowest}
          />
        </View>
      ) : null}

      {helperText ? (
        <Text style={[styles.helper, { color: Colors.onSurfaceVariant }]}>{helperText}</Text>
      ) : null}

      {show && (
        <DateTimePicker
          value={baseDate}
          mode="date"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          maximumDate={new Date()}
          onChange={handlePicked}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { width: '100%' },
  label: {
    fontFamily: FontFamily.bodyMedium,
    fontSize: 13,
    lineHeight: 18,
    marginBottom: Spacing[2],
  },
  field: {
    borderRadius: Radius.lg,
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing[4],
  },
  leftIcon: { marginRight: Spacing[3] },
  value: {
    flex: 1,
    fontFamily: FontFamily.body,
    fontSize: 15,
    lineHeight: 22,
    paddingVertical: 14,
  },
  yearRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: Spacing[3],
    paddingHorizontal: Spacing[1],
  },
  yearLabel: {
    fontFamily: FontFamily.bodyMedium,
    fontSize: 14,
    lineHeight: 22.4,
  },
  helper: {
    fontFamily: FontFamily.body,
    fontSize: 12,
    lineHeight: 16,
    marginTop: 6,
    paddingLeft: 2,
  },
});
