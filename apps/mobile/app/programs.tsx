import {
  View, Text, Pressable, StyleSheet, FlatList, ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from 'convex/react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  FadeInUp, useSharedValue, useAnimatedStyle, withTiming,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';

import { FontFamily, Spacing, Radius, AmbientShadow, Duration } from '@/constants/theme';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { Cover } from '@/components/ui/cover';
import { api, type Doc } from '@/lib/api';
import { formatProgramSchedule, formatTime } from '@/lib/content-format';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

function ProgramRow({
  program, index, onPress,
}: { program: Doc<'weeklyPrograms'>; index: number; onPress: () => void }) {
  const Colors = useThemeColors();
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));
  const schedule = formatProgramSchedule(program);
  const timeRange = [
    program.startTime ? formatTime(program.startTime) : null,
    program.endTime ? formatTime(program.endTime) : null,
  ].filter(Boolean).join(' – ');

  return (
    // Entering animation on the wrapper; press-scale stays on the inner pressable.
    <Animated.View entering={FadeInUp.duration(300).delay(index * 60)}>
      <AnimatedPressable
        onPressIn={() => { scale.value = withTiming(0.98, { duration: Duration.fast }); }}
        onPressOut={() => { scale.value = withTiming(1, { duration: 150 }); }}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          onPress();
        }}
        style={[styles.row, animatedStyle, AmbientShadow, { backgroundColor: Colors.surfaceLowest }]}
        accessibilityRole="button"
        accessibilityLabel={`${program.title}, ${schedule}${timeRange ? `, ${timeRange}` : ''}`}
      >
        <Cover uri={program.coverImageUrl} index={index} imageRadius={0} style={styles.rowImage} />
        <View style={styles.rowContent}>
          <Text style={[styles.rowName, { color: Colors.onSurface }]} numberOfLines={2}>
            {program.title}
          </Text>
          <Text style={[styles.rowDay, { color: Colors.onSurfaceVariant }]} numberOfLines={1}>
            {schedule}{timeRange ? `, ${timeRange}` : ''}
          </Text>
          {program.location && (
            <View style={styles.rowLocationRow}>
              <Ionicons name="location-outline" size={13} color={Colors.outline} />
              <Text style={[styles.rowLocation, { color: Colors.outline }]} numberOfLines={1}>
                {program.location}
              </Text>
            </View>
          )}
        </View>
        <View style={styles.rowChevron}>
          <Ionicons name="chevron-forward" size={18} color={Colors.outline} />
        </View>
      </AnimatedPressable>
    </Animated.View>
  );
}

export default function ProgramsScreen() {
  const Colors = useThemeColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const programs = useQuery(api.weeklyPrograms.listActivePrograms);
  const isLoading = programs === undefined;

  return (
    <View style={[styles.container, { paddingTop: insets.top, backgroundColor: Colors.surface }]}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          style={styles.backButton}
        >
          <Ionicons name="arrow-back" size={24} color={Colors.onSurface} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: Colors.onSurface }]}>Programs</Text>
        <View style={styles.backButton} />
      </View>

      {isLoading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={Colors.primary} />
        </View>
      ) : (
        <FlatList
          data={programs}
          keyExtractor={(item) => item._id}
          contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + Spacing[6] }]}
          showsVerticalScrollIndicator={false}
          renderItem={({ item, index }) => (
            <ProgramRow
              program={item}
              index={index}
              onPress={() => router.push(`/program-detail?id=${item._id}`)}
            />
          )}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Ionicons name="calendar-outline" size={40} color={Colors.outline} />
              <Text style={[styles.emptyTitle, { color: Colors.onSurfaceVariant }]}>No programs yet</Text>
              <Text style={[styles.emptySubtitle, { color: Colors.outline }]}>Check back once the church calendar is published.</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing[5],
    paddingVertical: Spacing[3],
  },
  backButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontFamily: FontFamily.display,
    fontSize: 20,
    lineHeight: 26,
  },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  list: {
    paddingHorizontal: Spacing[5],
    gap: Spacing[3],
    flexGrow: 1,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: Radius.lg,
    overflow: 'hidden',
  },
  rowImage: {
    width: 88,
    alignSelf: 'stretch',
    overflow: 'hidden',
  },
  rowContent: {
    flex: 1,
    paddingVertical: Spacing[3],
    paddingLeft: Spacing[3],
    gap: 2,
  },
  rowChevron: {
    paddingRight: Spacing[3],
  },
  rowName: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 15,
    lineHeight: 20,
  },
  rowDay: {
    fontFamily: FontFamily.body,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 2,
  },
  rowLocationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  rowLocation: {
    fontFamily: FontFamily.body,
    fontSize: 11,
    lineHeight: 15.4,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: Spacing[10],
  },
  emptyTitle: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 16,
    lineHeight: 24,
    marginTop: Spacing[3],
  },
  emptySubtitle: {
    fontFamily: FontFamily.body,
    fontSize: 12,
    lineHeight: 18,
    marginTop: Spacing[1],
    textAlign: 'center',
    paddingHorizontal: Spacing[8],
  },
});
