import { useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { FontFamily, Spacing, Radius } from '@/constants/theme';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { Input } from '@/components/ui/input';
import { StepScaffold, WizardField, FieldLabel, Hint } from '@/components/profile-wizard/step-scaffold';
import { useWizardDraft } from './_layout';

export default function ProfessionStep() {
  const Colors = useThemeColors();
  const router = useRouter();
  const { draft, patch } = useWizardDraft();
  const [skillInput, setSkillInput] = useState('');

  const addSkill = () => {
    const skill = skillInput.trim();
    if (!skill) return;
    // Case-insensitive de-dupe.
    if (draft.skills.some((s) => s.toLowerCase() === skill.toLowerCase())) {
      setSkillInput('');
      return;
    }
    patch({ skills: [...draft.skills, skill] });
    setSkillInput('');
  };
  const removeSkill = (skill: string) =>
    patch({ skills: draft.skills.filter((s) => s !== skill) });

  return (
    <StepScaffold
      title="Profession"
      subtitle="Optional. Tell us a little about your work and skills."
      primaryLabel="Review"
      onPrimary={() => router.push('/profile-completion/review')}
    >
      <WizardField>
        <Input
          label="Occupation (optional)"
          value={draft.occupation}
          onChangeText={(v) => patch({ occupation: v })}
          autoCapitalize="words"
          icon="briefcase-outline"
          placeholder="e.g. Architect"
        />
      </WizardField>

      <WizardField>
        <Input
          label="Industry / sector (optional)"
          value={draft.industry}
          onChangeText={(v) => patch({ industry: v })}
          autoCapitalize="words"
          placeholder="e.g. Construction"
        />
      </WizardField>

      <WizardField>
        <Input
          label="Employer (optional)"
          value={draft.employer}
          onChangeText={(v) => patch({ employer: v })}
          autoCapitalize="words"
          placeholder="e.g. Tower of Faith"
        />
      </WizardField>

      <WizardField>
        <FieldLabel>Skills (optional)</FieldLabel>
        <View style={styles.skillAddRow}>
          <View style={styles.skillInput}>
            <Input
              label=""
              value={skillInput}
              onChangeText={setSkillInput}
              placeholder="Add a skill"
              autoCapitalize="words"
              returnKeyType="done"
              onSubmitEditing={addSkill}
            />
          </View>
          <Pressable
            onPress={addSkill}
            style={[styles.addSquare, { backgroundColor: Colors.primaryFixedDim }]}
            accessibilityLabel="Add skill"
            accessibilityRole="button"
          >
            <Ionicons name="add" size={24} color={Colors.primary} />
          </Pressable>
        </View>

        {draft.skills.length > 0 ? (
          <View style={styles.chips}>
            {draft.skills.map((skill) => (
              <View key={skill} style={[styles.chip, { backgroundColor: Colors.surfaceLow }]}>
                <Text style={[styles.chipText, { color: Colors.onSurface }]}>{skill}</Text>
                <Pressable onPress={() => removeSkill(skill)} hitSlop={6} accessibilityLabel={`Remove ${skill}`}>
                  <Ionicons name="close" size={16} color={Colors.outline} />
                </Pressable>
              </View>
            ))}
          </View>
        ) : (
          <Hint>None added.</Hint>
        )}
      </WizardField>
    </StepScaffold>
  );
}

const styles = StyleSheet.create({
  skillAddRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing[3],
  },
  skillInput: { flex: 1 },
  addSquare: {
    width: 52,
    height: 52,
    borderRadius: Radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing[2],
    marginTop: Spacing[3],
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[2],
    borderRadius: Radius.full,
    paddingLeft: Spacing[4],
    paddingRight: Spacing[3],
    paddingVertical: Spacing[2],
  },
  chipText: {
    fontFamily: FontFamily.bodyMedium,
    fontSize: 13,
    lineHeight: 18,
  },
});
