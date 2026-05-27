import {
  ScrollView, View, Text, Pressable, ImageBackground, StyleSheet,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInUp, useSharedValue, useAnimatedStyle, withTiming } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';

import {
  FontFamily, Spacing, Radius, AmbientShadow, Duration,
} from '@/constants/theme';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { Button } from '@/components/ui/button';
import { CHURCH_THEME, getThisWeekPrograms, UPCOMING_EVENTS, type Program } from '@/data/programs';

const SCRIPTURE_GRADIENTS: { colors: [string, string]; start: { x: number; y: number }; end: { x: number; y: number } }[] = [
  { colors: ['#785600', '#B8860B'], start: { x: 0, y: 0 }, end: { x: 1, y: 1 } },       // Gold diagonal
  { colors: ['#AB3332', '#D4605F'], start: { x: 0, y: 0 }, end: { x: 1, y: 0.8 } },     // Crimson warm
  { colors: ['#145DA3', '#2E7EC7'], start: { x: 0, y: 0.2 }, end: { x: 1, y: 1 } },     // Royal Blue
  { colors: ['#785600', '#145DA3'], start: { x: 0, y: 0 }, end: { x: 1, y: 1 } },       // Gold → Blue
  { colors: ['#AB3332', '#785600'], start: { x: 0, y: 0 }, end: { x: 0.8, y: 1 } },     // Crimson → Gold
];

function getScriptureGradient() {
  const dayOfYear = Math.floor(
    (Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000
  );
  return SCRIPTURE_GRADIENTS[dayOfYear % SCRIPTURE_GRADIENTS.length];
}

function getFormattedDate(): string {
  return new Date().toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

function ProgramCard({ program, index, onPress }: { program: Program; index: number; onPress: () => void }) {
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <AnimatedPressable
      entering={FadeInUp.duration(300).delay(200 + index * 60)}
      onPressIn={() => { scale.value = withTiming(0.97, { duration: Duration.fast }); }}
      onPressOut={() => { scale.value = withTiming(1, { duration: 150 }); }}
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress();
      }}
      style={[styles.programCard, animatedStyle]}
      accessibilityRole="button"
      accessibilityLabel={`${program.name}, ${program.day} ${program.time}`}
    >
      <ImageBackground
        source={program.image}
        resizeMode="cover"
        style={styles.programCardImage}
        imageStyle={{ borderRadius: Radius.lg }}
      >
        <View style={styles.programCardScrim}>
          <Text style={styles.programCardName} numberOfLines={1}>{program.name}</Text>
          <Text style={styles.programCardTime} numberOfLines={1}>
            {program.day}{program.time ? `, ${program.time}` : ''}
          </Text>
        </View>
      </ImageBackground>
    </AnimatedPressable>
  );
}

