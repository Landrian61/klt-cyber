import { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { SEX, MARITAL_STATUSES, type Sex, type MaritalStatus } from '@klt-cyber/shared';

import { FontFamily, Spacing } from '@/constants/theme';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { Input } from '@/components/ui/input';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { DateField } from '@/components/ui/date-field';
import { DobField } from '@/components/ui/dob-field';
import { ImageUploadField } from '@/components/ui/image-upload-field';
import { Button } from '@/components/ui/button';
import { StepScaffold, WizardField, FieldLabel, Hint } from '@/components/profile-wizard/step-scaffold';
import { useMyAccount } from '@/hooks/use-my-account';
import { useWizardDraft } from './_layout';

const SEX_LABELS = ['Male', 'Female'];
const MARITAL_LABELS = ['Single', 'Married', 'Widowed', 'Divorced'];

export default function PersonalStep() {
  const Colors = useThemeColors();
  const router = useRouter();
  const { user } = useMyAccount();
  const { draft, patch } = useWizardDraft();

  // Prefill names from a Google sign-up once, while the draft is untouched.
  useEffect(() => {
    if (!user) return;
    patch({
      firstName: draft.firstName || user.firstName || '',
      lastName: draft.lastName || user.lastName || '',
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.firstName, user?.lastName]);

  const sexIndex = draft.sex ? SEX.indexOf(draft.sex) : -1;
  const maritalIndex = draft.maritalStatus ? MARITAL_STATUSES.indexOf(draft.maritalStatus) : -1;

  // A city/district without line 1 would be silently dropped at submit — block
  // it. Country is ignored here since it defaults to "Uganda".
  const addressPartial =
    !draft.addressLine1.trim() &&
    (!!draft.addressCity.trim() || !!draft.addressDistrict.trim());

  const canContinue =
    !!draft.firstName.trim() &&
    !!draft.lastName.trim() &&
    !!draft.sex &&
    !!draft.maritalStatus &&
    !addressPartial;

  const accountPhoto = user?.profilePictureUrl;
  const usingAccountPhoto = draft.photoFromAccount && !!draft.photoValue;

  return (
    <StepScaffold
      title="About you"
      subtitle="This becomes your member profile. First and last name, sex, and marital status are required — everything else is optional."
      onPrimary={() => router.push('/profile-completion/family')}
      primaryDisabled={!canContinue}
    >
      {/* Profile photo */}
      <WizardField>
        <ImageUploadField
          label="Profile photo (optional)"
          circular
          value={usingAccountPhoto ? undefined : draft.photoValue}
          onChange={(key) => patch({ photoValue: key, photoFromAccount: false })}
        />
        {accountPhoto ? (
          usingAccountPhoto ? (
            <View style={styles.accountRow}>
              <Text style={[styles.accountNote, { color: Colors.onSurfaceVariant }]}>
                Using your account photo.
              </Text>
              <Button
                variant="textLink"
                label="Remove"
                onPress={() => patch({ photoValue: undefined, photoFromAccount: false })}
              />
            </View>
          ) : !draft.photoValue ? (
            <View style={styles.accountRow}>
              <Button
                variant="textLink"
                label="Use my account photo instead"
                onPress={() => patch({ photoValue: accountPhoto, photoFromAccount: true })}
              />
            </View>
          ) : null
        ) : null}
      </WizardField>

      <WizardField>
        <Input
          label="First name"
          value={draft.firstName}
          onChangeText={(v) => patch({ firstName: v })}
          autoCapitalize="words"
          icon="person-outline"
          placeholder="Grace"
        />
      </WizardField>

      <WizardField>
        <Input
          label="Middle name (optional)"
          value={draft.middleName}
          onChangeText={(v) => patch({ middleName: v })}
          autoCapitalize="words"
          icon="person-outline"
          placeholder="Nnalongo"
        />
      </WizardField>

      <WizardField>
        <Input
          label="Last name"
          value={draft.lastName}
          onChangeText={(v) => patch({ lastName: v })}
          autoCapitalize="words"
          icon="person-outline"
          placeholder="Nakato"
        />
      </WizardField>

      <WizardField>
        <FieldLabel>Sex</FieldLabel>
        <SegmentedControl
          options={SEX_LABELS}
          selectedIndex={sexIndex < 0 ? 0 : sexIndex}
          onChange={(i) => patch({ sex: SEX[i] as Sex })}
        />
        {sexIndex < 0 && <Hint>Tap to choose.</Hint>}
      </WizardField>

      <WizardField>
        <FieldLabel>Marital status</FieldLabel>
        <SegmentedControl
          options={MARITAL_LABELS}
          selectedIndex={maritalIndex < 0 ? 0 : maritalIndex}
          onChange={(i) => patch({ maritalStatus: MARITAL_STATUSES[i] as MaritalStatus })}
        />
        {maritalIndex < 0 && <Hint>Tap to choose.</Hint>}
      </WizardField>

      <WizardField>
        <Input
          label="Phone (optional)"
          value={draft.phone}
          onChangeText={(v) => patch({ phone: v })}
          keyboardType="phone-pad"
          icon="call-outline"
          placeholder="+256 700 000 000"
        />
      </WizardField>

      {/* Address — optional. Only line 1 is needed to save it. */}
      <WizardField>
        <FieldLabel>Address (optional)</FieldLabel>
        <Input
          label="Village / zone, plot &amp; street"
          value={draft.addressLine1}
          onChangeText={(v) => patch({ addressLine1: v })}
          autoCapitalize="words"
          icon="location-outline"
          placeholder="e.g. Nansana, Plot 12 Church Rd"
        />
        <View style={{ height: Spacing[3] }} />
        <Input
          label="City / town"
          value={draft.addressCity}
          onChangeText={(v) => patch({ addressCity: v })}
          autoCapitalize="words"
          placeholder="e.g. Kampala"
        />
        <View style={{ height: Spacing[3] }} />
        <Input
          label="District"
          value={draft.addressDistrict}
          onChangeText={(v) => patch({ addressDistrict: v })}
          autoCapitalize="words"
          placeholder="e.g. Wakiso"
        />
        <View style={{ height: Spacing[3] }} />
        <Input
          label="Country"
          value={draft.addressCountry}
          onChangeText={(v) => patch({ addressCountry: v })}
          autoCapitalize="words"
          placeholder="Uganda"
        />
        {!draft.addressLine1.trim() &&
        (draft.addressCity.trim() || draft.addressDistrict.trim()) ? (
          <Hint>Add the village/zone, plot &amp; street line to save your address.</Hint>
        ) : null}
      </WizardField>

      <WizardField>
        <DobField
          label="Date of birth (optional)"
          value={draft.dob}
          onChange={(v) => patch({ dob: v })}
          helperText="Share your birthday for greetings — the year is up to you."
        />
      </WizardField>

      <WizardField>
        <DateField
          label="Join date (optional)"
          value={draft.joinDateISO}
          onChange={(v) => patch({ joinDateISO: v })}
          placeholder="When you started attending"
          helperText="Self-reported — when you first began fellowshipping here."
        />
      </WizardField>

      <WizardField>
        <Input
          label="Short bio (optional)"
          value={draft.shortBio}
          onChangeText={(v) => patch({ shortBio: v })}
          placeholder="A sentence or two about yourself"
          multiline
          numberOfLines={3}
        />
      </WizardField>
    </StepScaffold>
  );
}

const styles = StyleSheet.create({
  accountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: Spacing[3],
  },
  accountNote: {
    fontFamily: FontFamily.body,
    fontSize: 13,
    lineHeight: 18,
  },
});
