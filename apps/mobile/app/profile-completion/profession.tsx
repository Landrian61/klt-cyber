import { memo, useCallback, useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Animated, {
  FadeIn,
  FadeOut,
  LinearTransition,
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  useReducedMotion,
} from 'react-native-reanimated';

import { FontFamily, Spacing, Radius, Duration } from '@/constants/theme';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { Input } from '@/components/ui/input';
import { StepScaffold, WizardField, FieldLabel, Hint } from '@/components/profile-wizard/step-scaffold';
import { useWizardDraft } from './_layout';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/** A removable skill token. Memoized; enters/leaves and reflows on the UI thread. */
const SkillChip = memo(function SkillChip({
  skill,
  onRemove,
}: {
  skill: string;
  onRemove: (skill: string) => void;
}) {
  const Colors = useThemeColors();
  const reduceMotion = useReducedMotion();
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <Animated.View
      entering={reduceMotion ? undefined : FadeIn.duration(200)}
      exiting={reduceMotion ? undefined : FadeOut.duration(160)}
      layout={reduceMotion ? undefined : LinearTransition.springify().damping(18)}
      style={[styles.chip, { backgroundColor: Colors.surfaceLow }]}
    >
      <Text style={[styles.chipText, { color: Colors.onSurface }]}>{skill}</Text>
      <AnimatedPressable
        onPressIn={() => {
          scale.value = withTiming(0.85, { duration: Duration.fast });
        }}
        onPressOut={() => {
          scale.value = withTiming(1, { duration: 150 });
        }}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          onRemove(skill);
        }}
        hitSlop={10}
        style={animatedStyle}
        accessibilityLabel={`Remove ${skill}`}
        accessibilityRole="button"
      >
        <Ionicons name="close" size={16} color={Colors.outline} />
      </AnimatedPressable>
    </Animated.View>
  );
});

export default function ProfessionStep() {
  const Colors = useThemeColors();
  const router = useRouter();
  const { draft, patch } = useWizardDraft();
  const [skillInput, setSkillInput] = useState('');

  // Ref mirrors the latest skills so the memoized chips' `onRemove` stays stable.
  const skillsRef = useRef(draft.skills);
  skillsRef.current = draft.skills;

  const addSkill = () => {
    const skill = skillInput.trim();
    if (!skill) return;
    // Case-insensitive de-dupe.
    if (skillsRef.current.some((s) => s.toLowerCase() === skill.toLowerCase())) {
      setSkillInput('');
      return;
    }
    patch({ skills: [...skillsRef.current, skill] });
    setSkillInput('');
  };

  const removeSkill = useCallback(
    (skill: string) => patch({ skills: skillsRef.current.filter((s) => s !== skill) }),
    [patch],
  );

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
              <SkillChip key={skill} skill={skill} onRemove={removeSkill} />
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
