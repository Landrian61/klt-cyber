import { useState } from 'react';
import { ScrollView, View, Text, Pressable, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import {
  FontFamily, Spacing, Radius,
} from '@/constants/theme';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
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
  { id: '1', category: 'Tithe', amount: 'UGX 100,000', date: '1 Apr 2026', status: 'confirmed' },
  { id: '2', category: 'Offering', amount: 'UGX 50,000', date: '28 Mar 2026', status: 'confirmed' },
  { id: '3', category: 'Building Project', amount: 'UGX 100,000', date: '15 Mar 2026', status: 'confirmed' },
];

export default function GivingScreen() {
  const Colors = useThemeColors();
  const router = useRouter();
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);

  const toggleCategory = (key: string) => {
    setSelectedCategories((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: Colors.surface }]} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Button
          variant="icon"
          onPress={() => router.back()}
          accessibilityLabel="Go back"
          icon={<Ionicons name="arrow-back" size={24} color={Colors.onSurface} />}
        />
        <View style={styles.titleArea}>
          <Text style={[styles.title, { color: Colors.onSurface }]}>Giving</Text>
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Summary Hero Card */}
        <View style={styles.section}>
          <Card variant="hero">
            <Text style={styles.heroLabel}>YOUR GIVING THIS MONTH</Text>
            <Text style={styles.heroAmount}>UGX 250,000</Text>
            <Button label="View history →" variant="textLink" onPress={() => {}} />
          </Card>
        </View>

        {/* Give Now Grid */}
        <View style={[styles.section, { marginTop: Spacing[6] }]}>
          <Text style={[styles.sectionTitle, { color: Colors.onSurface }]}>Give now</Text>
          <View style={styles.categoryGrid}>
            {CATEGORIES.map((cat) => {
              const isSelected = selectedCategories.includes(cat.key);
              return (
                <Pressable
                  key={cat.key}
                  onPress={() => toggleCategory(cat.key)}
                  style={[
                    styles.categoryCard,
                    { backgroundColor: isSelected ? Colors.primaryFixedDim : Colors.surfaceLowest },
                  ]}
                >
                  <Ionicons
                    name={cat.icon}
                    size={28}
                    color={isSelected ? Colors.primary : Colors.primary}
                  />
                  <Text style={[styles.categoryLabel, { color: isSelected ? Colors.primary : Colors.onSurface }]}>
                    {cat.label}
                  </Text>
                  {isSelected && <View style={[styles.categoryAccent, { backgroundColor: Colors.primary }]} />}
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* Contribute Button */}
        <View style={[styles.section, { marginTop: Spacing[5] }]}>
          <Button
            label="Make a contribution"
            variant="primary"
            disabled={selectedCategories.length === 0}
            onPress={() => {/* TODO: Open payment sheet */}}
          />
        </View>

        {/* Recent Transactions */}
        <View style={[styles.section, { marginTop: Spacing[6] }]}>
          <Text style={[styles.sectionTitle, { color: Colors.onSurface }]}>Recent transactions</Text>
          {RECENT_TRANSACTIONS.map((tx) => (
            <View key={tx.id} style={[styles.txCard, { backgroundColor: Colors.surfaceLowest }]}>
              <View style={styles.txInfo}>
                <Text style={[styles.txCategory, { color: Colors.onSurface }]}>{tx.category}</Text>
                <Text style={[styles.txDate, { color: Colors.outline }]}>{tx.date}</Text>
              </View>
              <View style={styles.txRight}>
                <Text style={[styles.txAmount, { color: Colors.primary }]}>{tx.amount}</Text>
                <Badge label="Confirmed" variant="confirmed" />
              </View>
            </View>
          ))}
          <View style={styles.historyLink}>
            <Button label="View full history →" variant="textLink" onPress={() => {}} />
          </View>
        </View>

        {/* Anonymous note */}
        <View style={[styles.section, { marginTop: Spacing[4] }]}>
          <View style={styles.anonNote}>
            <Ionicons name="information-circle-outline" size={14} color={Colors.outline} />
            <Text style={[styles.anonText, { color: Colors.outline }]}>
              You can give anonymously. Choose the option during payment.
            </Text>
          </View>
        </View>

        <View style={{ height: Spacing[6] }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing[2],
  },
  titleArea: {
    paddingLeft: Spacing[4],
    paddingRight: Spacing[12],
  },
  title: {
    fontFamily: FontFamily.display,
    fontSize: 24,
    lineHeight: 28.8,
  },
  section: {
    paddingHorizontal: Spacing[5],
    marginTop: Spacing[5],
  },
  sectionTitle: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 16,
    lineHeight: 24,
    marginBottom: Spacing[3],
  },
  // Hero — hardcoded white text on gold gradient is intentional
  heroLabel: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 11,
    lineHeight: 15.4,
    color: 'rgba(255,255,255,0.65)',
    letterSpacing: 0.8,
  },
  heroAmount: {
    fontFamily: FontFamily.monoBold,
    fontSize: 32,
    lineHeight: 35.2,
    color: '#FFFFFF',
    marginTop: Spacing[2],
    marginBottom: Spacing[2],
  },
  // Category grid
  categoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing[3],
  },
  categoryCard: {
    width: '30%',
    flexGrow: 1,
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
  categoryAccent: {
    position: 'absolute',
    bottom: 0,
    left: '20%',
    right: '20%',
    height: 2,
    borderRadius: 1,
  },
  // Transactions
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
  // Anon note
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
