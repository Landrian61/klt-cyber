import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { FontFamily, Spacing, Radius } from '@/constants/theme';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { ImageUploadField } from '@/components/ui/image-upload-field';
import { Button } from '@/components/ui/button';
import { StepScaffold, WizardField, FieldLabel, Hint } from '@/components/profile-wizard/step-scaffold';
import {
  useWizardDraft,
  type LeadershipDraft,
  type LeadershipLevel,
  type LeadershipStatus,
} from './_layout';

const LEVELS: LeadershipLevel[] = ['level_1', 'level_2', 'advanced'];
const LEVEL_LABELS = ['Level 1', 'Level 2', 'Advanced'];
const STATUSES: LeadershipStatus[] = ['in_progress', 'completed'];
const STATUS_LABELS = ['In Progress', 'Completed'];

function newKey(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export default function LeadershipStep() {
  const Colors = useThemeColors();
  const router = useRouter();
  const { draft, patch } = useWizardDraft();

  const addEntry = () =>
    patch({
      leadership: [
        ...draft.leadership,
        // Default to a valid level+status so every row is submittable.
        { key: newKey(), level: 'level_1', status: 'in_progress' },
      ],
    });
  const updateEntry = (key: string, partial: Partial<LeadershipDraft>) =>
    patch({
      leadership: draft.leadership.map((e) => (e.key === key ? { ...e, ...partial } : e)),
    });
  const removeEntry = (key: string) =>
    patch({ leadership: draft.leadership.filter((e) => e.key !== key) });

  return (
    <StepScaffold
      title="Leadership (KLLII)"
      subtitle="Optional. Add a row for each institute level you've taken — order doesn't matter."
      onPrimary={() => router.push('/profile-completion/department')}
    >
      <WizardField>
        {draft.leadership.length === 0 ? (
          <Hint>None added — this section is optional.</Hint>
        ) : (
          <View style={styles.list}>
            {draft.leadership.map((entry, idx) => {
              const levelIndex = entry.level ? LEVELS.indexOf(entry.level) : 0;
              const statusIndex = entry.status ? STATUSES.indexOf(entry.status) : 0;
              return (
                <View
                  key={entry.key}
                  style={[styles.card, { backgroundColor: Colors.surfaceLowest }]}
                >
                  <View style={styles.cardHeader}>
                    <Text style={[styles.cardHeaderText, { color: Colors.outline }]}>
                      ENTRY {idx + 1}
                    </Text>
                    <Pressable
                      onPress={() => removeEntry(entry.key)}
                      hitSlop={8}
                      accessibilityLabel={`Remove leadership entry ${idx + 1}`}
                    >
                      <Ionicons name="trash-outline" size={18} color={Colors.error} />
                    </Pressable>
                  </View>

                  <FieldLabel>Level</FieldLabel>
                  <SegmentedControl
                    options={LEVEL_LABELS}
                    selectedIndex={levelIndex}
                    onChange={(i) => updateEntry(entry.key, { level: LEVELS[i] })}
                  />
                  <View style={{ height: Spacing[3] }} />

                  <FieldLabel>Status</FieldLabel>
                  <SegmentedControl
                    options={STATUS_LABELS}
                    selectedIndex={statusIndex}
                    onChange={(i) => updateEntry(entry.key, { status: STATUSES[i] })}
                  />
                  <View style={{ height: Spacing[4] }} />

                  <ImageUploadField
                    label="Proof (optional)"
                    emptyLabel="Add proof"
                    value={entry.proofKey}
                    onChange={(key) => updateEntry(entry.key, { proofKey: key })}
                  />
                </View>
              );
            })}
          </View>
        )}
        <View style={styles.addBtn}>
          <Button variant="ghost" label="Add a level" onPress={addEntry} />
        </View>
      </WizardField>
    </StepScaffold>
  );
}

const styles = StyleSheet.create({
  list: { gap: Spacing[3] },
  card: {
    borderRadius: Radius.lg,
    padding: Spacing[4],
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing[3],
  },
  cardHeaderText: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 11,
    lineHeight: 15.4,
    letterSpacing: 0.5,
  },
  addBtn: { marginTop: Spacing[3] },
});
