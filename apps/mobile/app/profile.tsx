import { useState } from 'react';
import {
  ScrollView, View, Text, StyleSheet, Pressable, Alert, ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useMutation } from 'convex/react';

import {
  FontFamily, Spacing, Radius, GoldGradient, AmbientShadow,
} from '@/constants/theme';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { Button } from '@/components/ui/button';
import { Badge, type BadgeVariant } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { DateField } from '@/components/ui/date-field';
import { authClient } from '@/lib/auth';
import { api, type Id } from '@/lib/api';
import { useMyAccount } from '@/hooks/use-my-account';
import { getDisplayName, getInitials } from '@/lib/user-display';

const SEX_LABEL: Record<string, string> = { male: 'Male', female: 'Female' };
const MARITAL_LABEL: Record<string, string> = {
  single: 'Single', married: 'Married', widowed: 'Widowed', divorced: 'Divorced',
};
const APPROVAL_BADGE: Record<string, { label: string; variant: BadgeVariant }> = {
  pending: { label: 'Pending review', variant: 'pending' },
  verified: { label: 'Verified', variant: 'confirmed' },
  rejected: { label: 'Not verified', variant: 'ended' },
};

function DetailRow({
  label, value, muted,
}: { label: string; value: string; muted?: boolean }) {
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

  const { user, profile, isMember, isVisitor, isLoading } = useMyAccount();
  const clans = useQuery(api.clans.listClans);
  const updateProfile = useMutation(api.profile.updateProfile);

  // ── Field edit mode ─────────────────────────────────────────────────────────
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [efirst, setEfirst] = useState('');
  const [elast, setElast] = useState('');
  const [ephone, setEphone] = useState('');
  const [eprof, setEprof] = useState('');
  const [edob, setEdob] = useState<string | undefined>(undefined);
  const [eclan, setEclan] = useState<Id<'clans'> | undefined>(undefined);

  const startEdit = () => {
    setEfirst(user?.firstName ?? '');
    setElast(user?.lastName ?? '');
    setEphone(profile?.phone ?? '');
    setEprof(profile?.profession ?? '');
    setEdob(profile?.dateOfBirth);
    setEclan(profile?.clanId);
    setEditing(true);
  };

  const saveEdit = async () => {
    // Omit blank optionals — the shared schema rejects empty strings, and a
    // patch only touches the fields it is given.
    const args: Record<string, unknown> = {};
    if (efirst.trim()) args.firstName = efirst.trim();
    if (elast.trim()) args.lastName = elast.trim();
    if (ephone.trim()) args.phone = ephone.trim();
    if (eprof.trim()) args.profession = eprof.trim();
    if (edob) args.dateOfBirth = edob;
    if (eclan) args.clanId = eclan;
    setSaving(true);
    try {
      await updateProfile(args);
      setEditing(false);
    } catch {
      Alert.alert('Could not save', 'Please try again.');
    } finally {
      setSaving(false);
    }
  };

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
    : { label: 'Visitor', variant: 'visitor' };
  const clanName = clans?.find((c) => c._id === profile?.clanId)?.name;
  const approval = profile?.clanApproval?.status
    ? APPROVAL_BADGE[profile.clanApproval.status]
    : undefined;

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
        {isMember && !editing && (
          <Button
            variant="icon"
            onPress={startEdit}
            accessibilityLabel="Edit profile"
            icon={<Ionicons name="pencil" size={20} color={Colors.primary} />}
          />
        )}
      </View>

      <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
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
        {isVisitor && (
          <View style={styles.cardSection}>
            <Card variant="editorial">
              <Text style={[styles.cardLabel, { color: Colors.outline }]}>MEMBER PROFILE</Text>
              <Text style={[styles.visitorText, { color: Colors.onSurfaceVariant }]}>
                You haven&apos;t completed your member profile yet. It only takes a minute
                and unlocks the full community.
              </Text>
              <View style={styles.visitorCta}>
                <Button
                  label="Complete your profile"
                  variant="primary"
                  fullWidth
                  onPress={() => router.push('/profile-completion/bio' as any)}
                />
              </View>
            </Card>
          </View>
        )}

        {/* Member: identity (edit mode only) */}
        {isMember && editing && (
          <View style={styles.cardSection}>
            <Card variant="editorial">
              <Text style={[styles.cardLabel, { color: Colors.outline }]}>NAME</Text>
              <Input label="First name" value={efirst} onChangeText={setEfirst} autoCapitalize="words" placeholder="First name" />
              <View style={{ height: Spacing[4] }} />
              <Input label="Last name" value={elast} onChangeText={setElast} autoCapitalize="words" placeholder="Last name" />
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
              {editing ? (
                <DateField
                  label="Date of birth"
                  value={edob}
                  onChange={setEdob}
                  placeholder="Add your birthday"
                />
              ) : (
                <DetailRow
                  label="Date of birth"
                  value={profile.dateOfBirth ?? 'Not set'}
                  muted={!profile.dateOfBirth}
                />
              )}
            </Card>
          </View>
        )}

        {/* Member: contact */}
        {isMember && profile && (
          <View style={styles.cardSection}>
            <Card variant="editorial">
              <Text style={[styles.cardLabel, { color: Colors.outline }]}>CONTACT</Text>
              {editing ? (
                <>
                  <Input label="Phone" value={ephone} onChangeText={setEphone} keyboardType="phone-pad" placeholder="+256 700 000 000" />
                  <View style={{ height: Spacing[4] }} />
                  <Input label="Profession" value={eprof} onChangeText={setEprof} autoCapitalize="words" placeholder="e.g. Architect" />
                </>
              ) : (
                <>
                  <DetailRow label="Phone" value={profile.phone ?? 'Not set'} muted={!profile.phone} />
                  <DetailRow label="Profession" value={profile.profession ?? 'Not set'} muted={!profile.profession} />
                </>
              )}
            </Card>
          </View>
        )}

        {/* Member: clan */}
        {isMember && profile && (
          <View style={styles.cardSection}>
            <Card variant="editorial">
              <Text style={[styles.cardLabel, { color: Colors.outline }]}>CLAN AFFILIATION</Text>
              {editing ? (
                <View style={styles.clanGrid}>
                  {(clans ?? []).map((clan) => {
                    const selected = eclan === clan._id;
                    return (
                      <Pressable
                        key={clan._id}
                        onPress={() => setEclan(selected ? undefined : (clan._id as Id<'clans'>))}
                        style={[
                          styles.clanPill,
                          {
                            backgroundColor: selected ? Colors.primaryFixedDim : Colors.surfaceLow,
                            borderColor: selected ? Colors.primary : 'transparent',
                          },
                        ]}
                        accessibilityRole="button"
                        accessibilityState={{ selected }}
                      >
                        <Text style={[styles.clanText, { color: selected ? Colors.primary : Colors.onSurfaceVariant }]}>
                          {clan.name}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              ) : profile.clanId ? (
                <View style={styles.clanRow}>
                  <Text style={[styles.detailValue, { color: Colors.onSurface }]}>
                    {clanName ?? 'Selected clan'}
                  </Text>
                  {approval && <Badge label={approval.label} variant={approval.variant} />}
                </View>
              ) : (
                <Text style={[styles.detailValue, { color: Colors.outline }]}>
                  No clan selected
                </Text>
              )}
            </Card>
          </View>
        )}

        {/* Actions */}
        <View style={styles.actions}>
          {editing ? (
            <>
              <Button label="Save changes" variant="primary" fullWidth loading={saving} onPress={saveEdit} />
              <View style={{ height: Spacing[3] }} />
              <Button label="Cancel" variant="ghost" fullWidth onPress={() => setEditing(false)} />
            </>
          ) : (
            <Button label="Sign out" variant="destructive" fullWidth onPress={signOut} />
          )}
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
  heroBadge: {
    marginTop: Spacing[3],
  },
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
  visitorText: {
    fontFamily: FontFamily.body,
    fontSize: 14,
    lineHeight: 22.4,
  },
  visitorCta: {
    marginTop: Spacing[4],
  },
  clanRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  clanGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing[2],
  },
  clanPill: {
    borderRadius: Radius.full,
    borderWidth: 1.5,
    paddingHorizontal: Spacing[4],
    paddingVertical: Spacing[2],
  },
  clanText: {
    fontFamily: FontFamily.bodyMedium,
    fontSize: 13,
    lineHeight: 18,
  },
  actions: {
    paddingHorizontal: Spacing[5],
    marginTop: Spacing[6],
  },
});
