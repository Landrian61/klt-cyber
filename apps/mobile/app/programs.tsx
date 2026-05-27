import {
  View, Text, Pressable, ImageBackground, StyleSheet, FlatList,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  FadeInUp, useSharedValue, useAnimatedStyle, withTiming,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';

import { FontFamily, Spacing, Radius, AmbientShadow, Duration } from '@/constants/theme';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { PROGRAMS, type Program } from '@/data/programs';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

function ProgramRow({ program, index, onPress }: { program: Program; index: number; onPress: () => void }) {
  const Colors = useThemeColors();
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <AnimatedPressable
      entering={FadeInUp.duration(300).delay(index * 60)}
      onPressIn={() => { scale.value = withTiming(0.98, { duration: Duration.fast }); }}
      onPressOut={() => { scale.value = withTiming(1, { duration: 150 }); }}
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress();
      }}
      style={[styles.row, animatedStyle, AmbientShadow, { backgroundColor: Colors.surfaceLowest }]}
      accessibilityRole="button"
      accessibilityLabel={`${program.name}, ${program.day} ${program.time}`}
    >
      <ImageBackground
        source={program.image}
        resizeMode="cover"
        style={styles.rowImage}
        imageStyle={{ borderTopLeftRadius: Radius.lg, borderBottomLeftRadius: Radius.lg }}
      />
      <View style={styles.rowContent}>
        <Text style={[styles.rowName, { color: Colors.onSurface }]} numberOfLines={2}>
          {program.name}
        </Text>
        <Text style={[styles.rowDay, { color: Colors.onSurfaceVariant }]} numberOfLines={1}>
          {program.day}{program.time ? `, ${program.time}` : ''}
          {program.endTime ? ` – ${program.endTime}` : ''}
        </Text>
        <View style={styles.rowLocationRow}>
          <Ionicons
            name={program.locationType === 'online' ? 'globe-outline' : 'location-outline'}
            size={13}
            color={Colors.outline}
          />
          <Text style={[styles.rowLocation, { color: Colors.outline }]} numberOfLines={1}>
            {program.location}
          </Text>
        </View>
      </View>
      <View style={styles.rowChevron}>
        <Ionicons name="chevron-forward" size={18} color={Colors.outline} />
      </View>
    </AnimatedPressable>
  );
}

export default function ProgramsScreen() {
  const Colors = useThemeColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();

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

      {/* Program list */}
      <FlatList
        data={PROGRAMS}
        keyExtractor={(item) => item.id}
        contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + Spacing[6] }]}
        showsVerticalScrollIndicator={false}
        renderItem={({ item, index }) => (
          <ProgramRow
            program={item}
            index={index}
            onPress={() => router.push(`/program-detail?id=${item.id}`)}
          />
        )}
      />
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
  list: {
    paddingHorizontal: Spacing[5],
    gap: Spacing[3],
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
});
