import {
  View, Text, Pressable, ScrollView, StyleSheet, ActivityIndicator,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useQuery } from 'convex/react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInUp } from 'react-native-reanimated';

import { formatOccurrenceDate } from '@klt-cyber/shared';

import { FontFamily, Spacing, Radius } from '@/constants/theme';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { Button } from '@/components/ui/button';
import { Cover } from '@/components/ui/cover';
import { api } from '@/lib/api';
import { formatProgramSchedule, formatTime } from '@/lib/content-format';

export default function ProgramDetailScreen() {
  const Colors = useThemeColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const programs = useQuery(api.weeklyPrograms.listActivePrograms);
  const isLoading = programs === undefined;
  const program = programs?.find((p) => p._id === id);

  if (isLoading) {
    return (
      <View style={[styles.container, { backgroundColor: Colors.surface, paddingTop: insets.top }]}>
        <View style={styles.fallback}>
          <ActivityIndicator color={Colors.primary} />
        </View>
      </View>
    );
  }

  if (!program) {
    return (
      <View style={[styles.container, { backgroundColor: Colors.surface, paddingTop: insets.top }]}>
        <View style={styles.fallback}>
          <Text style={[styles.fallbackText, { color: Colors.onSurfaceVariant }]}>Program not found</Text>
          <Button label="Go back" variant="ghost" onPress={() => router.back()} />
        </View>
      </View>
    );
  }

  const schedule = formatProgramSchedule(program);
  const timeRange = [
    program.startTime ? formatTime(program.startTime) : null,
    program.endTime ? `– ${formatTime(program.endTime)}` : null,
  ].filter(Boolean).join(' ');

  return (
    <View style={[styles.container, { backgroundColor: Colors.surface }]}>
      <StatusBar style="light" />
      {/* Hero Image */}
      <Cover uri={program.coverImageUrl} index={0} imageRadius={0} style={styles.hero}>
        <View style={styles.heroScrim}>
          {/* Back button */}
          <Pressable
            onPress={() => router.back()}
            hitSlop={12}
            style={[styles.backButton, { top: insets.top + Spacing[2] }]}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <View style={styles.backCircle}>
              <Ionicons name="arrow-back" size={22} color="#FFFFFF" />
            </View>
          </Pressable>

          {/* Title on image */}
          <View style={styles.heroContent}>
            <Text style={styles.heroName}>{program.title}</Text>
          </View>
        </View>
      </Cover>

      {/* Content */}
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + Spacing[6] }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Time */}
        <Animated.View entering={FadeInUp.duration(300).delay(100)} style={styles.detailRow}>
          <Ionicons name="time-outline" size={20} color={Colors.primary} />
          <Text style={[styles.detailText, { color: Colors.onSurface }]}>
            {schedule}{timeRange ? `, ${timeRange}` : ''}
          </Text>
        </Animated.View>

        {/* Location */}
        {program.location && (
          <Animated.View entering={FadeInUp.duration(300).delay(160)} style={styles.detailRow}>
            <Ionicons name="location-outline" size={20} color={Colors.primary} />
            <Text style={[styles.detailText, { color: Colors.onSurface }]}>{program.location}</Text>
          </Animated.View>
        )}

        {/* Dates that are off (spec 0009, AC-8). Only rendered when there are
            any, so the screen stays quiet for a program running normally. The
            reason sits next to the date, because "it is off" without "why" is
            the part people ask about. */}
        {program.cancelledUpcoming.length > 0 && (
          <Animated.View entering={FadeInUp.duration(300).delay(190)} style={styles.cancelledSection}>
            <Text style={[styles.sectionLabel, { color: Colors.secondary }]}>NOT HAPPENING</Text>
            {program.cancelledUpcoming.map((occurrence) => (
              <View
                key={occurrence.date}
                style={[styles.cancelledRow, { backgroundColor: Colors.secondaryLight }]}
              >
                <Ionicons name="close-circle" size={18} color={Colors.secondary} />
                <View style={styles.cancelledRowText}>
                  <Text style={[styles.cancelledDate, { color: Colors.onSurface }]}>
                    {formatOccurrenceDate(occurrence.date)}
                  </Text>
                  {occurrence.reason && (
                    <Text style={[styles.cancelledReason, { color: Colors.onSurfaceVariant }]}>
                      {occurrence.reason}
                    </Text>
                  )}
                </View>
              </View>
            ))}
          </Animated.View>
        )}

        {/* Description */}
        {program.description && (
          <Animated.View entering={FadeInUp.duration(300).delay(220)} style={styles.descriptionSection}>
            <Text style={[styles.descriptionLabel, { color: Colors.outline }]}>ABOUT</Text>
            <Text style={[styles.descriptionText, { color: Colors.onSurface }]}>
              {program.description}
            </Text>
          </Animated.View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  fallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing[4],
  },
  fallbackText: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 16,
    lineHeight: 24,
  },
  // Hero
  hero: {
    width: '100%',
    height: 260,
  },
  heroScrim: {
    flex: 1,
    backgroundColor: 'rgba(28, 28, 24, 0.45)',
    justifyContent: 'flex-end',
  },
  backButton: {
    position: 'absolute',
    left: Spacing[5],
    zIndex: 10,
  },
  backCircle: {
    width: 40,
    height: 40,
    borderRadius: Radius.full,
    backgroundColor: 'rgba(28, 28, 24, 0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroContent: {
    paddingHorizontal: Spacing[5],
    paddingBottom: Spacing[5],
  },
  heroName: {
    fontFamily: FontFamily.display,
    fontSize: 26,
    lineHeight: 32,
    color: '#FFFFFF',
  },
  // Content
  content: {
    paddingHorizontal: Spacing[5],
    paddingTop: Spacing[5],
    gap: Spacing[4],
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[3],
  },
  detailText: {
    fontFamily: FontFamily.bodyMedium,
    fontSize: 15,
    lineHeight: 22,
    flex: 1,
  },
  cancelledSection: {
    marginTop: Spacing[2],
    gap: Spacing[2],
  },
  sectionLabel: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 11,
    lineHeight: 15.4,
    letterSpacing: 0.6,
    marginBottom: Spacing[1],
  },
  cancelledRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing[3],
    borderRadius: Radius.lg,
    paddingHorizontal: Spacing[3],
    paddingVertical: Spacing[3],
  },
  cancelledRowText: {
    flex: 1,
    gap: 2,
  },
  cancelledDate: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 14,
    lineHeight: 20,
  },
  cancelledReason: {
    fontFamily: FontFamily.body,
    fontSize: 12,
    lineHeight: 18,
  },
  descriptionSection: {
    marginTop: Spacing[2],
  },
  descriptionLabel: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 11,
    lineHeight: 15.4,
    letterSpacing: 0.6,
    marginBottom: Spacing[2],
  },
  descriptionText: {
    fontFamily: FontFamily.body,
    fontSize: 15,
    lineHeight: 24,
  },
});
