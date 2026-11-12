import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet,
  Text, View,
} from 'react-native';
import { useNavigation, useRouter } from 'expo-router';
import { usePreventRemove } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useMutation, useQuery } from 'convex/react';
import type { FunctionReturnType } from 'convex/server';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Animated, { FadeIn, FadeInUp, useReducedMotion } from 'react-native-reanimated';
import {
  MARITAL_STATUSES,
  MENTORSHIP_STATUS_LABEL,
  PROFILE_LIFECYCLE_COPY,
  PROFILE_LIFECYCLE_ERROR_MESSAGES,
  PROFILE_SHORT_BIO_MAX,
  SETTINGS_COPY,
  SEX,
  type EditableProfile,
  type EditMentorshipStatus,
  type ProfileEditDraft,
  diffProfileEdit,
  editValuesEqual,
  normalizeProfileEditDraft,
  profileEditDraftFrom,
  profileEditSchema,
  profileLifecycleErrorCode,
} from '@klt-cyber/shared';

import { FontFamily, Radius, ShadowE1, Spacing } from '@/constants/theme';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { api, type Id } from '@/lib/api';
import { getDisplayName } from '@/lib/user-display';
import { setFlashMessage } from '@/lib/flash-message';
import { isoToLocalMs, localMsToIso } from '@/lib/local-date';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { DobField } from '@/components/ui/dob-field';
import { DateField } from '@/components/ui/date-field';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { ImageUploadField } from '@/components/ui/image-upload-field';
import { ErrorState } from '@/components/ui/error-state';
import { SettingsHeader } from '@/components/settings/settings-ui';
import {
  ChildSheet,
  LeadershipSheet,
  LEADERSHIP_LEVEL_LABEL,
  type ChildRow,
  type LeadershipLevel,
  type LeadershipRow,
} from '@/components/profile/edit-row-sheets';

type MyProfile = NonNullable<FunctionReturnType<typeof api.profile.getMyProfile>>;

const SEX_LABELS = ['Male', 'Female'];
const MARITAL_LABELS = ['Single', 'Married', 'Widowed', 'Divorced'];
const MENTORSHIP_CHOICES: EditMentorshipStatus[] = ['not_enrolled', 'enrolled', 'completed'];

function toEditable(profile: MyProfile): EditableProfile {
  return {
    firstName: profile.firstName,
    middleName: profile.middleName,
    lastName: profile.lastName,
    sex: profile.sex,
    maritalStatus: profile.maritalStatus,
    dateOfBirth: profile.dateOfBirth,
    shortBio: profile.shortBio,
    phone: profile.phone,
    photoUrl: profile.photoUrl,
    address: profile.address,
    spouseUserId: profile.spouseUserId,
    spouseNameUnlinked: profile.spouseNameUnlinked,
    anniversaryDate: profile.anniversaryDate,
    nextOfKin: profile.nextOfKin,
    mentorshipStatus: profile.mentorshipStatus,
    mentorshipProofUrl: profile.mentorshipProofUrl,
    occupation: profile.occupation,
    industry: profile.industry,
    employer: profile.employer,
    skills: profile.skills,
  };
}

/** The message for a failed Save (AC-14): the coded copy, else the generic retry line. */
function saveErrorMessage(error: unknown): string {
  const code = profileLifecycleErrorCode(error);
  if (
    code === 'MENTORSHIP_NEEDS_REVIEW' ||
    code === 'MENTORSHIP_CONFIRMED' ||
    code === 'PROFILE_NOT_VERIFIED'
  ) {
    return PROFILE_LIFECYCLE_ERROR_MESSAGES[code];
  }
  return SETTINGS_COPY.edit.genericError;
}

type FieldErrors = Record<string, string>;

function Section({ title, delay, children }: { title: string; delay: number; children: ReactNode }) {
  const Colors = useThemeColors();
  const reduceMotion = useReducedMotion();
  return (
    <Animated.View
      entering={reduceMotion ? undefined : FadeInUp.duration(320).delay(delay)}
      style={[styles.card, ShadowE1, { backgroundColor: Colors.surfaceLowest }]}
    >
      <Text style={[styles.cardLabel, { color: Colors.primary }]}>{title}</Text>
      <View style={styles.cardBody}>{children}</View>
    </Animated.View>
  );
}