export default function HomeScreen() {
  const Colors = useThemeColors();
  const router = useRouter();
  const thisWeekPrograms = getThisWeekPrograms(3);

  return (
    <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
      {/* Section 1: Greeting */}
      <Animated.View entering={FadeInUp.duration(400).delay(80)} style={styles.greeting}>
        <Text style={[styles.name, { color: Colors.onSurface }]}>Shalom Andrew</Text>
        <Text style={[styles.date, { color: Colors.outline }]}>{getFormattedDate()}</Text>
      </Animated.View>

      {/* Section 2: Church Theme Card */}
      <Animated.View entering={FadeInUp.duration(400).delay(160)} style={styles.section}>
        <View style={styles.themeCardContainer}>
          <ImageBackground
            source={require('@/assets/images/Church_Theme.jpg')}
            resizeMode="cover"
            style={styles.themeCardImage}
            imageStyle={{ borderRadius: Radius.xl }}
          >
            <View style={styles.themeCardScrim}>
              <Text style={styles.themeLabel}>
                {CHURCH_THEME.year} CHURCH THEME
              </Text>
              <Text style={styles.themeTitle}>{CHURCH_THEME.title}</Text>
              <Text style={styles.themeScripture}>{CHURCH_THEME.scripture}</Text>
            </View>
          </ImageBackground>
        </View>
      </Animated.View>

      {/* Section 3: This Week */}
      <Animated.View entering={FadeInUp.duration(400).delay(240)} style={styles.sectionHeader}>
        <Text style={[styles.sectionTitle, { color: Colors.onSurface }]}>This week</Text>
        <Button label="See all" variant="textLink" onPress={() => router.push('/programs')} />
      </Animated.View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.programsRow}
      >
        {thisWeekPrograms.map((program, index) => (
          <ProgramCard
            key={program.id}
            program={program}
            index={index}
            onPress={() => router.push(`/program-detail?id=${program.id}`)}
          />
        ))}
      </ScrollView>

      {/* Section 4: Scripture of the Day */}
      <Animated.View entering={FadeInUp.duration(400).delay(320)} style={[styles.section, { marginTop: Spacing[6] }]}>
        <Text style={[styles.sectionLabel, { color: Colors.outline }]}>SCRIPTURE OF THE DAY</Text>
        <LinearGradient
          colors={getScriptureGradient().colors}
          start={getScriptureGradient().start}
          end={getScriptureGradient().end}
          style={styles.scriptureGradient}
        >
          <Text style={styles.scriptureText}>
            {'"For I know the plans I have for you," declares the Lord, "plans to prosper you and not to harm you, plans to give you hope and a future."'}
          </Text>
          <Text style={styles.scriptureRef}>Jeremiah 29:11 (NIV)</Text>
        </LinearGradient>
      </Animated.View>

      {/* Section 5: Upcoming Events */}
      <Animated.View entering={FadeInUp.duration(400).delay(400)}>
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: Colors.onSurface }]}>Upcoming events</Text>
          {UPCOMING_EVENTS.length > 3 && (
            <Button label="See all" variant="textLink" onPress={() => router.push('/events')} />
          )}
        </View>
      </Animated.View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.eventsRow}
      >
        {UPCOMING_EVENTS.slice(0, 3).map((event, index) => (
          <AnimatedPressable
            key={event.id}
            entering={FadeInUp.duration(300).delay(440 + index * 60)}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.push(`/event-detail?id=${event.id}`);
            }}
            style={styles.eventCard}
            accessibilityRole="button"
            accessibilityLabel={`${event.name}, ${event.dateRange}`}
          >
            <ImageBackground
              source={event.image}
              resizeMode="cover"
              style={styles.eventCardImage}
              imageStyle={{ borderRadius: Radius.lg }}
            >
              <View style={styles.eventCardScrim}>
                <View style={[styles.eventDatePill, { backgroundColor: Colors.primaryLight }]}>
                  <Text style={[styles.eventDateText, { color: Colors.primary }]}>{event.dateRange}</Text>
                </View>
                <Text style={styles.eventCardName} numberOfLines={2}>{event.name}</Text>
              </View>
            </ImageBackground>
          </AnimatedPressable>
        ))}
      </ScrollView>

      {/* Section 6: Join the Ministry */}
      <Animated.View entering={FadeInUp.duration(400).delay(480)} style={styles.section}>
        <View style={[styles.ministryCard, { backgroundColor: Colors.surfaceLow }]}>
          <View style={styles.ministryRow}>
            <Ionicons name="people" size={24} color={Colors.primary} />
            <View style={styles.ministryText}>
              <Text style={[styles.ministryTitle, { color: Colors.onSurface }]}>Become a member</Text>
              <Text style={[styles.ministrySubtitle, { color: Colors.onSurfaceVariant }]}>Connect, grow and serve with us.</Text>
            </View>
          </View>
          <Button
            label="Express interest"
            variant="ghost"
            fullWidth
            onPress={() => {}}
          />
        </View>
      </Animated.View>

      {/* Section 7: Giving Shortcut */}
      <View style={[styles.section, { marginTop: Spacing[1] }]}>
        <Pressable
          style={[styles.givingCard, AmbientShadow, { backgroundColor: Colors.surfaceLowest }]}
          onPress={() => router.push('/giving')}
          accessibilityLabel="Give to the ministry"
        >
          <Ionicons name="heart" size={22} color={Colors.primary} />
          <Text style={[styles.givingText, { color: Colors.onSurface }]}>Give to the ministry</Text>
          <Ionicons name="chevron-forward" size={20} color={Colors.outline} />
        </Pressable>
      </View>

      <View style={{ height: Spacing[6] }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
  },
  greeting: {
    paddingTop: Spacing[5],
    paddingLeft: Spacing[8],
    paddingRight: Spacing[12],
  },
  name: {
    fontFamily: FontFamily.display,
    fontSize: 24,
    lineHeight: 28.8,
  },
  date: {
    fontFamily: FontFamily.body,
    fontSize: 12,
    lineHeight: 18,
    marginTop: Spacing[1],
  },
  section: {
    paddingHorizontal: Spacing[5],
    marginTop: Spacing[5],
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing[5],
    marginTop: Spacing[6],
  },
  sectionTitle: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 16,
    lineHeight: 24,
  },
  sectionLabel: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 11,
    lineHeight: 15.4,
    letterSpacing: 0.6,
    marginBottom: Spacing[3],
  },
  // Theme card
  themeCardContainer: {
    borderRadius: Radius.xl,
    overflow: 'hidden',
  },
  themeCardImage: {
    width: '100%',
    minHeight: 220,
    justifyContent: 'flex-end',
  },
  themeCardScrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(28, 28, 24, 0.50)',
    padding: Spacing[5],
    justifyContent: 'flex-end',
    borderRadius: Radius.xl,
  },
  themeLabel: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 11,
    lineHeight: 15.4,
    color: 'rgba(255,255,255,0.65)',
    letterSpacing: 0.8,
  },
  themeTitle: {
    fontFamily: FontFamily.display,
    fontSize: 22,
    lineHeight: 28,
    color: '#FFFFFF',
    marginTop: 6,
  },
  themeScripture: {
    fontFamily: FontFamily.display,
    fontSize: 12,
    lineHeight: 18,
    fontStyle: 'italic',
    color: 'rgba(255,255,255,0.80)',
    marginTop: Spacing[1],
  },
  // Program cards
  programsRow: {
    paddingLeft: Spacing[5],
    paddingRight: Spacing[3],
    gap: Spacing[3],
    marginTop: Spacing[3],
  },
  programCard: {
    width: 200,
    height: 160,
    borderRadius: Radius.lg,
    overflow: 'hidden',
  },
  programCardImage: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  programCardScrim: {
    backgroundColor: 'rgba(28, 28, 24, 0.7)',
    paddingHorizontal: Spacing[3],
    paddingVertical: Spacing[2],
    borderBottomLeftRadius: Radius.lg,
    borderBottomRightRadius: Radius.lg,
  },
  programCardName: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 14,
    lineHeight: 20,
    color: '#FFFFFF',
  },
  programCardTime: {
    fontFamily: FontFamily.body,
    fontSize: 11,
    lineHeight: 15.4,
    color: 'rgba(255,255,255,0.80)',
    marginTop: 2,
  },
  // Scripture
  scriptureGradient: {
    borderRadius: Radius.lg,
    padding: Spacing[5],
    minHeight: 160,
    justifyContent: 'flex-end',
  },
  scriptureText: {
    fontFamily: FontFamily.display,
    fontSize: 16,
    lineHeight: 24,
    color: '#FFFFFF',
  },
  scriptureRef: {
    fontFamily: FontFamily.body,
    fontSize: 11,
    lineHeight: 15.4,
    color: 'rgba(255,255,255,0.70)',
    marginTop: Spacing[2],
  },
  // Event cards
  eventsRow: {
    paddingLeft: Spacing[5],
    paddingRight: Spacing[3],
    gap: Spacing[3],
    marginTop: Spacing[3],
  },
  eventCard: {
    width: 260,
    height: 155,
    borderRadius: Radius.lg,
    overflow: 'hidden',
  },
  eventCardImage: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  eventCardScrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(28, 28, 24, 0.55)',
    borderRadius: Radius.lg,
    padding: Spacing[3],
    justifyContent: 'space-between',
  },
  eventDatePill: {
    alignSelf: 'flex-end',
    borderRadius: Radius.full,
    paddingHorizontal: Spacing[2],
    paddingVertical: 3,
  },
  eventDateText: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 10,
    lineHeight: 14,
  },
  eventCardName: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 15,
    lineHeight: 20,
    color: '#FFFFFF',
  },
  // Ministry
  ministryCard: {
    borderRadius: Radius.lg,
    padding: Spacing[4],
  },
  ministryRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing[3],
    marginBottom: Spacing[4],
  },
  ministryText: {
    flex: 1,
  },
  ministryTitle: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 16,
    lineHeight: 24,
  },
  ministrySubtitle: {
    fontFamily: FontFamily.body,
    fontSize: 12,
    lineHeight: 18,
    marginTop: Spacing[1],
  },
  // Giving
  givingCard: {
    borderRadius: Radius.lg,
    padding: Spacing[4],
    flexDirection: 'row',
    alignItems: 'center',
  },
  givingText: {
    fontFamily: FontFamily.bodyMedium,
    fontSize: 14,
    lineHeight: 22.4,
    flex: 1,
    marginLeft: Spacing[3],
  },
});
