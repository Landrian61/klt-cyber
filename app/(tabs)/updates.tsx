import { ScrollView, View, Text, StyleSheet } from 'react-native';

import { FontFamily, Spacing } from '@/constants/theme';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

// Placeholder announcements
const PRIORITY_ANNOUNCEMENTS = [
  {
    id: 'p1',
    title: 'Easter Convention 2026',
    body: 'The annual Easter Convention will be held from April 17-19. All members are encouraged to register early and invite friends and family.',
    date: '2 April 2026',
  },
];

const ALL_ANNOUNCEMENTS = [
  {
    id: 'a1',
    title: 'Sunday service time change',
    body: 'Please note that Sunday service will start at 9:30 AM beginning next week.',
    date: '1 Apr',
    category: 'General',
  },
  {
    id: 'a2',
    title: 'Youth conference registration',
    body: 'Registration for the annual youth conference is now open. Limited spots available.',
    date: '30 Mar',
    category: 'Youth',
  },
  {
    id: 'a3',
    title: 'Building fund update',
    body: 'We are pleased to report that we have reached 75% of our building fund target. Thank you for your generosity.',
    date: '28 Mar',
    category: 'Finance',
  },
];

export default function UpdatesScreen() {
  const Colors = useThemeColors();

  return (
    <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
      {/* Title */}
      <View style={styles.titleArea}>
        <Text style={[styles.title, { color: Colors.onSurface }]}>Updates</Text>
      </View>

      {/* Priority announcements */}
      {PRIORITY_ANNOUNCEMENTS.length > 0 && (
        <View style={styles.section}>
          <Text style={[styles.sectionLabel, { color: Colors.outline }]}>PINNED</Text>
          {PRIORITY_ANNOUNCEMENTS.map((item) => (
            <Card key={item.id} variant="priority" style={styles.priorityCard}>
              <View style={styles.priorityHeader}>
                <Text style={[styles.priorityTitle, { color: Colors.onSurface }]}>{item.title}</Text>
                <Badge label="Priority" variant="priority" />
              </View>
              <Text style={[styles.priorityBody, { color: Colors.onSurfaceVariant }]} numberOfLines={3}>
                {item.body}
              </Text>
              <View style={styles.priorityFooter}>
                <Text style={[styles.dateText, { color: Colors.outline }]}>{item.date}</Text>
                <Button label="Read more" variant="textLink" onPress={() => {}} />
              </View>
            </Card>
          ))}
        </View>
      )}

      {/* All announcements */}
      <View style={[styles.section, { marginTop: Spacing[6] }]}>
        <Text style={[styles.sectionLabel, { color: Colors.outline }]}>ALL ANNOUNCEMENTS</Text>
        {ALL_ANNOUNCEMENTS.map((item) => (
          <Card key={item.id} variant="editorial" style={styles.announcementCard}>
            <View style={styles.announcementHeader}>
              <Text style={[styles.announcementTitle, { color: Colors.onSurface }]}>{item.title}</Text>
              {item.category && (
                <Badge label={item.category} variant="member" />
              )}
            </View>
            <Text style={[styles.announcementBody, { color: Colors.onSurfaceVariant }]} numberOfLines={2}>
              {item.body}
            </Text>
            <Text style={[styles.dateText, { color: Colors.outline }]}>{item.date}</Text>
          </Card>
        ))}
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
  sectionLabel: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 11,
    lineHeight: 15.4,
    letterSpacing: 0.6,
    marginBottom: Spacing[3],
  },
  // Priority card
  priorityCard: {
    marginBottom: Spacing[3],
  },
  priorityHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  priorityTitle: {
    fontFamily: FontFamily.bodyBold,
    fontSize: 16,
    lineHeight: 24,
    flex: 1,
    marginRight: Spacing[2],
  },
  priorityBody: {
    fontFamily: FontFamily.body,
    fontSize: 14,
    lineHeight: 22.4,
    marginTop: Spacing[2],
  },
  priorityFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: Spacing[3],
  },
  // Announcement card
  announcementCard: {
    marginBottom: Spacing[3],
  },
  announcementHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  announcementTitle: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 14,
    lineHeight: 22.4,
    flex: 1,
    marginRight: Spacing[2],
  },
  announcementBody: {
    fontFamily: FontFamily.body,
    fontSize: 12,
    lineHeight: 18,
    marginTop: Spacing[2],
  },
  dateText: {
    fontFamily: FontFamily.body,
    fontSize: 11,
    lineHeight: 15.4,
    marginTop: Spacing[2],
  },
});
