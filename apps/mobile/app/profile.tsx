import { ScrollView, View, Text, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';

import {
  FontFamily, Spacing, Radius, GoldGradient, AmbientShadow,
} from '@/constants/theme';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { authClient } from '@/lib/auth';

// Placeholder profile data
const PROFILE = {
  name: 'Andrew Luswata',
  initials: 'AL',
  clan: 'Hebron',
  badges: ['member'] as const,
  dob: '14 August 1997 (Age 28)',
  sex: 'Male',
  maritalStatus: 'Single',
  departments: ['Media', 'IT'],
  mentorship: { classes: true, baptism: true, ushering: false },
  leadershipLevel: 'Not enrolled',
  profession: '',
  givingThisMonth: 'UGX 250,000',
  givingThisYear: 'UGX 1,500,000',
};

function DetailRow({ label, value }: { label: string; value: string }) {
  const Colors = useThemeColors();
  return (
    <View style={detailStyles.row}>
      <Text style={[detailStyles.label, { color: Colors.outline }]}>{label.toUpperCase()}</Text>
      <Text style={[detailStyles.value, { color: Colors.onSurface }]}>{value}</Text>
    </View>
  );
}

const detailStyles = StyleSheet.create({
  row: { marginBottom: Spacing[3] },
  label: {
    fontFamily: FontFamily.body,
    fontSize: 11,
    lineHeight: 15.4,
    letterSpacing: 0.5,
  },
  value: {
    fontFamily: FontFamily.bodyMedium,
    fontSize: 14,
    lineHeight: 22.4,
    marginTop: 2,
  },
});

export default function ProfileScreen() {
  const Colors = useThemeColors();
  const router = useRouter();

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: Colors.surface }]} edges={['top']}>
      {/* Header bar */}
      <View style={styles.headerBar}>
        <Button
          variant="icon"
          onPress={() => router.back()}
          accessibilityLabel="Go back"
          icon={<Ionicons name="arrow-back" size={24} color={Colors.onSurface} />}
        />
        <Button
          variant="icon"
          onPress={() => {}}
          accessibilityLabel="Edit profile"
          icon={<Ionicons name="pencil" size={20} color={Colors.primary} />}
        />
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Hero section */}
        <LinearGradient
          colors={[Colors.primaryLight, Colors.surface]}
          style={styles.heroGradient}
        >
          <LinearGradient
            colors={[...GoldGradient.colors]}
            start={GoldGradient.start}
            end={GoldGradient.end}
            style={[styles.avatar, AmbientShadow]}
          >
            <Text style={styles.avatarText}>{PROFILE.initials}</Text>
          </LinearGradient>
          <Text style={[styles.heroName, { color: Colors.onSurface }]}>{PROFILE.name}</Text>
          <Text style={[styles.heroClan, { color: Colors.onSurfaceVariant }]}>{PROFILE.clan}</Text>
        </LinearGradient>

        {/* Badges */}
        <View style={styles.badgesRow}>
          {PROFILE.badges.map((b) => (
            <Badge key={b} label={b.charAt(0).toUpperCase() + b.slice(1)} variant={b as any} />
          ))}
        </View>

        {/* Card 1: Personal Details */}
        <View style={styles.cardSection}>
          <Card variant="editorial">
            <View style={styles.cardHeader}>
              <Text style={[styles.cardLabel, { color: Colors.outline }]}>PERSONAL DETAILS</Text>
            </View>
            <DetailRow label="Date of birth" value={PROFILE.dob} />
            <DetailRow label="Sex" value={PROFILE.sex} />
            <DetailRow label="Marital status" value={PROFILE.maritalStatus} />
          </Card>
        </View>

        {/* Card 2: Church Involvement */}
        <View style={styles.cardSection}>
          <Card variant="editorial">
            <View style={styles.cardHeader}>
              <Text style={[styles.cardLabel, { color: Colors.outline }]}>CHURCH INVOLVEMENT</Text>
            </View>
            <DetailRow label="Clan" value={PROFILE.clan} />
            <View>
              <Text style={[detailStyles.label, { color: Colors.outline }]}>DEPARTMENTS</Text>
              <View style={styles.deptRow}>
                {PROFILE.departments.map((d) => (
                  <View key={d} style={[styles.deptPill, { backgroundColor: Colors.primaryLight }]}>
                    <Text style={[styles.deptPillText, { color: Colors.primary }]}>{d}</Text>
                  </View>
                ))}
              </View>
            </View>
          </Card>
        </View>

        {/* Card 3: Mentorship Progress */}
        <View style={styles.cardSection}>
          <Card variant="editorial">
            <View style={styles.cardHeader}>
              <Text style={[styles.cardLabel, { color: Colors.outline }]}>MENTORSHIP PROGRESS</Text>
            </View>
            <View style={styles.mentorshipTracker}>
              {(['Classes', 'Baptism', 'Ushering'] as const).map((step, i) => {
                const completed = i === 0 ? PROFILE.mentorship.classes : i === 1 ? PROFILE.mentorship.baptism : PROFILE.mentorship.ushering;
                return (
                  <View key={step} style={styles.mentorshipStep}>
                    <View style={[styles.mentorshipDot, { backgroundColor: completed ? Colors.primary : Colors.warning }]}>
                      {completed ? (
                        <Ionicons name="checkmark" size={12} color="#FFFFFF" />
                      ) : (
                        <Ionicons name="hourglass-outline" size={10} color="#FFFFFF" />
                      )}
                    </View>
                    <Text style={[styles.mentorshipLabel, { color: completed ? Colors.success : Colors.outline }]}>
                      {step}
                    </Text>
                    <Text style={[styles.mentorshipStatus, { color: completed ? Colors.success : Colors.warning }]}>
                      {completed ? 'Complete' : 'In progress'}
                    </Text>
                  </View>
                );
              })}
            </View>
            <Text style={[styles.mentorshipSummary, { color: Colors.onSurfaceVariant }]}>2 of 3 milestones complete</Text>
          </Card>
        </View>

        {/* Card 4: Leadership Institute */}
        <View style={styles.cardSection}>
          <Card variant="editorial">
            <View style={styles.cardHeader}>
              <Text style={[styles.cardLabel, { color: Colors.outline }]}>LEADERSHIP INSTITUTE</Text>
            </View>
            <DetailRow label="Current level" value={PROFILE.leadershipLevel} />
          </Card>
        </View>

        {/* Card 5: Professional */}
        <View style={styles.cardSection}>
          <Card variant="editorial">
            <View style={styles.cardHeader}>
              <Text style={[styles.cardLabel, { color: Colors.outline }]}>PROFESSIONAL INFORMATION</Text>
              <Button label="Add info" variant="textLink" onPress={() => {}} />
            </View>
            <Text style={[styles.emptyCardText, { color: Colors.outline }]}>No professional info added yet.</Text>
          </Card>
        </View>

        {/* Card 6: Giving summary */}
        <View style={styles.cardSection}>
          <Card variant="editorial">
            <View style={styles.cardHeader}>
              <Text style={[styles.cardLabel, { color: Colors.outline }]}>MY GIVING SUMMARY</Text>
            </View>
            <View style={detailStyles.row}>
              <Text style={[detailStyles.label, { color: Colors.outline }]}>THIS MONTH</Text>
              <Text style={[styles.givingAmount, { color: Colors.primary }]}>{PROFILE.givingThisMonth}</Text>
            </View>
            <View style={detailStyles.row}>
              <Text style={[detailStyles.label, { color: Colors.outline }]}>THIS YEAR</Text>
              <Text style={[detailStyles.value, { color: Colors.onSurface }]}>{PROFILE.givingThisYear}</Text>
            </View>
            <View style={styles.givingLink}>
              <Button label="View full giving history →" variant="textLink" onPress={() => router.push('/giving')} />
            </View>
          </Card>
        </View>

        {/* Account actions */}
        <View style={styles.accountActions}>
          <Button
            label="Sign out"
            variant="destructive"
            fullWidth
            onPress={async () => {
              // Clears the secure-store session; the root auth gate then
              // redirects back to the (auth) flow automatically.
              await authClient.signOut();
            }}
          />
          <View style={styles.deleteLink}>
            <Text style={[styles.deleteText, { color: Colors.secondary }]}>Delete my account</Text>
          </View>
        </View>

        <View style={{ height: Spacing[10] }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  headerBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing[2],
  },
  heroGradient: {
    height: 200,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: Spacing[2],
  },
  avatar: {
    width: 88,
    height: 88,
    borderRadius: 44,
    borderWidth: 3,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontFamily: FontFamily.display,
    fontSize: 28,
    color: '#FFFFFF',
  },
  heroName: {
    fontFamily: FontFamily.display,
    fontSize: 24,
    lineHeight: 28.8,
    textAlign: 'center',
    marginTop: Spacing[3],
  },
  heroClan: {
    fontFamily: FontFamily.body,
    fontSize: 14,
    lineHeight: 22.4,
    textAlign: 'center',
    marginTop: Spacing[1],
  },
  badgesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing[2],
    paddingHorizontal: Spacing[5],
    marginTop: Spacing[4],
  },
  cardSection: {
    paddingHorizontal: Spacing[5],
    marginTop: Spacing[3],
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing[3],
  },
  cardLabel: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 11,
    lineHeight: 15.4,
    letterSpacing: 0.5,
  },
  deptRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing[2],
    marginTop: Spacing[2],
    marginBottom: Spacing[3],
  },
  deptPill: {
    borderRadius: Radius.full,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  deptPillText: {
    fontFamily: FontFamily.bodyMedium,
    fontSize: 12,
  },
  // Mentorship
  mentorshipTracker: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: Spacing[4],
  },
  mentorshipStep: {
    alignItems: 'center',
  },
  mentorshipDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mentorshipLabel: {
    fontFamily: FontFamily.body,
    fontSize: 11,
    marginTop: Spacing[1],
  },
  mentorshipStatus: {
    fontFamily: FontFamily.body,
    fontSize: 11,
    marginTop: 2,
  },
  mentorshipSummary: {
    fontFamily: FontFamily.body,
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
  },
  // Giving
  givingAmount: {
    fontFamily: FontFamily.monoBold,
    fontSize: 16,
    lineHeight: 24,
    marginTop: 2,
  },
  givingLink: {
    alignItems: 'flex-end',
  },
  value: {
    fontFamily: FontFamily.bodyMedium,
    fontSize: 14,
    lineHeight: 22.4,
    marginTop: 2,
  },
  // Empty
  emptyCardText: {
    fontFamily: FontFamily.body,
    fontSize: 12,
    lineHeight: 18,
  },
  // Account actions
  accountActions: {
    paddingHorizontal: Spacing[5],
    marginTop: Spacing[6],
  },
  deleteLink: {
    alignItems: 'center',
    marginTop: Spacing[4],
  },
  deleteText: {
    fontFamily: FontFamily.body,
    fontSize: 12,
    lineHeight: 18,
  },
});
