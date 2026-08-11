import { memo, useCallback, useRef } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Animated, {
  FadeInUp,
  FadeOut,
  LinearTransition,
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  useReducedMotion,
} from 'react-native-reanimated';

import { FontFamily, Spacing, Radius, Duration } from '@/constants/theme';
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

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

function newKey(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * One leadership (KLLII) entry. Memoized against stable callbacks, so editing
 * one card never re-renders its siblings. Entrance, removal, and the reflow of
 * the cards below a deletion all animate on the UI thread.
 */
const LeadershipCard = memo(function LeadershipCard({
  entry,
  index,
  onUpdate,
  onRemove,
}: {
  entry: LeadershipDraft;
  index: number;
  onUpdate: (key: string, partial: Partial<LeadershipDraft>) => void;
  onRemove: (key: string) => void;
}) {
  const Colors = useThemeColors();
  const reduceMotion = useReducedMotion();
  const trash = useSharedValue(1);
  const trashStyle = useAnimatedStyle(() => ({ transform: [{ scale: trash.value }] }));

  const levelIndex = entry.level ? LEVELS.indexOf(entry.level) : 0;
  const statusIndex = entry.status ? STATUSES.indexOf(entry.status) : 0;

  return (
    <Animated.View
      entering={reduceMotion ? undefined : FadeInUp.duration(280).delay(index * 40)}
      exiting={reduceMotion ? undefined : FadeOut.duration(160)}
      layout={reduceMotion ? undefined : LinearTransition.springify().damping(18)}
      style={[styles.card, { backgroundColor: Colors.surfaceLowest }]}
    >
      <View style={styles.cardHeader}>
        <Text style={[styles.cardHeaderText, { color: Colors.outline }]}>ENTRY {index + 1}</Text>
        <AnimatedPressable
          onPressIn={() => {
            trash.value = withTiming(0.85, { duration: Duration.fast });
          }}
          onPressOut={() => {
            trash.value = withTiming(1, { duration: 150 });
          }}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            onRemove(entry.key);
          }}
          hitSlop={10}
          style={trashStyle}
          accessibilityLabel={`Remove leadership entry ${index + 1}`}
          accessibilityRole="button"
        >
          <Ionicons name="trash-outline" size={18} color={Colors.error} />
        </AnimatedPressable>
      </View>

      <FieldLabel>Level</FieldLabel>
      <SegmentedControl
        options={LEVEL_LABELS}
        selectedIndex={levelIndex}
        onChange={(i) => onUpdate(entry.key, { level: LEVELS[i] })}
      />
      <View style={{ height: Spacing[3] }} />

      <FieldLabel>Status</FieldLabel>
      <SegmentedControl
        options={STATUS_LABELS}
        selectedIndex={statusIndex}
        onChange={(i) => onUpdate(entry.key, { status: STATUSES[i] })}
      />
      <View style={{ height: Spacing[4] }} />

      <ImageUploadField
        label="Proof (optional)"
        emptyLabel="Add proof"
        value={entry.proofKey}
        onChange={(key) => onUpdate(entry.key, { proofKey: key })}
      />
    </Animated.View>
  );
});

export default function LeadershipStep() {
  const router = useRouter();
  const { draft, patch } = useWizardDraft();

  // Ref mirrors the latest rows so the memoized cards' callbacks stay stable.
  const rowsRef = useRef(draft.leadership);
  rowsRef.current = draft.leadership;

  const addEntry = useCallback(
    () =>
      patch({
        // Default to a valid level+status so every row is submittable.
        leadership: [...rowsRef.current, { key: newKey(), level: 'level_1', status: 'in_progress' }],
      }),
    [patch],
  );
  const updateEntry = useCallback(
    (key: string, partial: Partial<LeadershipDraft>) =>
      patch({ leadership: rowsRef.current.map((e) => (e.key === key ? { ...e, ...partial } : e)) }),
    [patch],
  );
  const removeEntry = useCallback(
    (key: string) => patch({ leadership: rowsRef.current.filter((e) => e.key !== key) }),
    [patch],
  );

  return (
    <StepScaffold
      title="Leadership (KLLII)"
      subtitle="Optional. Add a row for each institute level you've taken — order doesn't matter."
      onPrimary={() => router.push('/profile-completion/clan')}
    >
      <WizardField>
        {draft.leadership.length === 0 ? (
          <Hint>None added — this section is optional.</Hint>
        ) : (
          <View style={styles.list}>
            {draft.leadership.map((entry, idx) => (
              <LeadershipCard
                key={entry.key}
                entry={entry}
                index={idx}
                onUpdate={updateEntry}
                onRemove={removeEntry}
              />
            ))}
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