function FieldLabel({ children }: { children: ReactNode }) {
  const Colors = useThemeColors();
  return <Text style={[styles.fieldLabel, { color: Colors.onSurfaceVariant }]}>{children}</Text>;
}

function FieldError({ message }: { message?: string }) {
  const Colors = useThemeColors();
  if (!message) return null;
  return <Text style={[styles.fieldError, { color: Colors.secondary }]}>{message}</Text>;
}

function ListRow({ title, meta, onPress, label }: { title: string; meta: string; onPress: () => void; label: string }) {
  const Colors = useThemeColors();
  return (
    <Pressable
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
        onPress();
      }}
      style={({ pressed }) => [
        styles.listRow,
        { backgroundColor: pressed ? Colors.surfaceHigh : Colors.surfaceLow },
      ]}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <View style={styles.listRowText}>
        <Text style={[styles.listRowTitle, { color: Colors.onSurface }]}>{title}</Text>
        <Text style={[styles.listRowMeta, { color: Colors.onSurfaceVariant }]}>{meta}</Text>
      </View>
      <Ionicons name="create-outline" size={18} color={Colors.primary} />
    </Pressable>
  );
}

function AddRow({ label, onPress }: { label: string; onPress: () => void }) {
  const Colors = useThemeColors();
  return (
    <Pressable
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
        onPress();
      }}
      style={styles.addRow}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Ionicons name="add-circle-outline" size={20} color={Colors.primary} />
      <Text style={[styles.addLabel, { color: Colors.primary }]}>{label}</Text>
    </Pressable>
  );
}

/**
 * The member's own edit screen (spec 0023, AC-7 to AC-16). Works from a
 * snapshot taken when it opens; Save sends only what changed.
 */
