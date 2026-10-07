import { useState } from 'react';
import { ScrollView, View, Text, Pressable, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  FadeInUp, useSharedValue, useAnimatedStyle, withTiming,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';

import {
  FontFamily, Spacing, Radius, Duration, GivingGradient, ShadowE2,
} from '@/constants/theme';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

const CATEGORIES = [
  { key: 'tithe', label: 'Tithe', icon: 'ribbon-outline' as const },
  { key: 'offering', label: 'Offering', icon: 'gift-outline' as const },
  { key: 'seed', label: 'Seed', icon: 'leaf-outline' as const },
  { key: 'building', label: 'Building Project', icon: 'business-outline' as const },
  { key: 'missions', label: 'Missions', icon: 'globe-outline' as const },
  { key: 'special', label: 'Special Gift', icon: 'heart-outline' as const },
];

const RECENT_TRANSACTIONS = [
  { id: '1', category: 'Tithe', amount: 'UGX 100,000', date: '1 Apr 2026', status: 'confirmed' as const },
  { id: '2', category: 'Offering', amount: 'UGX 50,000', date: '28 Mar 2026', status: 'confirmed' as const },
  { id: '3', category: 'Building Project', amount: 'UGX 100,000', date: '15 Mar 2026', status: 'confirmed' as const },
];

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

function CategoryCard({
  cat,
  isSelected,
  index,
  onPress,
}: {
  cat: typeof CATEGORIES[number];
  isSelected: boolean;
  index: number;
  onPress: () => void;
}) {
  const Colors = useThemeColors();
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    // Grid sizing + entering animation on the wrapper; press-scale on the inner
    // pressable so the layout animation doesn't overwrite the transform.
    <Animated.View
      entering={FadeInUp.duration(300).delay(200 + index * 50)}
      style={styles.categoryCardWrap}
    >
      <AnimatedPressable
        onPressIn={() => { scale.value = withTiming(0.95, { duration: Duration.fast }); }}
        onPressOut={() => { scale.value = withTiming(1, { duration: 150 }); }}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          onPress();
        }}
        style={[
          styles.categoryCard,
          animatedStyle,
          {
            backgroundColor: isSelected ? Colors.primaryFixedDim : Colors.surfaceLowest,
            borderWidth: isSelected ? 1.5 : 0,
            borderColor: isSelected ? Colors.primary : 'transparent',
          },
        ]}
        accessibilityRole="button"
        accessibilityState={{ selected: isSelected }}
        accessibilityLabel={cat.label}
      >
        <Ionicons name={cat.icon} size={28} color={Colors.primary} />
        <Text style={[styles.categoryLabel, { color: isSelected ? Colors.primary : Colors.onSurface }]}>
          {cat.label}
        </Text>
      </AnimatedPressable>
    </Animated.View>
  );
}

