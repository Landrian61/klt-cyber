import { View, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import Animated, { FadeInUp, FadeOut, LinearTransition, useReducedMotion } from 'react-native-reanimated';

import { Spacing, Radius } from '@/constants/theme';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { StepScaffold, WizardField, FieldLabel } from '@/components/profile-wizard/step-scaffold';
import {
  useWizardDraft,
  LEADERSHIP_LEVELS,
  type LeadershipLevel,
  type LeadershipStatus,
} from './_layout';

const STATUSES: LeadershipStatus[] = ['not_enrolled', 'enrolled', 'completed'];
const STATUS_LABELS = ['Not Enrolled', 'Enrolled', 'Completed'];
const LEVEL_LABEL: Record<LeadershipLevel, string> = {
  level_1: 'Level 1',
  level_2: 'Level 2',
  advanced: 'Advanced',
};

/**
 * Applies one level's status change, then cascades forward: any level after
 * the one that changed only stays meaningful once its predecessor reads
 * "Completed", so a predecessor dropping below that resets (and re-hides)
 * everything after it — a hidden level never silently keeps a stale
 * "Completed" that would still reach `submitProfile`.
 */
function applyLeadershipChange(
  current: Record<LeadershipLevel, LeadershipStatus>,
  level: LeadershipLevel,
  status: LeadershipStatus,
): Record<LeadershipLevel, LeadershipStatus> {
  const next = { ...current, [level]: status };
  if (level === 'level_1' && status !== 'completed') {
    next.level_2 = 'not_enrolled';
    next.advanced = 'not_enrolled';
  } else if (level === 'level_2' && status !== 'completed') {
    next.advanced = 'not_enrolled';
  }
  return next;
}

export default function LeadershipStep() {
  const router = useRouter();
  const Colors = useThemeColors();
  const reduceMotion = useReducedMotion();
  const { draft, patch } = useWizardDraft();

  // Level 1 always shows; Level 2 unlocks once Level 1 is Completed, Advanced
  // once Level 2 is Completed — one level revealed at a time, matching how
  // the institute is actually taken.
  const visibleLevels = LEADERSHIP_LEVELS.filter((level, index) => {
    if (index === 0) return true;
    const previous = LEADERSHIP_LEVELS[index - 1];
    return draft.leadership[previous] === 'completed';
  });

  return (
    <StepScaffold
      title="Leadership (KLLII)"
      subtitle="Optional. Levels unlock in order as you complete each one."
      onPrimary={() => router.push('/profile-completion/clan')}
    >
      <WizardField>
        <View style={styles.list}>
          {visibleLevels.map((level, index) => {
            const status = draft.leadership[level];
            const statusIndex = STATUSES.indexOf(status);
            return (
              <Animated.View
                key={level}
                entering={reduceMotion ? undefined : FadeInUp.duration(280).delay(index * 60)}
                exiting={reduceMotion ? undefined : FadeOut.duration(160)}
                layout={reduceMotion ? undefined : LinearTransition.springify().damping(18)}
                style={[styles.card, { backgroundColor: Colors.surfaceLowest }]}
              >
                <FieldLabel>{LEVEL_LABEL[level]}</FieldLabel>
                <SegmentedControl
                  options={STATUS_LABELS}
                  selectedIndex={statusIndex}
                  onChange={(i) =>
                    patch({ leadership: applyLeadershipChange(draft.leadership, level, STATUSES[i]) })
                  }
                />
              </Animated.View>
            );
          })}
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
});
