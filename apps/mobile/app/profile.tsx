import { Children, cloneElement, isValidElement, useState, type ReactNode } from 'react';
import {
  View, Text, StyleSheet, ActivityIndicator, Pressable, Switch,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Image } from 'expo-image';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery } from 'convex/react';
import * as Haptics from 'expo-haptics';
import Animated, { FadeInUp, useReducedMotion } from 'react-native-reanimated';

import {
  CLAN_UNASSIGNED_COPY,
  MENTORSHIP_STATUS_LABEL,
  PROFILE_LIFECYCLE_COPY,
  profileLifecycleErrorMessage,
} from '@klt-cyber/shared';

import {
  FontFamily, Spacing, Radius, GoldGradient, HeavenGradient, ShadowE1, ShadowE2,
} from '@/constants/theme';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { Button } from '@/components/ui/button';
import { authClient } from '@/lib/auth';
import { api, type Id } from '@/lib/api';
import { useMyAccount } from '@/hooks/use-my-account';
import { getDisplayName, getInitials } from '@/lib/user-display';
import { NotificationPermissionRow } from '@/components/notification-permission-row';
import { MyAreasOfService } from '@/components/my-areas-of-service';
import { SelectList } from '@/components/ui/select-list';

const SEX_LABEL: Record<string, string> = { male: 'Male', female: 'Female' };
const MARITAL_LABEL: Record<string, string> = {
  single: 'Single', married: 'Married', widowed: 'Widowed', divorced: 'Divorced',
};
const LEVEL_LABEL: Record<string, string> = {
  level_1: 'Level 1', level_2: 'Level 2', advanced: 'Advanced',
};
const LEAD_STATUS_LABEL: Record<string, string> = {
  enrolled: 'Enrolled', completed: 'Completed',
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

/** A label-left / value-right row; a hairline divider is drawn above all but the first. */
function DetailRow({ label, value, muted, topDivider }: { label: string; value: string; muted?: boolean; topDivider?: boolean }) {
  const Colors = useThemeColors();
  return (
    <View style={[styles.detailRow, topDivider && { borderTopWidth: 1, borderTopColor: Colors.outlineVariant }]}>
      <Text style={[styles.detailLabel, { color: Colors.outline }]}>{label}</Text>
      <Text style={[styles.detailValue, { color: muted ? Colors.faint : Colors.onSurface }]} numberOfLines={2}>
        {value}
      </Text>
    </View>
  );
}

/** Injects between-row dividers, skipping nulls so conditional rows stay clean. */
function RowGroup({ children }: { children: ReactNode }) {
  const items = Children.toArray(children).filter(Boolean);
  return (
    <>
      {items.map((child, i) =>
        isValidElement<{ topDivider?: boolean }>(child) ? cloneElement(child, { topDivider: i > 0 }) : child,
      )}
    </>
  );
}

/** A titled white card with a gold uppercase label and a staggered entrance. */
function DetailCard({ title, delay, children }: { title: string; delay: number; children: ReactNode }) {
  const Colors = useThemeColors();
  const reduceMotion = useReducedMotion();
  return (
    <Animated.View
      entering={reduceMotion ? undefined : FadeInUp.duration(320).delay(delay)}
      style={[styles.card, ShadowE1, { backgroundColor: Colors.surfaceLowest }]}
    >
      <Text style={[styles.cardLabel, { color: Colors.primary }]}>{title}</Text>
      <RowGroup>{children}</RowGroup>
    </Animated.View>
  );
}

export default function ProfileScreen() {
  const Colors = useThemeColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const { account, user, profile, isMember, isVisitor, isPending, isSentBack, isLoading } =
    useMyAccount();
  const photoUrl = account?.photoUrl ?? undefined;
  const myProfile = useQuery(api.profile.getMyProfile);
  const clans = useQuery(api.clans.listClans);
  const reduceMotion = useReducedMotion();

  const unregisterPushToken = useMutation(api.notifications.unregisterMyPushNotificationToken);
  const setDirectorySharing = useMutation(api.profile.setDirectorySharing);
  const changeMyClan = useMutation(api.profile.changeMyClan);
  const [clanPickerOpen, setClanPickerOpen] = useState(false);
  const [clanBusy, setClanBusy] = useState(false);
  const [clanError, setClanError] = useState<string | null>(null);

  const onClanSelect = async (nextClanId: string | undefined) => {
    setClanBusy(true);
    setClanError(null);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      // `changeMyClan` is the ONE writer of `clanId` (spec 0014), which is why
      // this does not go through the general profile save: both elders have to
      // be told, and a general field save knows nothing about them.
      await changeMyClan(
        nextClanId ? { clanId: nextClanId as Id<'clans'> } : {},
      );
      setClanPickerOpen(false);
    } catch (err) {
      setClanError(profileLifecycleErrorMessage(err));
    } finally {
      setClanBusy(false);
    }
  };
  const [sharingBusy, setSharingBusy] = useState(false);

  const onSharingChange = async (next: boolean) => {
    // Optimistic feels wrong for a disclosure choice: the switch waits for the
    // server, so what it shows is always what is actually stored.
    setSharingBusy(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      await setDirectorySharing({ directorySharing: next });
    } catch {
      // The reactive query still holds the stored value, so the switch springs
      // back on its own and nothing needs undoing here.
    } finally {
      setSharingBusy(false);
    }
  };

  const signOut = async () => {
    // Best-effort — a failed unregister shouldn't block sign-out. Without
    // this, this device's push token stays attached to the account signing
    // out, and the next account that signs in here would share it (see
    // convex/notifications.ts's doc comment on this mutation).
    await unregisterPushToken().catch(() => {});
    await authClient.signOut();
  };

  const onEditTap = () => {
    // Member profile editing is not yet a dedicated screen; give tactile
    // feedback so the affordance feels alive until that flow ships.
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  if (isLoading) {
    return (
      <View style={[styles.center, { backgroundColor: Colors.surface }]}>
        <ActivityIndicator size="small" color={Colors.primary} />
      </View>
    );
  }

  const displayName = getDisplayName(user) || 'Welcome';
  const initials = getInitials(user);
  // Four states, not three (spec 0014, AC-31): a sent-back person is neither
  // "PENDING REVIEW" (nothing is with a reviewer) nor a plain "VISITOR" (they
  // have submitted twice over), so they get their own pill.
  const rolePill: { label: string; tone: 'gold' | 'light' } = isMember
    ? { label: 'MEMBER', tone: 'gold' }
    : isPending
      ? { label: 'PENDING REVIEW', tone: 'gold' }
      : isSentBack
        ? { label: 'NEEDS A CHANGE', tone: 'gold' }
        : { label: 'VISITOR', tone: 'light' };

  const clanName = clans?.find((c) => c._id === profile?.clanId)?.name;
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
  const showProfile = !!profile;

  return (
    <View style={[styles.container, { backgroundColor: Colors.surface }]}>
      <StatusBar style="light" />
      <Animated.ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: Spacing[10] }}>
        {/* Heaven-blue header */}
        <LinearGradient
          colors={[...HeavenGradient.colors]}
          start={{ x: 0.2, y: 0 }}
          end={{ x: 0.9, y: 1 }}
          style={[styles.hero, { paddingTop: insets.top + Spacing[2] }]}
        >
          <LinearGradient
            colors={['transparent', 'rgba(247,198,75,0.35)']}
            start={{ x: 0.4, y: 0.5 }}
            end={{ x: 1.15, y: 1.1 }}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          />

          <View style={styles.headerRow}>
            <Pressable
              onPress={() => router.back()}
              style={styles.circleBtn}
              accessibilityRole="button"
              accessibilityLabel="Go back"
            >
              <Ionicons name="arrow-back" size={20} color="#FFFFFF" />
            </Pressable>
            <Text style={styles.headerTitle}>My Profile</Text>
            <View style={{ flex: 1 }} />
            <Pressable
              onPress={onEditTap}
              style={styles.circleBtn}
              accessibilityRole="button"
              accessibilityLabel="Edit profile"
            >
              <Ionicons name="pencil" size={18} color="#FFFFFF" />
            </Pressable>
          </View>

          <View style={styles.heroCenter}>
            <View style={styles.avatarWrap}>
              {/* The server's one resolved photo (spec 0014, AC-14): this
                  person's own uploaded profile photo where there is one, and
                  the account picture only as the fallback. It used to render
                  `users.profilePictureUrl` directly, so somebody who uploaded
                  a photo in the wizard never saw it on their own profile. */}
              {photoUrl ? (
                <Image source={{ uri: photoUrl }} style={styles.avatar} contentFit="cover" />
              ) : (
                <LinearGradient
                  colors={[...GoldGradient.colors]}
                  start={GoldGradient.start}
                  end={GoldGradient.end}
                  style={[styles.avatar, ShadowE2]}
                >
                  <Text style={styles.avatarText}>{initials}</Text>
                </LinearGradient>
              )}
              <Pressable
                onPress={onEditTap}
                style={[styles.cameraBadge, { backgroundColor: Colors.surfaceLowest }]}
                accessibilityRole="button"
                accessibilityLabel="Change photo"
              >
                <Ionicons name="camera" size={15} color={Colors.primary} />
              </Pressable>
            </View>

            <Text style={styles.heroName}>{displayName}</Text>
            {!!user?.email && <Text style={styles.heroEmail}>{user.email}</Text>}

            <View
              style={[
                styles.rolePill,
                rolePill.tone === 'gold'
                  ? { backgroundColor: 'rgba(247,198,75,0.22)' }
                  : { backgroundColor: 'rgba(255,255,255,0.16)' },
              ]}
            >
              <Text
                style={[
                  styles.rolePillText,
                  { color: rolePill.tone === 'gold' ? '#EDB63C' : '#FFFFFF' },
                ]}
              >
                {rolePill.label}
              </Text>
            </View>
          </View>
        </LinearGradient>

        <View style={styles.body}>
          {/* Visitor: prompt to complete profile */}
          {isVisitor && !isPending && !isSentBack && (
            <View style={[styles.card, ShadowE1, { backgroundColor: Colors.surfaceLowest }]}>
              <Text style={[styles.cardLabel, { color: Colors.primary }]}>MEMBER PROFILE</Text>
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
            </View>
          )}

          {/* Pending: a status note above the read-only preview */}
          {isPending && (
            <View style={[styles.pendingBanner, { backgroundColor: Colors.blueTint }]}>
              <Ionicons name="hourglass-outline" size={20} color={Colors.tertiaryDeep} />
              <Text style={[styles.pendingText, { color: Colors.tertiaryDeep }]}>
                {PROFILE_LIFECYCLE_COPY.pending.body}
              </Text>
            </View>
          )}

          {/* Sent back: the reviewer's own words, then the way to act on them */}
          {isSentBack && (
            <Pressable
              onPress={() => router.push('/profile-completion' as any)}
              style={[styles.pendingBanner, { backgroundColor: Colors.primaryLight }]}
              accessibilityRole="button"
              accessibilityLabel="Open your submission and make the change asked for"
            >
              <Ionicons name="create-outline" size={20} color={Colors.primary} />
              <View style={styles.sentBackText}>
                <Text style={[styles.pendingText, { color: Colors.primary }]}>
                  {PROFILE_LIFECYCLE_COPY.sentBack.body}
                </Text>
                {/* The reviewer's own words, rendered as given rather than
                    rephrased — it is a quotation, not our copy. */}
                {profile?.sentBackReason ? (
                  <Text style={[styles.sentBackReason, { color: Colors.onSurface }]}>
                    {profile.sentBackReason}
                  </Text>
                ) : null}
                <Text style={[styles.pendingText, { color: Colors.primary }]}>
                  {PROFILE_LIFECYCLE_COPY.sentBack.footer}
                </Text>
              </View>
            </Pressable>
          )}

          {/* Read-only preview — shown to pending and verified members alike */}
          {showProfile && profile && (
            <>
              <DetailCard title="PERSONAL DETAILS" delay={40}>
                <DetailRow label="Full name" value={displayName} />
                <DetailRow label="Sex" value={SEX_LABEL[profile.sex] ?? profile.sex} />
                <DetailRow label="Marital status" value={MARITAL_LABEL[profile.maritalStatus] ?? profile.maritalStatus} />
                <DetailRow label="Date of birth" value={formatDob(profile.dateOfBirth)} muted={!profile.dateOfBirth} />
                {profile.shortBio ? <DetailRow label="Bio" value={profile.shortBio} /> : null}
              </DetailCard>

              <DetailCard title="CONTACT" delay={80}>
                <DetailRow label="Phone" value={profile.phone ?? 'Not set'} muted={!profile.phone} />
                <DetailRow label="Email" value={user?.email ?? 'Not set'} muted={!user?.email} />
                <DetailRow label="Address" value={formatAddress(profile.address)} muted={!profile.address} />
              </DetailCard>

              {hasFamily && (
                <DetailCard title="FAMILY" delay={120}>
                  {isMarried ? <DetailRow label="Spouse" value={spouseValue} muted={spouseValue === 'Not provided'} /> : null}
                  {isMarried && profile.anniversaryDate ? (
                    <DetailRow label="Anniversary" value={formatMsDate(profile.anniversaryDate)} />
                  ) : null}
                  {children.map((c) => (
                    <DetailRow key={c._id} label={`Child — ${c.name}`} value={SEX_LABEL[c.sex] ?? c.sex} />
                  ))}
                  {profile.nextOfKin ? (
                    <DetailRow
                      label="Next of kin"
                      value={`${profile.nextOfKin.fullName} · ${profile.nextOfKin.relationship}`}
                    />
                  ) : null}
                </DetailCard>
              )}

              <DetailCard title="CLAN" delay={160}>
                {/* A verified member with no clan is waiting on Hospitality,
                    not on themselves, so "Not set" would read as a field they
                    forgot to fill in (spec 0014, AC-24). */}
                <DetailRow
                  label="Clan"
                  value={clanName ?? (isMember ? CLAN_UNASSIGNED_COPY : 'Not set')}
                  muted={!clanName}
                />
                {/* The real stored value. This read a hardcoded "Completed"
                    for everybody, whatever they had actually entered
                    (spec 0014, AC-28). */}
                <DetailRow
                  label="Mentorship"
                  value={
                    MENTORSHIP_STATUS_LABEL[profile.mentorshipStatus] ??
                    profile.mentorshipStatus
                  }
                />
              </DetailCard>

              {/* A verified member changes their own clan whenever they like
                  (F2-08). The churn that allows is deliberate: both elders are
                  told, which is the mitigation rather than a prevention. */}
              {isMember && (
                <View
                  style={[
                    styles.card,
                    ShadowE1,
                    { backgroundColor: Colors.surfaceLowest },
                  ]}
                >
                  <Text style={[styles.cardLabel, { color: Colors.primary }]}>
                    CHANGE YOUR CLAN
                  </Text>
                  {clanPickerOpen ? (
                    <View style={styles.clanPicker}>
                      <SelectList
                        options={(clans ?? []).map((c) => ({
                          id: c._id,
                          label: c.name,
                        }))}
                        selectedId={profile.clanId}
                        onSelect={onClanSelect}
                        emptyText="Clans aren't available right now."
                      />
                      <Button
                        label="Done"
                        variant="textLink"
                        disabled={clanBusy}
                        onPress={() => setClanPickerOpen(false)}
                      />
                    </View>
                  ) : (
                    <>
                      <Text
                        style={[styles.bodyText, { color: Colors.onSurfaceVariant }]}
                      >
                        Your clan elder is told when you join, and your old one
                        is told when you leave.
                      </Text>
                      <View style={styles.cta}>
                        <Button
                          label={clanName ? 'Change my clan' : 'Choose my clan'}
                          variant="ghost"
                          fullWidth
                          onPress={() => {
                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                            setClanError(null);
                            setClanPickerOpen(true);
                          }}
                        />
                      </View>
                    </>
                  )}
                  {clanError ? (
                    <Text style={[styles.clanError, { color: Colors.secondary }]}>
                      {clanError}
                    </Text>
                  ) : null}
                </View>
              )}

              {/* Areas of Service, with its own add, withdraw and leave
                  (F2-07). Member only: a request to serve is only actionable
                  once the person asking has been verified. */}
              {isMember && <MyAreasOfService />}

              {leadership.length > 0 && (
                <DetailCard title="LEADERSHIP" delay={200}>
                  {leadership.map((e) => (
                    <DetailRow key={e._id} label={LEVEL_LABEL[e.level] ?? e.level} value={LEAD_STATUS_LABEL[e.status] ?? e.status} />
                  ))}
                </DetailCard>
              )}

              {hasProfession && (
                <DetailCard title="PROFESSION" delay={240}>
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

          {/* Notification settings — independent of visitor/pending/member
              lifecycle, so it's always rendered rather than gated on `showProfile`. */}
          <Animated.View
            entering={reduceMotion ? undefined : FadeInUp.duration(320).delay(280)}
            style={[styles.card, ShadowE1, { backgroundColor: Colors.surfaceLowest }]}
          >
            <Text style={[styles.cardLabel, { color: Colors.primary }]}>NOTIFICATIONS</Text>
            <NotificationPermissionRow />
          </Animated.View>

          {/* The member-facing directory toggle (spec 0014, AC-17). It has to
              live here as well as on the portal Settings page, because the
              portal is for role holders: a plain member can only reach this
              choice on their phone. Saves on the switch, not behind a button
              — it is one decision, not a form. */}
          {isMember && profile && (
            <Animated.View
              entering={reduceMotion ? undefined : FadeInUp.duration(320).delay(320)}
              style={[styles.card, ShadowE1, { backgroundColor: Colors.surfaceLowest }]}
            >
              <Text style={[styles.cardLabel, { color: Colors.primary }]}>
                MEMBER DIRECTORY
              </Text>
              <View style={styles.sharingRow}>
                <View style={styles.sharingText}>
                  <Text style={[styles.sharingTitle, { color: Colors.onSurface }]}>
                    Let other members find me
                  </Text>
                  <Text style={[styles.sharingBody, { color: Colors.onSurfaceVariant }]}>
                    Your name, photo and areas of service show in the church
                    directory. Your phone number, address and family details
                    never do.
                  </Text>
                </View>
                <Switch
                  value={profile.directorySharing === true}
                  disabled={sharingBusy}
                  onValueChange={onSharingChange}
                  trackColor={{ false: Colors.surfaceHigh, true: Colors.primaryFixedDim }}
                  thumbColor={
                    profile.directorySharing === true ? Colors.primary : Colors.outline
                  }
                  accessibilityLabel="Let other members find me in the directory"
                />
              </View>
            </Animated.View>
          )}

          {/* Actions */}
          <View style={styles.actions}>
            <Button label="Sign out" variant="destructive" fullWidth onPress={signOut} />
            {/* Account deletion (SRS F1-06, spec 0008). Reachable from inside
                the app because Apple and Google both require it to be, and
                styled as a quiet text link rather than a second red button:
                it sits next to sign out, and the two must not look equally
                routine. Everything that explains and confirms the deletion
                lives on the screen it opens (AC-1). */}
            <Button
              label="Delete account"
              variant="textLink"
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.push('/delete-account');
              }}
            />
          </View>
        </View>
      </Animated.ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  // Hero
  hero: {
    paddingHorizontal: Spacing[5],
    paddingBottom: Spacing[8],
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 44,
  },
  circleBtn: {
    width: 40,
    height: 40,
    borderRadius: Radius.full,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontFamily: FontFamily.displaySemi,
    fontSize: 20,
    lineHeight: 26,
    color: '#FFFFFF',
    marginLeft: Spacing[3],
  },
  heroCenter: {
    alignItems: 'center',
    marginTop: Spacing[5],
  },
  avatarWrap: {
    width: 128,
    height: 128,
  },
  avatar: {
    width: 128,
    height: 128,
    borderRadius: 64,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontFamily: FontFamily.display,
    fontSize: 40,
    color: '#3A2604',
  },
  cameraBadge: {
    position: 'absolute',
    right: 2,
    bottom: 6,
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    ...ShadowE2,
  },
  heroName: {
    fontFamily: FontFamily.display,
    fontSize: 28,
    lineHeight: 34,
    color: '#FFFFFF',
    marginTop: Spacing[4],
    textAlign: 'center',
  },
  heroEmail: {
    fontFamily: FontFamily.body,
    fontSize: 14.5,
    lineHeight: 20,
    color: 'rgba(255,255,255,0.72)',
    marginTop: 4,
    textAlign: 'center',
  },
  rolePill: {
    borderRadius: Radius.full,
    paddingHorizontal: 16,
    paddingVertical: 7,
    marginTop: Spacing[4],
  },
  rolePillText: {
    fontFamily: FontFamily.bodyExtraBold,
    fontSize: 11,
    letterSpacing: 1,
  },

  // Body
  body: {
    paddingHorizontal: Spacing[5],
    marginTop: Spacing[5],
  },
  card: {
    borderRadius: Radius.lg,
    padding: Spacing[5],
    marginBottom: Spacing[4],
  },
  cardLabel: {
    fontFamily: FontFamily.bodyExtraBold,
    fontSize: 12,
    lineHeight: 16,
    letterSpacing: 1.4,
    marginBottom: Spacing[1],
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    gap: Spacing[4],
  },
  detailLabel: {
    fontFamily: FontFamily.body,
    fontSize: 15,
    lineHeight: 20,
  },
  detailValue: {
    flex: 1,
    fontFamily: FontFamily.bodyBold,
    fontSize: 15,
    lineHeight: 20,
    textAlign: 'right',
  },
  bodyText: {
    fontFamily: FontFamily.body,
    fontSize: 14,
    lineHeight: 22.4,
    marginTop: Spacing[2],
  },
  cta: { marginTop: Spacing[4] },
  pendingBanner: {
    flexDirection: 'row',
    gap: Spacing[3],
    alignItems: 'flex-start',
    borderRadius: Radius.lg,
    padding: Spacing[4],
    marginBottom: Spacing[4],
  },
  pendingText: {
    flex: 1,
    fontFamily: FontFamily.body,
    fontSize: 13,
    lineHeight: 20,
  },
  sentBackText: {
    flex: 1,
    gap: Spacing[2],
  },
  sentBackReason: {
    fontFamily: FontFamily.bodyMedium,
    fontSize: 14,
    lineHeight: 22,
  },
  actions: {
    marginTop: Spacing[2],
  },
  sharingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[4],
    marginTop: Spacing[2],
  },
  sharingText: { flex: 1 },
  clanPicker: { gap: Spacing[2] },
  clanError: {
    fontFamily: FontFamily.body,
    fontSize: 13,
    lineHeight: 20,
    marginTop: Spacing[3],
  },
  sharingTitle: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 15,
    lineHeight: 22,
  },
  sharingBody: {
    fontFamily: FontFamily.body,
    fontSize: 13,
    lineHeight: 20,
    marginTop: 2,
  },
});