export default function GivingTabScreen() {
  const Colors = useThemeColors();
  const router = useRouter();
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);

  const toggleCategory = (key: string) => {
    setSelectedCategories((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  };

  const handleContribute = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.push({
      pathname: '/give/amount',
      params: { categories: selectedCategories.join(',') },
    });
  };

  return (
    <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
      {/* Summary Hero Card */}
      <Animated.View entering={FadeInUp.duration(400).delay(100)} style={[styles.section, { marginTop: Spacing[3] }]}>
        <View style={[styles.heroContainer, ShadowE2]}>
          <LinearGradient
            colors={[...GivingGradient.colors]}
            start={GivingGradient.start}
            end={GivingGradient.end}
            style={styles.heroGrad}
          >
            {/* Radiant gold glow from the corner */}
            <LinearGradient
              colors={['transparent', 'rgba(247,198,75,0.55)']}
              start={{ x: 0.4, y: -0.1 }}
              end={{ x: 1.1, y: 0.95 }}
              style={StyleSheet.absoluteFill}
              pointerEvents="none"
            />
            <Text style={styles.heroLabel}>YOUR GIVING THIS MONTH</Text>
            <Text style={styles.heroAmount}>UGX 250,000</Text>
            <Text style={styles.heroSub}>Given as worship, received with joy.</Text>
          </LinearGradient>
        </View>
      </Animated.View>

      {/* Give Now Grid */}
      <Animated.View entering={FadeInUp.duration(400).delay(240)} style={[styles.section, { marginTop: Spacing[6] }]}>
        <Text style={[styles.sectionTitle, { color: Colors.onSurface }]}>Give now</Text>
        <View style={styles.categoryGrid}>
          {CATEGORIES.map((cat, index) => (
            <CategoryCard
              key={cat.key}
              cat={cat}
              isSelected={selectedCategories.includes(cat.key)}
              index={index}
              onPress={() => toggleCategory(cat.key)}
            />
          ))}
        </View>
      </Animated.View>

      {/* Contribute Button */}
      <Animated.View entering={FadeInUp.duration(400).delay(500)} style={[styles.section, { marginTop: Spacing[5] }]}>
        <Button
          label="Make a contribution"
          variant="primary"
          disabled={selectedCategories.length === 0}
          onPress={handleContribute}
        />
      </Animated.View>

      {/* Recent Transactions */}
      <Animated.View entering={FadeInUp.duration(400).delay(580)} style={[styles.section, { marginTop: Spacing[6] }]}>
        <Text style={[styles.sectionTitle, { color: Colors.onSurface }]}>Recent transactions</Text>
        {RECENT_TRANSACTIONS.map((tx, index) => (
          <Animated.View
            key={tx.id}
            entering={FadeInUp.duration(300).delay(620 + index * 50)}
            style={[styles.txCard, { backgroundColor: Colors.surfaceLowest }]}
          >
            <View style={styles.txInfo}>
              <Text style={[styles.txCategory, { color: Colors.onSurface }]}>{tx.category}</Text>
              <Text style={[styles.txDate, { color: Colors.outline }]}>{tx.date}</Text>
            </View>
            <View style={styles.txRight}>
              <Text style={[styles.txAmount, { color: Colors.primary }]}>{tx.amount}</Text>
              <Badge label="Confirmed" variant="confirmed" />
            </View>
          </Animated.View>
        ))}
        <View style={styles.historyLink}>
          <Button label="View full history →" variant="textLink" onPress={() => {}} />
        </View>
      </Animated.View>

      {/* Anonymous note */}
      <Animated.View entering={FadeInUp.duration(400).delay(780)} style={[styles.section, { marginTop: Spacing[4] }]}>
        <View style={styles.anonNote}>
          <Ionicons name="information-circle-outline" size={14} color={Colors.outline} />
          <Text style={[styles.anonText, { color: Colors.outline }]}>
            You can give anonymously. Choose the option during payment.
          </Text>
        </View>
      </Animated.View>

      <View style={{ height: Spacing[6] }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
  },
  section: {
    paddingHorizontal: Spacing[5],
    marginTop: Spacing[5],
  },
  sectionTitle: {
    fontFamily: FontFamily.displaySemi,
    fontSize: 18,
    lineHeight: 24,
    marginBottom: Spacing[3],
  },
  // Hero — gold-on-gold gradient
  heroContainer: {
    borderRadius: Radius.xl,
    overflow: 'hidden',
  },
  heroGrad: {
    width: '100%',
    padding: Spacing[5],
    paddingVertical: Spacing[6],
  },
  heroLabel: {
    fontFamily: FontFamily.bodyExtraBold,
    fontSize: 10.5,
    lineHeight: 15,
    color: 'rgba(255,255,255,0.85)',
    letterSpacing: 1.6,
  },
  heroAmount: {
    fontFamily: FontFamily.monoBold,
    fontSize: 32,
    lineHeight: 38,
    color: '#FFFFFF',
    marginTop: Spacing[2],
  },
  heroSub: {
    fontFamily: FontFamily.bodyMedium,
    fontSize: 12.5,
    lineHeight: 18,
    color: 'rgba(255,255,255,0.85)',
    marginTop: Spacing[2],
  },
  categoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing[3],
  },
  categoryCardWrap: {
    width: '30%',
    flexGrow: 1,
  },
  categoryCard: {
    width: '100%',
    borderRadius: Radius.lg,
    padding: Spacing[4],
    alignItems: 'center',
    overflow: 'hidden',
  },
  categoryLabel: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
    marginTop: Spacing[2],
  },
  txCard: {
    borderRadius: Radius.lg,
    padding: Spacing[3],
    paddingHorizontal: Spacing[4],
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing[2],
  },
  txInfo: {
    flex: 1,
  },
  txCategory: {
    fontFamily: FontFamily.bodyMedium,
    fontSize: 14,
    lineHeight: 22.4,
  },
  txDate: {
    fontFamily: FontFamily.body,
    fontSize: 11,
    lineHeight: 15.4,
    marginTop: 2,
  },
  txRight: {
    alignItems: 'flex-end',
    gap: Spacing[1],
  },
  txAmount: {
    fontFamily: FontFamily.monoBold,
    fontSize: 14,
    lineHeight: 22.4,
  },
  historyLink: {
    alignItems: 'center',
    marginTop: Spacing[3],
  },
  anonNote: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing[2],
  },
  anonText: {
    fontFamily: FontFamily.body,
    fontSize: 11,
    lineHeight: 15.4,
  },
});
