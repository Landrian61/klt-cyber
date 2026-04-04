import { ScrollView, View, Text, Pressable, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import {
  Colors, FontFamily, Spacing, Radius, AmbientShadow,
} from '@/constants/theme';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return 'Good morning,';
  if (hour >= 12 && hour < 17) return 'Good afternoon,';
  return 'Good evening,';
}

function getFormattedDate(): string {
  return new Date().toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

// Placeholder data
const MONTHLY_THEME = {
  month: new Date().toLocaleString('en-GB', { month: 'long' }),
  title: 'Walking in Divine Purpose',
  scripture: '"For I know the plans I have for you..." — Jeremiah 29:11',
};

const WEEKLY_ACTIVITIES = [
  { id: '1', name: 'Sunday Service', dayTime: 'Sunday, 10:00 AM', checkedIn: false },
  { id: '2', name: 'Bible Study', dayTime: 'Wednesday, 6:30 PM', checkedIn: false },
  { id: '3', name: 'Prayer Meeting', dayTime: 'Friday, 7:00 PM', checkedIn: false },
];

export default function HomeScreen() {
  const router = useRouter();

  return (
    <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
      {/* Section 1: Greeting */}
      <View style={styles.greeting}>
        <Text style={styles.salutation}>{getGreeting()}</Text>
        <Text style={styles.name}>Welcome</Text>
        <Text style={styles.date}>{getFormattedDate()}</Text>
      </View>

      {/* Section 2: Monthly Theme Card */}
      <View style={styles.section}>
        <Card variant="hero">
          <Text style={styles.themeLabel}>
            THEME FOR {MONTHLY_THEME.month.toUpperCase()}
          </Text>
          <Text style={styles.themeTitle}>{MONTHLY_THEME.title}</Text>
          <Text style={styles.themeScripture}>{MONTHLY_THEME.scripture}</Text>
        </Card>
      </View>

      {/* Section 3: Weekly Activities */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>This week</Text>
        <Button label="See all" variant="textLink" onPress={() => {}} />
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.activitiesRow}
      >
        {WEEKLY_ACTIVITIES.map((activity) => (
          <View key={activity.id} style={[styles.activityCard, AmbientShadow]}>
            <Text style={styles.activityName}>{activity.name}</Text>
            <Text style={styles.activityTime}>{activity.dayTime}</Text>
            <View style={styles.activitySeparator} />
            <Button
              label="Check in"
              variant="primary"
              fullWidth
              onPress={() => {}}
            />
          </View>
        ))}
      </ScrollView>

      {/* Section 4: Scripture */}
      <View style={[styles.section, { marginTop: Spacing[6] }]}>
        <Text style={styles.sectionLabel}>SCRIPTURE</Text>
        <Card variant="editorial" style={styles.scriptureCard}>
          <Text style={styles.scriptureText}>
            {'"For I know the plans I have for you," declares the Lord, "plans to prosper you and not to harm you, plans to give you hope and a future."'}
          </Text>
          <Text style={styles.scriptureRef}>Jeremiah 29:11 (NIV)</Text>
        </Card>
      </View>

      {/* Section 5: Upcoming Events */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Upcoming events</Text>
        <Button label="See all" variant="textLink" onPress={() => {}} />
      </View>
      <View style={styles.section}>
        <View style={styles.emptyState}>
          <Ionicons name="calendar-outline" size={40} color={Colors.outline} />
          <Text style={styles.emptyTitle}>No upcoming events</Text>
          <Text style={styles.emptySubtitle}>Check back soon for new events</Text>
        </View>
      </View>

      {/* Section 6: Join the Ministry */}
      <View style={styles.section}>
        <View style={styles.ministryCard}>
          <View style={styles.ministryRow}>
            <Ionicons name="people" size={24} color={Colors.primary} />
            <View style={styles.ministryText}>
              <Text style={styles.ministryTitle}>Become a member</Text>
              <Text style={styles.ministrySubtitle}>Connect, grow and serve with us.</Text>
            </View>
          </View>
          <Button
            label="Express interest"
            variant="ghost"
            fullWidth
            onPress={() => {}}
          />
        </View>
      </View>

      {/* Section 7: Giving Shortcut */}
      <View style={[styles.section, { marginTop: Spacing[1] }]}>
        <Pressable
          style={[styles.givingCard, AmbientShadow]}
          onPress={() => router.push('/giving')}
          accessibilityLabel="Give to the ministry"
        >
          <Ionicons name="heart" size={22} color={Colors.primary} />
          <Text style={styles.givingText}>Give to the ministry</Text>
          <Ionicons name="chevron-forward" size={20} color={Colors.outline} />
        </Pressable>
      </View>

      <View style={{ height: Spacing[6] }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
  },
  greeting: {
    paddingTop: Spacing[5],
    paddingLeft: Spacing[8],
    paddingRight: Spacing[12],
  },
  salutation: {
    fontFamily: FontFamily.body,
    fontSize: 14,
    lineHeight: 22.4,
    color: Colors.onSurfaceVariant,
  },
  name: {
    fontFamily: FontFamily.display,
    fontSize: 24,
    lineHeight: 28.8,
    color: Colors.onSurface,
    marginTop: 2,
  },
  date: {
    fontFamily: FontFamily.body,
    fontSize: 12,
    lineHeight: 18,
    color: Colors.outline,
    marginTop: Spacing[1],
  },
  section: {
    paddingHorizontal: Spacing[5],
    marginTop: Spacing[5],
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing[5],
    marginTop: Spacing[6],
  },
  sectionTitle: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 16,
    lineHeight: 24,
    color: Colors.onSurface,
  },
  sectionLabel: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 11,
    lineHeight: 15.4,
    color: Colors.outline,
    letterSpacing: 0.6,
    marginBottom: Spacing[3],
  },
  // Theme card
  themeLabel: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 11,
    lineHeight: 15.4,
    color: 'rgba(255,255,255,0.65)',
    letterSpacing: 0.8,
  },
  themeTitle: {
    fontFamily: FontFamily.display,
    fontSize: 24,
    lineHeight: 28.8,
    color: '#FFFFFF',
    marginTop: 6,
  },
  themeScripture: {
    fontFamily: FontFamily.display,
    fontSize: 12,
    lineHeight: 18,
    fontStyle: 'italic',
    color: 'rgba(255,255,255,0.80)',
    marginTop: Spacing[1],
  },
  // Activities
  activitiesRow: {
    paddingLeft: Spacing[5],
    paddingRight: Spacing[3],
    gap: Spacing[3],
    marginTop: Spacing[3],
  },
  activityCard: {
    width: 210,
    backgroundColor: Colors.surfaceLowest,
    borderRadius: Radius.lg,
    padding: Spacing[4],
  },
  activityName: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 16,
    lineHeight: 24,
    color: Colors.onSurface,
  },
  activityTime: {
    fontFamily: FontFamily.body,
    fontSize: 12,
    lineHeight: 18,
    color: Colors.onSurfaceVariant,
    marginTop: Spacing[1],
  },
  activitySeparator: {
    height: 1,
    backgroundColor: Colors.surfaceHigh,
    marginVertical: Spacing[3],
  },
  // Scripture
  scriptureCard: {
    padding: Spacing[5],
  },
  scriptureText: {
    fontFamily: FontFamily.display,
    fontSize: 20,
    lineHeight: 28,
    color: Colors.onSurface,
  },
  scriptureRef: {
    fontFamily: FontFamily.body,
    fontSize: 12,
    lineHeight: 18,
    color: Colors.onSurfaceVariant,
    marginTop: Spacing[3],
  },
  // Empty state
  emptyState: {
    alignItems: 'center',
    paddingVertical: Spacing[8],
  },
  emptyTitle: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 16,
    lineHeight: 24,
    color: Colors.onSurfaceVariant,
    marginTop: Spacing[3],
  },
  emptySubtitle: {
    fontFamily: FontFamily.body,
    fontSize: 12,
    lineHeight: 18,
    color: Colors.outline,
    marginTop: Spacing[1],
  },
  // Ministry
  ministryCard: {
    backgroundColor: Colors.surfaceLow,
    borderRadius: Radius.lg,
    padding: Spacing[4],
  },
  ministryRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing[3],
    marginBottom: Spacing[4],
  },
  ministryText: {
    flex: 1,
  },
  ministryTitle: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 16,
    lineHeight: 24,
    color: Colors.onSurface,
  },
  ministrySubtitle: {
    fontFamily: FontFamily.body,
    fontSize: 12,
    lineHeight: 18,
    color: Colors.onSurfaceVariant,
    marginTop: Spacing[1],
  },
  // Giving
  givingCard: {
    backgroundColor: Colors.surfaceLowest,
    borderRadius: Radius.lg,
    padding: Spacing[4],
    flexDirection: 'row',
    alignItems: 'center',
  },
  givingText: {
    fontFamily: FontFamily.bodyMedium,
    fontSize: 14,
    lineHeight: 22.4,
    color: Colors.onSurface,
    flex: 1,
    marginLeft: Spacing[3],
  },
});
