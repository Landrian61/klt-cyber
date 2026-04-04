import { useState, useCallback } from 'react';
import { ScrollView, View, Text, TextInput, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { FontFamily, Spacing, Radius } from '@/constants/theme';
import { useThemeColors } from '@/hooks/use-theme-colors';

// Placeholder schedule data
const SCHEDULE = [
  { day: 'SUNDAY, 6 APR', title: 'Morning Glory', host: 'Pastor James', time: '7:00 AM – 8:30 AM' },
  { day: 'TUESDAY, 8 APR', title: 'Word Encounter', host: 'Elder Sarah', time: '7:00 PM – 8:00 PM' },
  { day: 'FRIDAY, 11 APR', title: 'Night of Worship', host: 'Music Ministry', time: '8:00 PM – 10:00 PM' },
];

export default function RadioScreen() {
  const Colors = useThemeColors();
  const [notes, setNotes] = useState('');
  const [saved, setSaved] = useState(false);

  const handleNotesChange = useCallback((text: string) => {
    setNotes(text);
    setSaved(false);
    // Auto-save debounce
    const timeout = setTimeout(() => setSaved(true), 1000);
    return () => clearTimeout(timeout);
  }, []);

  return (
    <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
      {/* Title */}
      <View style={styles.titleArea}>
        <Text style={[styles.title, { color: Colors.onSurface }]}>Reign Radio</Text>
      </View>

      {/* Idle player card — hardcoded #2C1F0E is intentional */}
      <View style={styles.section}>
        <View style={styles.idleCard}>
          <Ionicons name="radio" size={56} color="rgba(255,255,255,0.3)" />
          <Text style={styles.idleTitle}>No broadcast currently live</Text>
          <Text style={styles.idleSubtitle}>
            See the schedule below for the next program.
          </Text>
        </View>
      </View>

      {/* Broadcast Schedule */}
      <View style={[styles.section, { marginTop: Spacing[6] }]}>
        <Text style={[styles.sectionLabel, { color: Colors.outline }]}>PROGRAM SCHEDULE</Text>
        {SCHEDULE.map((item, index) => (
          <View key={index} style={styles.scheduleItem}>
            <Text style={[styles.scheduleDay, { color: Colors.outline }]}>{item.day}</Text>
            <Text style={[styles.scheduleTitle, { color: Colors.onSurface }]}>{item.title}</Text>
            <Text style={[styles.scheduleHost, { color: Colors.onSurfaceVariant }]}>{item.host}</Text>
            <Text style={[styles.scheduleTime, { color: Colors.primary }]}>{item.time}</Text>
          </View>
        ))}
      </View>

      {/* My Notes */}
      <View style={[styles.section, { marginTop: Spacing[6] }]}>
        <View style={styles.notesHeader}>
          <Text style={[styles.notesLabel, { color: Colors.onSurface }]}>My notes</Text>
          {saved && <Text style={[styles.savedIndicator, { color: Colors.success }]}>Saved ✓</Text>}
        </View>
        <TextInput
          style={[styles.notesInput, { backgroundColor: Colors.surfaceLow, color: Colors.onSurface }]}
          value={notes}
          onChangeText={handleNotesChange}
          placeholder="Write your notes — saved automatically."
          placeholderTextColor={Colors.outline}
          multiline
          textAlignVertical="top"
        />
      </View>

      <View style={{ height: Spacing[6] }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
  },
  titleArea: {
    paddingTop: Spacing[5],
    paddingLeft: Spacing[8],
    paddingRight: Spacing[12],
  },
  title: {
    fontFamily: FontFamily.display,
    fontSize: 24,
    lineHeight: 28.8,
  },
  section: {
    paddingHorizontal: Spacing[5],
    marginTop: Spacing[5],
  },
  // Idle card — hardcoded dark background is intentional
  idleCard: {
    backgroundColor: '#2C1F0E',
    borderRadius: Radius.xl,
    padding: Spacing[6],
    alignItems: 'center',
  },
  idleTitle: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 16,
    lineHeight: 24,
    color: '#FFFFFF',
    textAlign: 'center',
    marginTop: Spacing[3],
  },
  idleSubtitle: {
    fontFamily: FontFamily.body,
    fontSize: 12,
    lineHeight: 18,
    color: 'rgba(255,255,255,0.6)',
    textAlign: 'center',
    marginTop: Spacing[1],
  },
  // Schedule
  sectionLabel: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 11,
    lineHeight: 15.4,
    letterSpacing: 0.6,
    marginBottom: Spacing[4],
  },
  scheduleItem: {
    marginBottom: Spacing[4],
  },
  scheduleDay: {
    fontFamily: FontFamily.bodyMedium,
    fontSize: 11,
    lineHeight: 15.4,
    letterSpacing: 0.4,
  },
  scheduleTitle: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 14,
    lineHeight: 22.4,
    marginTop: 2,
  },
  scheduleHost: {
    fontFamily: FontFamily.body,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 3,
  },
  scheduleTime: {
    fontFamily: FontFamily.bodyMedium,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 3,
  },
  // Notes
  notesHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing[3],
  },
  notesLabel: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 16,
    lineHeight: 24,
  },
  savedIndicator: {
    fontFamily: FontFamily.body,
    fontSize: 11,
    lineHeight: 15.4,
  },
  notesInput: {
    borderRadius: Radius.md,
    padding: Spacing[3],
    height: 120,
    fontFamily: FontFamily.body,
    fontSize: 14,
    lineHeight: 22.4,
  },
});
