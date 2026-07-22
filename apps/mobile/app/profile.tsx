import {
  ScrollView, View, Text, StyleSheet, ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from 'convex/react';

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
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function formatDob(v?: { day: number; month: number; year?: number }): string {
  if (!v) return 'Not set';
  const month = MONTHS[v.month - 1] ?? '';
  return v.year ? `${v.day} ${month} ${v.year}` : `${v.day} ${month}`;
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

export default function ProfileScreen() {
  const Colors = useThemeColors();
  const router = useRouter();

  const { user, profile, isMember, isVisitor, isPending, isLoading } = useMyAccount();
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

        {/* Pending verification */}
        {isPending && (
          <View style={styles.cardSection}>
            <Card variant="editorial">
              <Text style={[styles.cardLabel, { color: Colors.outline }]}>UNDER REVIEW</Text>
              <Text style={[styles.bodyText, { color: Colors.onSurfaceVariant }]}>
                Your profile has been submitted and is awaiting verification by a church admin.
                You&apos;ll gain full member access once it&apos;s approved.
              </Text>
              <View style={styles.cta}>
                <Button
                  label="View status"
                  variant="ghost"
                  fullWidth
                  onPress={() => router.push('/profile-completion' as any)}
                />
              </View>
            </Card>
          </View>
        )}

        {/* Member: personal details */}
        {isMember && profile && (
          <View style={styles.cardSection}>
            <Card variant="editorial">
              <Text style={[styles.cardLabel, { color: Colors.outline }]}>PERSONAL DETAILS</Text>
              <DetailRow label="Sex" value={SEX_LABEL[profile.sex] ?? profile.sex} />
              <DetailRow
                label="Marital status"
                value={MARITAL_LABEL[profile.maritalStatus] ?? profile.maritalStatus}
              />
              <DetailRow label="Date of birth" value={formatDob(profile.dateOfBirth)} muted={!profile.dateOfBirth} />
              {profile.shortBio ? <DetailRow label="Bio" value={profile.shortBio} /> : null}
            </Card>
          </View>
        )}

        {/* Member: contact */}
        {isMember && profile && (
          <View style={styles.cardSection}>
            <Card variant="editorial">
              <Text style={[styles.cardLabel, { color: Colors.outline }]}>CONTACT</Text>
              <DetailRow label="Phone" value={profile.phone ?? 'Not set'} muted={!profile.phone} />
              <DetailRow
                label="Address"
                value={formatAddress(profile.address)}
                muted={!profile.address}
              />
            </Card>
          </View>
        )}

        {/* Member: profession */}
        {isMember && profile && hasProfession && (
          <View style={styles.cardSection}>
            <Card variant="editorial">
              <Text style={[styles.cardLabel, { color: Colors.outline }]}>PROFESSION</Text>
              {profile.occupation ? <DetailRow label="Occupation" value={profile.occupation} /> : null}
              {profile.industry ? <DetailRow label="Industry" value={profile.industry} /> : null}
              {profile.employer ? <DetailRow label="Employer" value={profile.employer} /> : null}
              {profile.skills && profile.skills.length > 0 ? (
                <DetailRow label="Skills" value={profile.skills.join(', ')} />
              ) : null}
            </Card>
          </View>
        )}

        {/* Member: service & clan */}
        {isMember && profile && (departmentName || clanName) && (
          <View style={styles.cardSection}>
            <Card variant="editorial">
              <Text style={[styles.cardLabel, { color: Colors.outline }]}>SERVICE & CLAN</Text>
              {departmentName ? <DetailRow label="Department" value={departmentName} /> : null}
              {clanName ? <DetailRow label="Clan" value={clanName} /> : null}
            </Card>
          </View>
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
