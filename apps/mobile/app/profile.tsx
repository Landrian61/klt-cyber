import {
  ScrollView, View, Text, StyleSheet, ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from 'convex/react';
import Animated, { FadeInUp, useReducedMotion } from 'react-native-reanimated';

import {
  FontFamily, Spacing, GoldGradient, AmbientShadow,
} from '@/constants/theme';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { Button } from '@/components/ui/button';
import { Badge, type BadgeVariant } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { authClient } from '@/lib/auth';
import { api } from '@/lib/api';
import { useMyAccount } from '@/hooks/use-my-account';
import { getDisplayName, getInitials } from '@/lib/user-display';

const SEX_LABEL: Record<string, string> = { male: 'Male', female: 'Female' };
const MARITAL_LABEL: Record<string, string> = {
  single: 'Single', married: 'Married', widowed: 'Widowed', divorced: 'Divorced',
};
const LEVEL_LABEL: Record<string, string> = {
  level_1: 'Level 1', level_2: 'Level 2', advanced: 'Advanced',
};
const LEAD_STATUS_LABEL: Record<string, string> = {
  in_progress: 'In Progress', completed: 'Completed',
};
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function formatDob(v?: { day: number; month: number; year?: number }): string {
  if (!v) return 'Not set';
  const month = MONTHS[v.month - 1] ?? '';
  return v.year ? `${v.day} ${month} ${v.year}` : `${v.day} ${month}`;
}

function formatMsDate(ms?: number): string {
  if (!ms) return '';
  return new Date(ms).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

function formatAddress(a?: {
  line1: string; city?: string; district?: string; country?: string;
}): string {
  if (!a) return 'Not set';
  return [a.line1, a.city, a.district, a.country].filter(Boolean).join(', ');
}

function DetailRow({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  const Colors = useThemeColors();
  return (
    <View style={styles.detailRow}>
      <Text style={[styles.detailLabel, { color: Colors.outline }]}>{label.toUpperCase()}</Text>
      <Text style={[styles.detailValue, { color: muted ? Colors.outline : Colors.onSurface }]}>
        {value}
      </Text>
    </View>
  );
}

/** A titled detail card with a staggered, UI-thread entrance. */
function DetailCard({ title, delay, children }: { title: string; delay: number; children: React.ReactNode }) {
  const Colors = useThemeColors();
  const reduceMotion = useReducedMotion();
  return (
    <Animated.View
      entering={reduceMotion ? undefined : FadeInUp.duration(320).delay(delay)}
      style={styles.cardSection}
    >
      <Card variant="editorial">
        <Text style={[styles.cardLabel, { color: Colors.outline }]}>{title}</Text>
        {children}
      </Card>
    </Animated.View>
  );
}

export default function ProfileScreen() {
  const Colors = useThemeColors();
  const router = useRouter();

  const { user, profile, isMember, isVisitor, isPending, isLoading } = useMyAccount();
  // Richer profile (children + leadership) for the read-only preview. Resolves
  // null for visitors with no profile; undefined while loading.
  const myProfile = useQuery(api.profile.getMyProfile);
  const clans = useQuery(api.clans.listClans);
  const departments = useQuery(api.departments.listActiveDepartments);

  const signOut = async () => {
    // Clears the secure-store session; the root auth gate redirects to (auth).
    await authClient.signOut();
  };

  if (isLoading) {
    return (
      <SafeAreaView style={[styles.safe, styles.center, { backgroundColor: Colors.surface }]}>
        <ActivityIndicator size="small" color={Colors.primary} />
      </SafeAreaView>
    );
  }

  const displayName = getDisplayName(user) || 'Welcome';
  const initials = getInitials(user);
  const roleBadge: { label: string; variant: BadgeVariant } = isMember
    ? { label: 'Member', variant: 'member' }
    : isPending
      ? { label: 'Pending review', variant: 'pending' }
      : { label: 'Visitor', variant: 'visitor' };

  const clanName = clans?.find((c) => c._id === profile?.clanId)?.name;
  const departmentName = departments?.find((d) => d._id === profile?.departmentId)?.name;
  const hasProfession =
    !!profile?.occupation || !!profile?.industry || !!profile?.employer || (profile?.skills?.length ?? 0) > 0;

  const children = myProfile?.children ?? [];
  const leadership = myProfile?.leadershipProgress ?? [];
  const isMarried = profile?.maritalStatus === 'married';
  const spouseValue = profile?.spouseNameUnlinked
    ? profile.spouseNameUnlinked
    : profile?.spouseUserId
      ? 'Linked church member'
      : 'Not provided';
  const hasFamily = isMarried || children.length > 0 || !!profile?.nextOfKin;

  // The full read-only preview is shown to anyone who has submitted — pending or
  // verified. (The gate flags remain role-based: pending users aren't members.)
  const showProfile = !!profile;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: Colors.surface }]} edges={['top']}>
      <View style={styles.headerBar}>
        <Button
          variant="icon"
          onPress={() => router.back()}
          accessibilityLabel="Go back"
          icon={<Ionicons name="arrow-back" size={24} color={Colors.onSurface} />}
        />
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Hero */}
        <LinearGradient colors={[Colors.primaryLight, Colors.surface]} style={styles.heroGradient}>
          {user?.profilePictureUrl ? (
            <Image source={{ uri: user.profilePictureUrl }} style={styles.avatarImage} contentFit="cover" />
          ) : (
            <LinearGradient
              colors={[...GoldGradient.colors]}
              start={GoldGradient.start}
              end={GoldGradient.end}
              style={[styles.avatar, AmbientShadow]}
            >
              <Text style={styles.avatarText}>{initials}</Text>
            </LinearGradient>
          )}
          <Text style={[styles.heroName, { color: Colors.onSurface }]}>{displayName}</Text>
          {!!user?.email && (
            <Text style={[styles.heroEmail, { color: Colors.onSurfaceVariant }]}>{user.email}</Text>
          )}
          <View style={styles.heroBadge}>
            <Badge label={roleBadge.label} variant={roleBadge.variant} />
          </View>
        </LinearGradient>

        {/* Visitor: prompt to complete profile */}
        {isVisitor && !isPending && (
          <View style={styles.cardSection}>
            <Card variant="editorial">
              <Text style={[styles.cardLabel, { color: Colors.outline }]}>MEMBER PROFILE</Text>
              <Text style={[styles.bodyText, { color: Colors.onSurfaceVariant }]}>
                You&apos;re not yet part of the KLT Church family. Complete your member profile —
                it takes a few minutes and unlocks the full community.
              </Text>
              <View style={styles.cta}>
                <Button
                  label="Complete your profile"
                  variant="primary"
                  fullWidth
                  onPress={() => router.push('/profile-completion' as any)}
                />
              </View>
            </Card>
          </View>
        )}

        {/* Pending: a status note above the read-only preview below */}
        {isPending && (
          <View style={styles.cardSection}>
            <View style={[styles.pendingBanner, { backgroundColor: Colors.primaryLight }]}>
              <Ionicons name="hourglass-outline" size={20} color={Colors.primary} />
              <Text style={[styles.pendingText, { color: Colors.onSurface }]}>
                Your profile is under review. Here&apos;s everything you submitted — a church admin
                will verify it, and you&apos;ll gain full member access once it&apos;s approved.
              </Text>
            </View>
          </View>
        )}

        {/* Read-only preview — shown to pending and verified members alike */}
        {showProfile && profile && (
          <>
            <DetailCard title="PERSONAL DETAILS" delay={40}>
              <DetailRow label="Sex" value={SEX_LABEL[profile.sex] ?? profile.sex} />
              <DetailRow
                label="Marital status"
                value={MARITAL_LABEL[profile.maritalStatus] ?? profile.maritalStatus}
              />
              <DetailRow label="Date of birth" value={formatDob(profile.dateOfBirth)} muted={!profile.dateOfBirth} />
              {profile.shortBio ? <DetailRow label="Bio" value={profile.shortBio} /> : null}
            </DetailCard>

            <DetailCard title="CONTACT" delay={80}>
              <DetailRow label="Phone" value={profile.phone ?? 'Not set'} muted={!profile.phone} />
              <DetailRow label="Address" value={formatAddress(profile.address)} muted={!profile.address} />
            </DetailCard>

            {hasFamily && (
              <DetailCard title="FAMILY" delay={120}>
                {isMarried && <DetailRow label="Spouse" value={spouseValue} muted={spouseValue === 'Not provided'} />}
                {isMarried && profile.anniversaryDate ? (
                  <DetailRow label="Anniversary" value={formatMsDate(profile.anniversaryDate)} />
                ) : null}
                {children.length > 0
                  ? children.map((c) => (
                      <DetailRow
                        key={c._id}
                        label={`Child — ${c.name}`}
                        value={SEX_LABEL[c.sex] ?? c.sex}
                      />
                    ))
                  : null}
                {profile.nextOfKin ? (
                  <DetailRow
                    label="Next of kin"
                    value={`${profile.nextOfKin.fullName} · ${profile.nextOfKin.relationship}`}
                  />
                ) : null}
              </DetailCard>
            )}

            <DetailCard title="MENTORSHIP" delay={160}>
              <DetailRow label="Status" value="Completed" />
              <DetailRow
                label="Certificate"
                value={profile.mentorshipProofUrl ? 'Uploaded' : 'Not uploaded'}
                muted={!profile.mentorshipProofUrl}
              />
            </DetailCard>

            {leadership.length > 0 && (
              <DetailCard title="LEADERSHIP" delay={200}>
                {leadership.map((e) => (
                  <DetailRow
                    key={e._id}
                    label={LEVEL_LABEL[e.level] ?? e.level}
                    value={LEAD_STATUS_LABEL[e.status] ?? e.status}
                  />
                ))}
              </DetailCard>
            )}

            {(departmentName || clanName) && (
              <DetailCard title="SERVICE & CLAN" delay={240}>
                {departmentName ? <DetailRow label="Department" value={departmentName} /> : null}
                {clanName ? <DetailRow label="Clan" value={clanName} /> : null}
              </DetailCard>
            )}

            {hasProfession && (
              <DetailCard title="PROFESSION" delay={280}>
                {profile.occupation ? <DetailRow label="Occupation" value={profile.occupation} /> : null}
                {profile.industry ? <DetailRow label="Industry" value={profile.industry} /> : null}
                {profile.employer ? <DetailRow label="Employer" value={profile.employer} /> : null}
                {profile.skills && profile.skills.length > 0 ? (
                  <DetailRow label="Skills" value={profile.skills.join(', ')} />
                ) : null}
              </DetailCard>
            )}
          </>
        )}

        {/* Actions */}
        <View style={styles.actions}>
          <Button label="Sign out" variant="destructive" fullWidth onPress={signOut} />
        </View>

        <View style={{ height: Spacing[10] }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center' },
  headerBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    minHeight: 44,
    paddingHorizontal: Spacing[2],
  },
  heroGradient: {
    height: 220,
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
  avatarImage: {
    width: 88,
    height: 88,
    borderRadius: 44,
    borderWidth: 3,
    borderColor: '#FFFFFF',
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
  heroEmail: {
    fontFamily: FontFamily.body,
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
    marginTop: 2,
  },
  heroBadge: { marginTop: Spacing[3] },
  cardSection: {
    paddingHorizontal: Spacing[5],
    marginTop: Spacing[3],
  },
  pendingBanner: {
    flexDirection: 'row',
    gap: Spacing[3],
    alignItems: 'flex-start',
    borderRadius: 12,
    padding: Spacing[4],
  },
  pendingText: {
    flex: 1,
    fontFamily: FontFamily.body,
    fontSize: 13,
    lineHeight: 20,
  },
  cardLabel: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 11,
    lineHeight: 15.4,
    letterSpacing: 0.5,
    marginBottom: Spacing[3],
  },
  detailRow: { marginBottom: Spacing[3] },
  detailLabel: {
    fontFamily: FontFamily.body,
    fontSize: 11,
    lineHeight: 15.4,
    letterSpacing: 0.5,
  },
  detailValue: {
    fontFamily: FontFamily.bodyMedium,
    fontSize: 14,
    lineHeight: 22.4,
    marginTop: 2,
  },
  bodyText: {
    fontFamily: FontFamily.body,
    fontSize: 14,
    lineHeight: 22.4,
  },
  cta: { marginTop: Spacing[4] },
  actions: {
    paddingHorizontal: Spacing[5],
    marginTop: Spacing[6],
  },
});