export default function EditProfileScreen() {
  const Colors = useThemeColors();
  const router = useRouter();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();

  const live = useQuery(api.profile.getMyProfile);
  const updateMyProfile = useMutation(api.profile.updateMyProfile);

  // The snapshot (AC-16): taken once, the first time the profile arrives. Later
  // changes to the live profile never rewrite the form; only the sent back
  // takeover below reacts live.
  const [snapshot, setSnapshot] = useState<ProfileEditDraft | null>(null);
  const [draft, setDraft] = useState<ProfileEditDraft | null>(null);
  useEffect(() => {
    if (live && !snapshot) {
      const seeded = profileEditDraftFrom(toEditable(live));
      setSnapshot(seeded);
      setDraft(seeded);
    }
  }, [live, snapshot]);

  const [errors, setErrors] = useState<FieldErrors>({});
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [proofUploading, setProofUploading] = useState(false);
  const [sheetDirty, setSheetDirty] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [childRow, setChildRow] = useState<ChildRow | null | undefined>(undefined);
  const [leadRow, setLeadRow] = useState<LeadershipRow | null | undefined>(undefined);
  const [spouseQuery, setSpouseQuery] = useState('');
  const [spouseDisplay, setSpouseDisplay] = useState<string | null>(null);
  const [skillInput, setSkillInput] = useState('');

  // A failed upload reports `undefined`, exactly like a removal. Holding the
  // value from before the upload means a failed new photo never clears the
  // old one (which Save would otherwise send as a clear).
  // Refs, not state: the field calls back from the render the pick started
  // in, so a state flag would still read false there.
  const photoBeforeUpload = useRef<string | undefined>(undefined);
  const proofBeforeUpload = useRef<string | undefined>(undefined);
  const photoUploadingRef = useRef(false);
  const proofUploadingRef = useRef(false);

  const sentBack = live?.profileStatus === 'sent_back';

  const diff = useMemo(
    () =>
      snapshot && draft
        ? diffProfileEdit(normalizeProfileEditDraft(snapshot), normalizeProfileEditDraft(draft))
        : null,
    [snapshot, draft],
  );
  // Dirty compares the form as typed, not only what Save would send: a next
  // of kin with just a name normalizes to nothing, and if that hid the
  // change, Save would stay disabled and its AC-9 message would never show.
  const formDirty = !!snapshot && !!draft && !editValuesEqual(snapshot, draft);
  const uploading = photoUploading || proofUploading;

  // The leave guard (AC-13): ask before dropping edits, including an open row
  // sheet's; hold back while a Save is in flight. The sent back takeover
  // replaces the form without a prompt, so it switches the guard off.
  const guard = !leaving && !sentBack && (formDirty || sheetDirty || saving);
  usePreventRemove(guard, ({ data }) => {
    if (saving) return;
    Alert.alert(SETTINGS_COPY.edit.discardTitle, SETTINGS_COPY.edit.discardBody, [
      { text: SETTINGS_COPY.edit.keepEditing, style: 'cancel' },
      {
        text: SETTINGS_COPY.edit.discard,
        style: 'destructive',
        onPress: () => navigation.dispatch(data.action),
      },
    ]);
  });

  // Leave after a successful Save only once the guard has switched off, so
  // the prompt never asks about edits that were just saved.
  useEffect(() => {
    if (leaving) router.back();
  }, [leaving, router]);

  const confirmDiscard = useCallback((onDiscard: () => void) => {
    Alert.alert(SETTINGS_COPY.edit.discardTitle, SETTINGS_COPY.edit.discardBody, [
      { text: SETTINGS_COPY.edit.keepEditing, style: 'cancel' },
      { text: SETTINGS_COPY.edit.discard, style: 'destructive', onPress: onDiscard },
    ]);
  }, []);

  const married = draft?.maritalStatus === 'married';
  const spouseChosen = !!draft?.spouseUserId || !!draft?.spouseNameUnlinked.trim();
  const trimmedSpouseQuery = spouseQuery.trim();
  const spouseResults = useQuery(
    api.users.searchUsersForSpouseLink,
    married && !spouseChosen && trimmedSpouseQuery.length >= 2 ? { query: trimmedSpouseQuery } : 'skip',
  );

  const patch = useCallback((next: Partial<ProfileEditDraft>) => {
    setDraft((d) => (d ? { ...d, ...next } : d));
    setSaveError(null);
    setErrors((e) => {
      const cleared = { ...e };
      for (const key of Object.keys(next)) {
        for (const errorKey of Object.keys(cleared)) {
          if (errorKey === key || errorKey.startsWith(`${key}.`)) delete cleared[errorKey];
        }
      }
      return cleared;
    });
  }, []);

  const onSave = async () => {
    if (!draft || !snapshot || !diff || !formDirty || saving || uploading) return;

    // Only a field the person changed (as typed) can block Save: an old stored
    // value the rules would now refuse should not hold an unrelated edit
    // hostage.
    const changed = new Set<string>(
      (Object.keys(draft) as (keyof ProfileEditDraft)[]).filter(
        (key) => !editValuesEqual(snapshot[key], draft[key]),
      ),
    );
    const parsed = profileEditSchema.safeParse(draft);
    const found: FieldErrors = {};
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const top = String(issue.path[0] ?? '');
        if (!changed.has(top)) continue;
        const key = issue.path.map(String).join('.');
        if (!found[key]) found[key] = issue.message;
      }
    }
    setErrors(found);
    if (Object.keys(found).length > 0) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
      return;
    }

    // Only whitespace changed: nothing to send, so just go back.
    if (diff.isEmpty) {
      setLeaving(true);
      return;
    }

    setSaving(true);
    setSaveError(null);
    try {
      const { spouseUserId, ...rest } = diff.changes;
      await updateMyProfile({
        ...rest,
        ...(spouseUserId ? { spouseUserId: spouseUserId as Id<'users'> } : {}),
        ...(diff.clearFields.length > 0 ? { clearFields: diff.clearFields } : {}),
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setFlashMessage(SETTINGS_COPY.edit.saved);
      setLeaving(true);
    } catch (error) {
      // Every edit stays in the form, and Save stays available to retry.
      setSaveError(saveErrorMessage(error));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
    } finally {
      setSaving(false);
    }
  };

  // ── States ────────────────────────────────────────────────────────────────

  if (live === undefined || (live && !draft)) {
    return (
      <View style={[styles.container, { backgroundColor: Colors.surface }]}>
        <SettingsHeader title="Edit profile" />
        <View style={styles.centered}>
          <ActivityIndicator color={Colors.primary} />
        </View>
      </View>
    );
  }

  if (live === null) {
    return (
      <View style={[styles.container, { backgroundColor: Colors.surface }]}>
        <SettingsHeader title="Edit profile" />
        <View style={styles.centered}>
          <ErrorState />
          <View style={styles.takeoverCta}>
            <Button
              label="Complete your profile"
              variant="primary"
              onPress={() => router.replace('/profile-completion' as any)}
            />
          </View>
        </View>
      </View>
    );
  }

  // The sent back takeover (AC-15): `updateMyProfile` would refuse a save, so
  // the only useful thing left is the way into the wizard.
  if (sentBack) {
    return (
      <View style={[styles.container, { backgroundColor: Colors.surface }]}>
        <SettingsHeader title="Edit profile" />
        <Animated.View entering={FadeIn.duration(240)} style={styles.takeover}>
          <View style={[styles.takeoverCard, ShadowE1, { backgroundColor: Colors.surfaceLowest }]}>
            <View style={[styles.takeoverIcon, { backgroundColor: Colors.primaryLight }]}>
              <Ionicons name="create-outline" size={26} color={Colors.primary} />
            </View>
            <Text style={[styles.takeoverText, { color: Colors.onSurface }]}>
              {PROFILE_LIFECYCLE_COPY.sentBack.body}
            </Text>
            {live.sentBackReason ? (
              <Text style={[styles.takeoverReason, { color: Colors.onSurfaceVariant }]}>
                {live.sentBackReason}
              </Text>
            ) : null}
            <View style={styles.takeoverCta}>
              <Button
                label="Open your submission"
                variant="primary"
                onPress={() => router.replace('/profile-completion' as any)}
              />
            </View>
          </View>
        </Animated.View>
      </View>
    );
  }

  if (!draft || !snapshot) return null;

  const storedMentorship = snapshot.mentorshipStatus;
  const mentorshipLocked = storedMentorship === 'completed';
  const children: ChildRow[] = live.children.map((c) => ({
    _id: c._id,
    name: c.name,
    sex: c.sex,
    dateOfBirth: c.dateOfBirth,
  }));
  const leadership: LeadershipRow[] = live.leadershipProgress.map((row) => ({
    _id: row._id,
    level: row.level,
    status: row.status,
    proofUrl: row.proofUrl,
    completedAt: row.completedAt,
  }));

  const spouseLabel = draft.spouseUserId
    ? (spouseDisplay ?? 'Linked church member')
    : draft.spouseNameUnlinked.trim();

  const addSkill = () => {
    const skill = skillInput.trim();
    if (!skill || draft.skills.includes(skill)) {
      setSkillInput('');
      return;
    }
    patch({ skills: [...draft.skills, skill] });
    setSkillInput('');
  };

  return (
    <View style={[styles.container, { backgroundColor: Colors.surface }]}>
      <SettingsHeader title="Edit profile" backDisabled={saving} />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={[styles.body, { paddingBottom: Spacing[16] + insets.bottom }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Section title="PHOTO" delay={0}>
            <View style={styles.photoWrap}>
              <ImageUploadField
                label="Profile photo"
                circular
                value={draft.photoUrl}
                emptyLabel="Add a photo"
                onBusyChange={(busy) => {
                  if (busy) photoBeforeUpload.current = draft.photoUrl;
                  photoUploadingRef.current = busy;
                  setPhotoUploading(busy);
                }}
                onChange={(key) => {
                  if (key === undefined && photoUploadingRef.current) {
                    patch({ photoUrl: photoBeforeUpload.current });
                    return;
                  }
                  patch({ photoUrl: key });
                }}
              />
            </View>
          </Section>

          <Section title="PERSONAL" delay={40}>
            <Input
              label="First name"
              value={draft.firstName}
              onChangeText={(v) => patch({ firstName: v })}
              error={errors.firstName}
              autoCapitalize="words"
            />
            <Input
              label="Middle name (optional)"
              value={draft.middleName}
              onChangeText={(v) => patch({ middleName: v })}
              error={errors.middleName}
              autoCapitalize="words"
            />
            <Input
              label="Last name"
              value={draft.lastName}
              onChangeText={(v) => patch({ lastName: v })}
              error={errors.lastName}
              autoCapitalize="words"
            />
            <FieldLabel>Sex</FieldLabel>
            <SegmentedControl
              options={SEX_LABELS}
              selectedIndex={SEX.indexOf(draft.sex)}
              onChange={(i) => patch({ sex: SEX[i] })}
            />
            <FieldLabel>Marital status</FieldLabel>
            <SegmentedControl
              options={MARITAL_LABELS}
              selectedIndex={MARITAL_STATUSES.indexOf(draft.maritalStatus)}
              onChange={(i) => patch({ maritalStatus: MARITAL_STATUSES[i] })}
            />
            <DobField
              label="Date of birth (optional)"
              value={draft.dateOfBirth}
              onChange={(v) => patch({ dateOfBirth: v })}
            />
            <FieldError
              message={errors['dateOfBirth.year'] ?? errors['dateOfBirth.day'] ?? errors['dateOfBirth.month']}
            />
            <Input
              label="Short bio (optional)"
              value={draft.shortBio}
              onChangeText={(v) => patch({ shortBio: v })}
              error={errors.shortBio}
              helperText={`${draft.shortBio.trim().length} / ${PROFILE_SHORT_BIO_MAX}`}
              multiline
            />
          </Section>

          <Section title="CONTACT" delay={80}>
            <Input
              label="Phone (optional)"
              value={draft.phone}
              onChangeText={(v) => patch({ phone: v })}
              error={errors.phone}
              keyboardType="phone-pad"
              icon="call-outline"
            />
            <Input
              label="Address line 1"
              value={draft.address.line1}
              onChangeText={(v) => patch({ address: { ...draft.address, line1: v } })}
              error={errors['address.line1']}
            />
            <Input
              label="City"
              value={draft.address.city}
              onChangeText={(v) => patch({ address: { ...draft.address, city: v } })}
            />
            <Input
              label="District"
              value={draft.address.district}
              onChangeText={(v) => patch({ address: { ...draft.address, district: v } })}
            />
            <Input
              label="Country"
              value={draft.address.country}
              onChangeText={(v) => patch({ address: { ...draft.address, country: v } })}
            />
          </Section>

          <Section title="FAMILY" delay={120}>
            {married ? (
              <>
                <FieldLabel>Spouse</FieldLabel>
                {spouseChosen ? (
                  <View style={[styles.chip, { backgroundColor: Colors.primaryFixedDim }]}>
                    <View style={styles.chipText}>
                      <Text style={[styles.chipName, { color: Colors.onSurface }]}>{spouseLabel}</Text>
                      <Badge
                        label={draft.spouseUserId ? 'Linked' : 'Not linked'}
                        variant={draft.spouseUserId ? 'confirmed' : 'pending'}
                      />
                    </View>
                    <Pressable
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                        setSpouseDisplay(null);
                        patch({ spouseUserId: undefined, spouseNameUnlinked: '' });
                      }}
                      hitSlop={12}
                      style={styles.iconHit}
                      accessibilityRole="button"
                      accessibilityLabel="Remove spouse"
                    >
                      <Ionicons name="close-circle" size={22} color={Colors.outline} />
                    </Pressable>
                  </View>
                ) : (
                  <>
                    <Input
                      label="Search verified members"
                      value={spouseQuery}
                      onChangeText={setSpouseQuery}
                      icon="search-outline"
                      autoCapitalize="none"
                    />
                    {spouseResults?.map((u) => (
                      <Pressable
                        key={u._id}
                        onPress={() => {
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                          // Linking sends the id and clears the unlinked name
                          // (AC-7): the diff does both, because the form holds
                          // one and empties the other.
                          setSpouseDisplay(getDisplayName(u));
                          patch({ spouseUserId: u._id, spouseNameUnlinked: '' });
                          setSpouseQuery('');
                        }}
                        style={({ pressed }) => [
                          styles.resultRow,
                          { backgroundColor: pressed ? Colors.surfaceHigh : Colors.surfaceLow },
                        ]}
                        accessibilityRole="button"
                        accessibilityLabel={`Link ${getDisplayName(u)} as your spouse`}
                      >
                        {u.photoUrl ? (
                          <Image source={{ uri: u.photoUrl }} style={styles.resultPhoto} contentFit="cover" />
                        ) : (
                          <View style={[styles.resultPhoto, { backgroundColor: Colors.primaryLight }]}>
                            <Ionicons name="person" size={16} color={Colors.primary} />
                          </View>
                        )}
                        <Text style={[styles.resultName, { color: Colors.onSurface }]}>
                          {getDisplayName(u)}
                        </Text>
                      </Pressable>
                    ))}
                    {spouseResults && spouseResults.length === 0 ? (
                      <Text style={[styles.hint, { color: Colors.onSurfaceVariant }]}>
                        No verified member by that name.
                      </Text>
                    ) : null}
                    {trimmedSpouseQuery.length >= 2 ? (
                      <Button
                        variant="textLink"
                        label={`Use "${trimmedSpouseQuery}" as an unregistered spouse`}
                        onPress={() => {
                          setSpouseDisplay(null);
                          patch({ spouseUserId: undefined, spouseNameUnlinked: trimmedSpouseQuery });
                          setSpouseQuery('');
                        }}
                      />
                    ) : null}
                  </>
                )}
                <DateField
                  label="Anniversary (optional)"
                  value={localMsToIso(draft.anniversaryDate)}
                  onChange={(v) => patch({ anniversaryDate: isoToLocalMs(v) })}
                />
              </>
            ) : null}

            <FieldLabel>Children</FieldLabel>
            {children.map((child) => (
              <ListRow
                key={child._id}
                title={child.name}
                meta={child.sex === 'male' ? 'Son' : 'Daughter'}
                label={`Edit ${child.name}`}
                onPress={() => setChildRow(child)}
              />
            ))}
            <AddRow label="Add a child" onPress={() => setChildRow(null)} />

            <FieldLabel>Next of kin</FieldLabel>
            <Input
              label="Full name"
              value={draft.nextOfKin.fullName}
              onChangeText={(v) => patch({ nextOfKin: { ...draft.nextOfKin, fullName: v } })}
              error={errors['nextOfKin.fullName']}
              autoCapitalize="words"
            />
            <Input
              label="Relationship"
              value={draft.nextOfKin.relationship}
              onChangeText={(v) => patch({ nextOfKin: { ...draft.nextOfKin, relationship: v } })}
              error={errors['nextOfKin.relationship']}
            />
            <Input
              label="Phone"
              value={draft.nextOfKin.phone}
              onChangeText={(v) => patch({ nextOfKin: { ...draft.nextOfKin, phone: v } })}
              error={errors['nextOfKin.phone']}
              keyboardType="phone-pad"
            />
          </Section>

          <Section title="MENTORSHIP" delay={160}>
            {mentorshipLocked ? (
              <View style={[styles.locked, { backgroundColor: Colors.surfaceLow }]}>
                <Ionicons name="lock-closed-outline" size={18} color={Colors.onSurfaceVariant} />
                <View style={styles.lockedText}>
                  <Text style={[styles.lockedTitle, { color: Colors.onSurface }]}>
                    {MENTORSHIP_STATUS_LABEL.completed}
                  </Text>
                  <Text style={[styles.hint, { color: Colors.onSurfaceVariant }]}>
                    {SETTINGS_COPY.mentorship.completedLocked}
                  </Text>
                </View>
              </View>
            ) : (
              <>
                <View style={styles.choiceRow}>
                  {MENTORSHIP_CHOICES.map((choice) => {
                    const selected = draft.mentorshipStatus === choice;
                    // Administration confirms completion (AC-12); feature 29
                    // turns this into a request later.
                    const disabled = choice === 'completed';
                    return (
                      <Pressable
                        key={choice}
                        disabled={disabled}
                        onPress={() => {
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                          patch({ mentorshipStatus: choice });
                        }}
                        style={[
                          styles.choice,
                          {
                            backgroundColor: selected ? Colors.primaryFixedDim : Colors.surfaceLow,
                            opacity: disabled ? 0.45 : 1,
                          },
                        ]}
                        accessibilityRole="radio"
                        accessibilityState={{ selected, disabled }}
                        accessibilityLabel={MENTORSHIP_STATUS_LABEL[choice]}
                      >
                        <Text
                          style={[
                            styles.choiceText,
                            { color: selected ? Colors.primary : Colors.onSurface },
                          ]}
                        >
                          {MENTORSHIP_STATUS_LABEL[choice]}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
                <Text style={[styles.hint, { color: Colors.onSurfaceVariant }]}>
                  {SETTINGS_COPY.mentorship.completedNeedsConfirmation}
                </Text>
              </>
            )}
            <ImageUploadField
              label="Proof (optional)"
              value={draft.mentorshipProofUrl}
              emptyLabel="Add a certificate photo"
              onBusyChange={(busy) => {
                if (busy) proofBeforeUpload.current = draft.mentorshipProofUrl;
                proofUploadingRef.current = busy;
                setProofUploading(busy);
              }}
              onChange={(key) => {
                if (key === undefined && proofUploadingRef.current) {
                  patch({ mentorshipProofUrl: proofBeforeUpload.current });
                  return;
                }
                patch({ mentorshipProofUrl: key });
              }}
            />
          </Section>

          <Section title="LEADERSHIP" delay={200}>
            {leadership.map((row) => (
              <ListRow
                key={row._id}
                title={LEADERSHIP_LEVEL_LABEL[row.level as LeadershipLevel] ?? row.level}
                meta={row.status === 'completed' ? 'Completed' : 'Enrolled'}
                label={`Edit ${LEADERSHIP_LEVEL_LABEL[row.level as LeadershipLevel] ?? row.level}`}
                onPress={() => setLeadRow(row)}
              />
            ))}
            {leadership.length === 0 ? (
              <Text style={[styles.hint, { color: Colors.onSurfaceVariant }]}>
                No leadership levels recorded yet.
              </Text>
            ) : null}
            <AddRow label="Add a leadership level" onPress={() => setLeadRow(null)} />
          </Section>

          <Section title="PROFESSION" delay={240}>
            <Input label="Occupation" value={draft.occupation} onChangeText={(v) => patch({ occupation: v })} />
            <Input label="Industry" value={draft.industry} onChangeText={(v) => patch({ industry: v })} />
            <Input label="Employer" value={draft.employer} onChangeText={(v) => patch({ employer: v })} />
            <FieldLabel>Skills</FieldLabel>
            {draft.skills.length > 0 ? (
              <View style={styles.skills}>
                {draft.skills.map((skill) => (
                  <View key={skill} style={[styles.skillChip, { backgroundColor: Colors.surfaceLow }]}>
                    <Text style={[styles.skillText, { color: Colors.onSurface }]}>{skill}</Text>
                    <Pressable
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                        patch({ skills: draft.skills.filter((s) => s !== skill) });
                      }}
                      hitSlop={12}
                      accessibilityRole="button"
                      accessibilityLabel={`Remove ${skill}`}
                    >
                      <Ionicons name="close" size={16} color={Colors.outline} />
                    </Pressable>
                  </View>
                ))}
              </View>
            ) : null}
            <Input
              label="Add a skill"
              value={skillInput}
              onChangeText={setSkillInput}
              onSubmitEditing={addSkill}
              returnKeyType="done"
              blurOnSubmit={false}
            />
          </Section>
        </ScrollView>

        {/* The one sticky Save (AC-8). */}
        <View
          style={[
            styles.saveBar,
            { backgroundColor: Colors.glassBackground, paddingBottom: insets.bottom + Spacing[3] },
          ]}
        >
          {saveError ? (
            <Text style={[styles.saveError, { color: Colors.secondary }]} accessibilityLiveRegion="polite">
              {saveError}
            </Text>
          ) : uploading ? (
            <Text style={[styles.saveHint, { color: Colors.onSurfaceVariant }]}>
              {SETTINGS_COPY.edit.uploading}
            </Text>
          ) : null}
          <Button
            label="Save changes"
            variant="primary"
            fullWidth
            loading={saving}
            disabled={!formDirty || uploading}
            onPress={onSave}
          />
        </View>
      </KeyboardAvoidingView>

      <ChildSheet
        row={childRow}
        onClose={() => setChildRow(undefined)}
        onDirtyChange={setSheetDirty}
        confirmDiscard={confirmDiscard}
      />
      <LeadershipSheet
        row={leadRow}
        existing={leadership}
        onClose={() => setLeadRow(undefined)}
        onDirtyChange={setSheetDirty}
        confirmDiscard={confirmDiscard}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  flex: { flex: 1 },
  centered: { flex: 1, justifyContent: 'center', padding: Spacing[5], gap: Spacing[4] },
  body: { paddingHorizontal: Spacing[5], paddingTop: Spacing[2] },
  card: { borderRadius: Radius.lg, padding: Spacing[5], marginBottom: Spacing[4] },
  cardLabel: {
    fontFamily: FontFamily.bodyExtraBold,
    fontSize: 12,
    lineHeight: 16,
    letterSpacing: 1.4,
  },
  cardBody: { gap: Spacing[3], marginTop: Spacing[3] },
  fieldLabel: { fontFamily: FontFamily.bodySemiBold, fontSize: 13, lineHeight: 18, marginTop: Spacing[1] },
  fieldError: { fontFamily: FontFamily.bodyMedium, fontSize: 12, lineHeight: 17 },
  hint: { fontFamily: FontFamily.body, fontSize: 13, lineHeight: 19 },
  photoWrap: { alignItems: 'center' },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: Radius.md,
    paddingLeft: Spacing[4],
    paddingVertical: Spacing[2],
  },
  chipText: { flex: 1, gap: Spacing[1] },
  chipName: { fontFamily: FontFamily.bodySemiBold, fontSize: 15, lineHeight: 21 },
  iconHit: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[3],
    borderRadius: Radius.md,
    padding: Spacing[3],
    minHeight: 52,
  },
  resultPhoto: {
    width: 32,
    height: 32,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  resultName: { fontFamily: FontFamily.bodySemiBold, fontSize: 15, lineHeight: 21 },
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: Radius.md,
    paddingHorizontal: Spacing[4],
    paddingVertical: Spacing[3],
    minHeight: 52,
  },
  listRowText: { flex: 1, gap: 2 },
  listRowTitle: { fontFamily: FontFamily.bodySemiBold, fontSize: 15, lineHeight: 21 },
  listRowMeta: { fontFamily: FontFamily.body, fontSize: 12, lineHeight: 17 },
  addRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing[2], minHeight: 44 },
  addLabel: { fontFamily: FontFamily.bodySemiBold, fontSize: 14, lineHeight: 20 },
  locked: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[3],
    borderRadius: Radius.md,
    padding: Spacing[3],
  },
  lockedText: { flex: 1, gap: 2 },
  lockedTitle: { fontFamily: FontFamily.bodySemiBold, fontSize: 15, lineHeight: 21 },
  choiceRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing[2] },
  choice: {
    borderRadius: Radius.full,
    paddingHorizontal: Spacing[4],
    minHeight: 44,
    justifyContent: 'center',
  },
  choiceText: { fontFamily: FontFamily.bodySemiBold, fontSize: 14, lineHeight: 20 },
  skills: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing[2] },
  skillChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[2],
    borderRadius: Radius.full,
    paddingLeft: Spacing[3],
    paddingRight: Spacing[2],
    minHeight: 36,
  },
  skillText: { fontFamily: FontFamily.bodyMedium, fontSize: 13, lineHeight: 18 },
  saveBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: Spacing[5],
    paddingTop: Spacing[3],
    gap: Spacing[2],
  },
  saveError: { fontFamily: FontFamily.bodyMedium, fontSize: 13, lineHeight: 19, textAlign: 'center' },
  saveHint: { fontFamily: FontFamily.body, fontSize: 13, lineHeight: 19, textAlign: 'center' },
  takeover: { flex: 1, padding: Spacing[5], justifyContent: 'center' },
  takeoverCard: { borderRadius: Radius.lg, padding: Spacing[6], alignItems: 'center', gap: Spacing[3] },
  takeoverIcon: {
    width: 56,
    height: 56,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  takeoverText: { fontFamily: FontFamily.bodyMedium, fontSize: 15, lineHeight: 22, textAlign: 'center' },
  takeoverReason: { fontFamily: FontFamily.bodyMedium, fontSize: 14, lineHeight: 21, textAlign: 'center' },
  takeoverCta: { alignSelf: 'stretch', marginTop: Spacing[2] },
});
