import { useEffect, useRef, useState } from 'react';
import {
  View, Text, Pressable, TextInput, ScrollView, StyleSheet,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInUp } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';

import { FontFamily, Spacing, Radius } from '@/constants/theme';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { Button } from '@/components/ui/button';
import { ProgressBar } from '@/components/ui/progress-bar';
import { useGivingFlow } from '@/contexts/giving-flow-context';

const QUICK_AMOUNTS = [
  { label: '10K', value: 10000 },
  { label: '50K', value: 50000 },
  { label: '100K', value: 100000 },
  { label: '500K', value: 500000 },
  { label: '1M', value: 1000000 },
];

const CATEGORY_LABELS: Record<string, string> = {
  tithe: 'Tithe',
  offering: 'Offering',
  seed: 'Seed',
  building: 'Building Project',
  missions: 'Missions',
  special: 'Special Gift',
};

function formatAmount(value: number): string {
  if (value === 0) return '0';
  return value.toLocaleString('en-UG');
}

export default function AmountScreen() {
  const Colors = useThemeColors();
  const router = useRouter();
  const { categories: categoriesParam } = useLocalSearchParams<{ categories: string }>();
  const { data, updateData } = useGivingFlow();
  const [rawInput, setRawInput] = useState('');
  const inputRef = useRef<TextInput>(null);

  // Seed categories from route params on mount
  useEffect(() => {
    if (categoriesParam) {
      const cats = categoriesParam.split(',').filter(Boolean);
      updateData({ categories: cats });
    }
  }, [categoriesParam, updateData]);

  const categories = data.categories;
  const amount = data.amount;

  const removeCategory = (key: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const updated = categories.filter((c) => c !== key);
    updateData({ categories: updated });
    if (updated.length === 0) {
      router.back();
    }
  };

  const selectQuickAmount = (value: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    updateData({ amount: value });
    setRawInput(value.toString());
  };

  const handleCustomInput = (text: string) => {
    const numeric = text.replace(/[^0-9]/g, '');
    setRawInput(numeric);
    updateData({ amount: numeric ? parseInt(numeric, 10) : 0 });
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: Colors.surface }]} edges={['top', 'bottom']}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.backButton} accessibilityLabel="Go back">
          <Ionicons name="arrow-back" size={24} color={Colors.onSurface} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: Colors.onSurface }]}>Amount</Text>
        <View style={styles.backButton} />
      </View>

      <View style={styles.progress}>
        <ProgressBar totalSteps={4} currentStep={1} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Category pills */}
        <Animated.View entering={FadeInUp.duration(300).delay(100)}>
          <Text style={[styles.label, { color: Colors.outline }]}>GIVING TO</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pillRow}>
            {categories.map((key) => (
              <Pressable
                key={key}
                onPress={() => removeCategory(key)}
                style={[styles.categoryPill, { backgroundColor: Colors.primaryFixedDim }]}
              >
                <Text style={[styles.categoryPillText, { color: Colors.primary }]}>
                  {CATEGORY_LABELS[key] || key}
                </Text>
                <Ionicons name="close" size={14} color={Colors.primary} />
              </Pressable>
            ))}
          </ScrollView>
        </Animated.View>

        {/* Amount display */}
        <Animated.View entering={FadeInUp.duration(400).delay(200)} style={styles.amountSection}>
          <Pressable onPress={() => inputRef.current?.focus()} style={styles.amountTouchable}>
            <Text style={[styles.amountCurrency, { color: Colors.outline }]}>UGX</Text>
            <Text style={[styles.amountValue, { color: amount === 0 ? Colors.faint : Colors.primaryDeep }]}>
              {formatAmount(amount)}
            </Text>
          </Pressable>
          <TextInput
            ref={inputRef}
            style={styles.hiddenInput}
            value={rawInput}
            onChangeText={handleCustomInput}
            keyboardType="numeric"
            caretHidden
          />
        </Animated.View>

        {/* Quick amounts */}
        <Animated.View entering={FadeInUp.duration(300).delay(300)} style={styles.quickRow}>
          {QUICK_AMOUNTS.map((qa) => {
            const isSelected = amount === qa.value;
            return (
              <Pressable
                key={qa.value}
                onPress={() => selectQuickAmount(qa.value)}
                style={[
                  styles.quickPill,
                  { backgroundColor: isSelected ? Colors.primaryFixedDim : Colors.surfaceLowest },
                ]}
              >
                <Text style={[
                  styles.quickPillText,
                  { color: isSelected ? Colors.primary : Colors.onSurface },
                ]}>
                  {qa.label}
                </Text>
              </Pressable>
            );
          })}
        </Animated.View>

        {/* Custom amount hint */}
        <Animated.View entering={FadeInUp.duration(300).delay(400)}>
          <Text style={[styles.hint, { color: Colors.outline }]}>
            Tap the amount above to enter a custom value
          </Text>
        </Animated.View>
      </ScrollView>

      {/* Next CTA */}
      <Animated.View entering={FadeInUp.duration(300).delay(500)} style={styles.footer}>
        <Button
          label="Next"
          variant="primary"
          disabled={amount === 0}
          onPress={() => router.push('/give/payment')}
        />
      </Animated.View>
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
    justifyContent: 'space-between',
    paddingHorizontal: Spacing[5],
    paddingVertical: Spacing[2],
  },
  backButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 16,
    lineHeight: 24,
  },
  progress: {
    paddingHorizontal: Spacing[5],
    marginBottom: Spacing[4],
  },
  content: {
    paddingHorizontal: Spacing[5],
    paddingBottom: Spacing[6],
  },
  label: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 11,
    lineHeight: 15.4,
    letterSpacing: 0.6,
    marginBottom: Spacing[2],
  },
  pillRow: {
    gap: Spacing[2],
    paddingBottom: Spacing[2],
  },
  categoryPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: Radius.full,
    paddingHorizontal: Spacing[3],
    paddingVertical: Spacing[2],
  },
  categoryPillText: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 12,
    lineHeight: 18,
  },
  // Amount
  amountSection: {
    alignItems: 'center',
    paddingVertical: Spacing[10],
  },
  amountTouchable: {
    alignItems: 'center',
  },
  amountCurrency: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: Spacing[1],
  },
  amountValue: {
    fontFamily: FontFamily.monoBold,
    fontSize: 48,
    lineHeight: 52,
  },
  hiddenInput: {
    position: 'absolute',
    opacity: 0,
    height: 0,
    width: 0,
  },
  // Quick amounts
  quickRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: Spacing[2],
    flexWrap: 'wrap',
  },
  quickPill: {
    borderRadius: Radius.full,
    paddingHorizontal: Spacing[4],
    paddingVertical: Spacing[2],
  },
  quickPillText: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 14,
    lineHeight: 20,
  },
  hint: {
    fontFamily: FontFamily.body,
    fontSize: 11,
    lineHeight: 15.4,
    textAlign: 'center',
    marginTop: Spacing[4],
  },
  footer: {
    paddingHorizontal: Spacing[5],
    paddingBottom: Spacing[4],
  },
});
