import { useEffect } from 'react';
import { ScrollView, View, Text, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { SEX, MARITAL_STATUSES, type Sex, type MaritalStatus } from '@klt-cyber/shared';

import { FontFamily, Spacing } from '@/constants/theme';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { DateField } from '@/components/ui/date-field';
import { useMyAccount } from '@/hooks/use-my-account';
import { useProfileDraft } from './_layout';

const SEX_LABELS = ['Male', 'Female'];
const MARITAL_LABELS = ['Single', 'Married', 'Widowed', 'Divorced'];

export default function BioStep() {
  const Colors = useThemeColors();
  const router = useRouter();
  const { user } = useMyAccount();
  const { draft, patch } = useProfileDraft();

  // Prefill names from a Google sign-up when the user has them and the draft is
  // still untouched. Runs once the account query resolves.
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
  const canContinue = !!draft.sex && !!draft.maritalStatus;

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={[styles.title, { color: Colors.onSurface }]}>About you</Text>
        <Text style={[styles.subtitle, { color: Colors.onSurfaceVariant }]}>
          This becomes your member profile. Sex and marital status are required;
          everything else you can add later.
        </Text>

        <View style={styles.field}>
          <Input
            label="First name"
            value={draft.firstName}
            onChangeText={(v) => patch({ firstName: v })}
            autoCapitalize="words"
            icon="person-outline"
            placeholder="Grace"
          />
        </View>

        <View style={styles.field}>
          <Input
            label="Last name"
            value={draft.lastName}
            onChangeText={(v) => patch({ lastName: v })}
            autoCapitalize="words"
            icon="person-outline"
            placeholder="Nakato"
          />
        </View>

        <View style={styles.field}>
          <Text style={[styles.fieldLabel, { color: Colors.onSurface }]}>Sex</Text>
          <SegmentedControl
            options={SEX_LABELS}
            selectedIndex={sexIndex < 0 ? 0 : sexIndex}
            onChange={(i) => patch({ sex: SEX[i] as Sex })}
          />
          {sexIndex < 0 && (
            <Text style={[styles.hint, { color: Colors.outline }]}>Tap to choose.</Text>
          )}
        </View>

        <View style={styles.field}>
          <Text style={[styles.fieldLabel, { color: Colors.onSurface }]}>Marital status</Text>
          <SegmentedControl
            options={MARITAL_LABELS}
            selectedIndex={maritalIndex < 0 ? 0 : maritalIndex}
            onChange={(i) => patch({ maritalStatus: MARITAL_STATUSES[i] as MaritalStatus })}
          />
          {maritalIndex < 0 && (
            <Text style={[styles.hint, { color: Colors.outline }]}>Tap to choose.</Text>
          )}
        </View>

        <View style={styles.field}>
          <DateField
            label="Date of birth (optional)"
            value={draft.dateOfBirth}
            onChange={(v) => patch({ dateOfBirth: v })}
            placeholder="Add your birthday"
            helperText="Used for birthday greetings — you can add it later."
          />
        </View>
      </ScrollView>

      <View style={[styles.footer, { backgroundColor: Colors.surface }]}>
        <Button
          label="Continue"
          variant="primary"
          fullWidth
          disabled={!canContinue}
          onPress={() => router.push('/profile-completion/contact' as any)}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { flex: 1 },
  content: {
    paddingHorizontal: Spacing[5],
    paddingBottom: Spacing[8],
  },
  title: {
    fontFamily: FontFamily.display,
    fontSize: 24,
    lineHeight: 28.8,
  },
  subtitle: {
    fontFamily: FontFamily.body,
    fontSize: 14,
    lineHeight: 22.4,
    marginTop: Spacing[2],
    marginBottom: Spacing[5],
  },
  field: {
    marginBottom: Spacing[5],
  },
  fieldLabel: {
    fontFamily: FontFamily.bodyMedium,
    fontSize: 13,
    lineHeight: 18,
    marginBottom: Spacing[2],
  },
  hint: {
    fontFamily: FontFamily.body,
    fontSize: 12,
    lineHeight: 16,
    marginTop: 6,
    paddingLeft: 2,
  },
  footer: {
    paddingHorizontal: Spacing[5],
    paddingTop: Spacing[3],
    paddingBottom: Spacing[4],
  },
});
