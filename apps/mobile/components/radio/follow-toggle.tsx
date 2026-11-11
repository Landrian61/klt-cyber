import { useCallback } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { useMutation } from 'convex/react';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withSpring } from 'react-native-reanimated';

import { Radius } from '@/constants/theme';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { api, type Id } from '@/lib/api';

/**
 * The follow mutation with an optimistic update over BOTH surfaces that show
 * a follow state, the schedule rows and the Followed radio programs screen,
 * so a tap on either flips both at once (spec 0019, AC-9). If the server
 * refuses, Convex rolls the optimistic value back on its own.
 */
export function useSetRadioFollow() {
  return useMutation(api.radioFollows.set).withOptimisticUpdate((store, { programId, following }) => {
    const schedule = store.getQuery(api.radio.listSchedule, {});
    if (schedule) {
      store.setQuery(
        api.radio.listSchedule,
        {},
        schedule.map((row) => (row.programId === programId ? { ...row, isFollowed: following } : row)),
      );
    }
    const mine = store.getQuery(api.radioFollows.listMine, {});
    if (mine) {
      store.setQuery(
        api.radioFollows.listMine,
        {},
        mine.map((p) => (p._id === programId ? { ...p, isFollowed: following } : p)),
      );
    }
  });
}

/** A bell that follows or unfollows a program, for a schedule row (AC-9). */
export function FollowToggle({
  programId,
  following,
  programName,
}: {
  programId: Id<'radioPrograms'>;
  following: boolean;
  programName: string;
}) {
  const Colors = useThemeColors();
  const setFollow = useSetRadioFollow();
  const scale = useSharedValue(1);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  const onPress = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    scale.value = withSequence(withSpring(1.2, { damping: 8, stiffness: 400 }), withSpring(1));
    setFollow({ programId, following: !following }).catch(() => {});
  }, [following, programId, scale, setFollow]);

  return (
    <Pressable
      onPress={onPress}
      hitSlop={10}
      accessibilityRole="switch"
      accessibilityState={{ checked: following }}
      accessibilityLabel={`Follow ${programName}`}
      accessibilityHint="Sends you a push when it goes live"
    >
      <Animated.View
        style={[
          styles.bell,
          style,
          { backgroundColor: following ? Colors.primaryLight : Colors.surfaceLow },
        ]}
      >
        <Ionicons
          name={following ? 'notifications' : 'notifications-outline'}
          size={18}
          color={following ? Colors.primary : Colors.outline}
        />
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bell: {
    width: 36,
    height: 36,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
