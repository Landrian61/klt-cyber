import {
  View, Text, Pressable, ImageBackground, ScrollView, StyleSheet,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInUp } from 'react-native-reanimated';

import { FontFamily, Spacing, Radius } from '@/constants/theme';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { Button } from '@/components/ui/button';
import { getProgramById } from '@/data/programs';

export default function ProgramDetailScreen() {
  const Colors = useThemeColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const program = getProgramById(id ?? '');

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

  const timeDisplay = [
    program.day,
    program.time,
    program.endTime ? `– ${program.endTime}` : null,
    program.duration ? `(${program.duration})` : null,
  ].filter(Boolean).join(' ');

  return (
    <View style={[styles.container, { backgroundColor: Colors.surface }]}>
      <StatusBar style="light" />
      {/* Hero Image */}
      <ImageBackground
        source={program.image}
        resizeMode="cover"
        style={styles.hero}
      >
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
            <Text style={styles.heroName}>{program.name}</Text>
          </View>
        </View>
      </ImageBackground>

      {/* Content */}
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Time */}
        <Animated.View entering={FadeInUp.duration(300).delay(100)} style={styles.detailRow}>
          <Ionicons name="time-outline" size={20} color={Colors.primary} />
          <Text style={[styles.detailText, { color: Colors.onSurface }]}>{timeDisplay}</Text>
        </Animated.View>

        {/* Location */}
        <Animated.View entering={FadeInUp.duration(300).delay(160)} style={styles.detailRow}>
          <Ionicons name="location-outline" size={20} color={Colors.primary} />
          <Text style={[styles.detailText, { color: Colors.onSurface }]}>{program.location}</Text>
        </Animated.View>

        {/* Online URL */}
        {program.onlineUrl && (
          <Animated.View entering={FadeInUp.duration(300).delay(220)} style={styles.detailRow}>
            <Ionicons name="globe-outline" size={20} color={Colors.primary} />
            <Text style={[styles.detailText, { color: Colors.onSurface }]}>{program.onlineUrl}</Text>
          </Animated.View>
        )}

        {/* Description */}
        <Animated.View entering={FadeInUp.duration(300).delay(280)} style={styles.descriptionSection}>
          <Text style={[styles.descriptionLabel, { color: Colors.outline }]}>ABOUT</Text>
          <Text style={[styles.descriptionText, { color: Colors.onSurface }]}>
            {program.description}
          </Text>
        </Animated.View>
      </ScrollView>

      {/* Fixed bottom CTA */}
      <Animated.View
        entering={FadeInUp.duration(300).delay(350)}
        style={[styles.bottomBar, { paddingBottom: insets.bottom + Spacing[4], backgroundColor: Colors.surface }]}
      >
        <Button
          label="Clock in"
          variant="ghost"
          fullWidth
          onPress={() => {}}
        />
      </Animated.View>
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
  // Bottom bar
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: Spacing[5],
    paddingTop: Spacing[3],
  },
});
