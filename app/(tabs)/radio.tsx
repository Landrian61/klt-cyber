import { useState, useCallback } from 'react';
import { ScrollView, View, Text, TextInput, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { Colors, FontFamily, Spacing, Radius } from '@/constants/theme';

// Placeholder schedule data
const SCHEDULE = [
  { day: 'SUNDAY, 6 APR', title: 'Morning Glory', host: 'Pastor James', time: '7:00 AM – 8:30 AM' },
  { day: 'TUESDAY, 8 APR', title: 'Word Encounter', host: 'Elder Sarah', time: '7:00 PM – 8:00 PM' },
  { day: 'FRIDAY, 11 APR', title: 'Night of Worship', host: 'Music Ministry', time: '8:00 PM – 10:00 PM' },
];

export default function RadioScreen() {
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
        <Text style={styles.title}>Reign Radio</Text>
      </View>

      {/* Idle player card */}
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
        <Text style={styles.sectionLabel}>PROGRAM SCHEDULE</Text>
        {SCHEDULE.map((item, index) => (
          <View key={index} style={styles.scheduleItem}>
            <Text style={styles.scheduleDay}>{item.day}</Text>
            <Text style={styles.scheduleTitle}>{item.title}</Text>
            <Text style={styles.scheduleHost}>{item.host}</Text>
            <Text style={styles.scheduleTime}>{item.time}</Text>
          </View>
        ))}
      </View>

      {/* My Notes */}
      <View style={[styles.section, { marginTop: Spacing[6] }]}>
        <View style={styles.notesHeader}>
          <Text style={styles.notesLabel}>My notes</Text>
          {saved && <Text style={styles.savedIndicator}>Saved ✓</Text>}
        </View>
        <TextInput
          style={styles.notesInput}
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
    color: Colors.onSurface,
  },
  section: {
    paddingHorizontal: Spacing[5],
    marginTop: Spacing[5],
  },
  // Idle card
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
    color: Colors.outline,
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
    color: Colors.outline,
    letterSpacing: 0.4,
  },
  scheduleTitle: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 14,
    lineHeight: 22.4,
    color: Colors.onSurface,
    marginTop: 2,
  },
  scheduleHost: {
    fontFamily: FontFamily.body,
    fontSize: 12,
    lineHeight: 18,
    color: Colors.onSurfaceVariant,
    marginTop: 3,
  },
  scheduleTime: {
    fontFamily: FontFamily.bodyMedium,
    fontSize: 12,
    lineHeight: 18,
    color: Colors.primary,
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
    color: Colors.onSurface,
  },
  savedIndicator: {
    fontFamily: FontFamily.body,
    fontSize: 11,
    lineHeight: 15.4,
    color: Colors.success,
  },
  notesInput: {
    backgroundColor: Colors.surfaceLow,
    borderRadius: Radius.md,
    padding: Spacing[3],
    height: 120,
    fontFamily: FontFamily.body,
    fontSize: 14,
    lineHeight: 22.4,
    color: Colors.onSurface,
  },
});
