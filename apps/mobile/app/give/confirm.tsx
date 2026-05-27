import { useState } from 'react';
import {
  View, Text, Pressable, Switch, ScrollView, StyleSheet,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInUp, FadeInDown } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';

import { FontFamily, Spacing, Radius } from '@/constants/theme';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { Button } from '@/components/ui/button';
import { ProgressBar } from '@/components/ui/progress-bar';
import { useGivingFlow } from '@/contexts/giving-flow-context';

const CATEGORY_LABELS: Record<string, string> = {
  tithe: 'Tithe',
  offering: 'Offering',
  seed: 'Seed',
  building: 'Building Project',
  missions: 'Missions',
  special: 'Special Gift',
};

const METHOD_LABELS: Record<string, string> = {
  mobile_money: 'Mobile Money',
  card: 'Card Payment',
  bank_transfer: 'Bank Transfer',
};

const FREQUENCY_OPTIONS = ['weekly', 'monthly', 'annually'] as const;

function formatAmount(value: number): string {
  return `UGX ${value.toLocaleString('en-UG')}`;
}

export default function ConfirmScreen() {
  const Colors = useThemeColors();
  const router = useRouter();
  const { data, updateData } = useGivingFlow();
  const [isLoading, setIsLoading] = useState(false);

  const handleConfirm = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setIsLoading(true);
    // Simulate payment processing
    await new Promise((resolve) => setTimeout(resolve, 1500));
    setIsLoading(false);
    router.push('/give/success');
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: Colors.surface }]} edges={['top', 'bottom']}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.backButton} accessibilityLabel="Go back">
          <Ionicons name="arrow-back" size={24} color={Colors.onSurface} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: Colors.onSurface }]}>Confirm</Text>
        <View style={styles.backButton} />
      </View>

      <View style={styles.progress}>
        <ProgressBar totalSteps={4} currentStep={3} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Summary card */}
        <Animated.View entering={FadeInUp.duration(300).delay(100)} style={[styles.summaryCard, { backgroundColor: Colors.surfaceLowest }]}>
          <View style={styles.summaryRow}>
            <Text style={[styles.summaryLabel, { color: Colors.outline }]}>Giving to</Text>
            <Text style={[styles.summaryValue, { color: Colors.onSurface }]}>
              {data.categories.map((c) => CATEGORY_LABELS[c] || c).join(', ')}
            </Text>
          </View>

          <View style={[styles.divider, { backgroundColor: Colors.surfaceLow }]} />

          <View style={styles.summaryRow}>
            <Text style={[styles.summaryLabel, { color: Colors.outline }]}>Amount</Text>
            <Text style={[styles.summaryAmount, { color: Colors.primary }]}>
              {formatAmount(data.amount)}
            </Text>
          </View>

          <View style={[styles.divider, { backgroundColor: Colors.surfaceLow }]} />

          <View style={styles.summaryRow}>
            <Text style={[styles.summaryLabel, { color: Colors.outline }]}>Payment</Text>
            <Text style={[styles.summaryValue, { color: Colors.onSurface }]}>
              {data.paymentMethod ? METHOD_LABELS[data.paymentMethod] : '—'}
            </Text>
          </View>

          {data.paymentMethod === 'mobile_money' && data.phoneNumber && (
            <>
              <View style={[styles.divider, { backgroundColor: Colors.surfaceLow }]} />
              <View style={styles.summaryRow}>
                <Text style={[styles.summaryLabel, { color: Colors.outline }]}>Phone</Text>
                <Text style={[styles.summaryValue, { color: Colors.onSurface }]}>{data.phoneNumber}</Text>
              </View>
            </>
          )}
        </Animated.View>

        {/* Anonymous toggle */}
        <Animated.View entering={FadeInUp.duration(300).delay(200)} style={[styles.toggleCard, { backgroundColor: Colors.surfaceLowest }]}>
          <View style={styles.toggleContent}>
            <Ionicons name="eye-off-outline" size={20} color={Colors.onSurfaceVariant} />
            <View style={styles.toggleText}>
              <Text style={[styles.toggleLabel, { color: Colors.onSurface }]}>Give anonymously</Text>
              <Text style={[styles.toggleDesc, { color: Colors.outline }]}>Your name will not be shown</Text>
            </View>
          </View>
          <Switch
            value={data.isAnonymous}
            onValueChange={(val) => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              updateData({ isAnonymous: val });
            }}
            trackColor={{ false: Colors.surfaceHigh, true: Colors.primaryFixedDim }}
            thumbColor={data.isAnonymous ? Colors.primary : Colors.outline}
          />
        </Animated.View>

        {/* Recurring toggle */}
        <Animated.View entering={FadeInUp.duration(300).delay(280)} style={[styles.toggleCard, { backgroundColor: Colors.surfaceLowest }]}>
          <View style={styles.toggleContent}>
            <Ionicons name="repeat-outline" size={20} color={Colors.onSurfaceVariant} />
            <View style={styles.toggleText}>
              <Text style={[styles.toggleLabel, { color: Colors.onSurface }]}>Make this recurring</Text>
              <Text style={[styles.toggleDesc, { color: Colors.outline }]}>Automatic repeat giving</Text>
            </View>
          </View>
          <Switch
            value={data.isRecurring}
            onValueChange={(val) => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              updateData({ isRecurring: val });
            }}
            trackColor={{ false: Colors.surfaceHigh, true: Colors.primaryFixedDim }}
            thumbColor={data.isRecurring ? Colors.primary : Colors.outline}
          />
        </Animated.View>

        {/* Frequency pills */}
        {data.isRecurring && (
          <Animated.View entering={FadeInDown.duration(300)} style={styles.frequencyRow}>
            {FREQUENCY_OPTIONS.map((freq) => {
              const isActive = data.recurringFrequency === freq;
              return (
                <Pressable
                  key={freq}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    updateData({ recurringFrequency: freq });
                  }}
                  style={[
                    styles.frequencyPill,
                    { backgroundColor: isActive ? Colors.primaryFixedDim : Colors.surfaceLowest },
                  ]}
                >
                  <Text style={[
                    styles.frequencyText,
                    { color: isActive ? Colors.primary : Colors.onSurfaceVariant },
                  ]}>
                    {freq.charAt(0).toUpperCase() + freq.slice(1)}
                  </Text>
                </Pressable>
              );
            })}
          </Animated.View>
        )}
      </ScrollView>

      {/* Confirm CTA */}
      <Animated.View entering={FadeInUp.duration(300).delay(400)} style={styles.footer}>
        <Button
          label={`Confirm and pay ${formatAmount(data.amount)}`}
          variant="primary"
          loading={isLoading}
          onPress={handleConfirm}
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
  // Summary
  summaryCard: {
    borderRadius: Radius.lg,
    padding: Spacing[4],
    marginBottom: Spacing[4],
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingVertical: Spacing[2],
  },
  summaryLabel: {
    fontFamily: FontFamily.body,
    fontSize: 13,
    lineHeight: 18,
    flex: 1,
  },
  summaryValue: {
    fontFamily: FontFamily.bodyMedium,
    fontSize: 13,
    lineHeight: 18,
    flex: 2,
    textAlign: 'right',
  },
  summaryAmount: {
    fontFamily: FontFamily.monoBold,
    fontSize: 16,
    lineHeight: 22,
    textAlign: 'right',
    flex: 2,
  },
  divider: {
    height: 1,
    marginVertical: Spacing[1],
  },
  // Toggle cards
  toggleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: Radius.lg,
    padding: Spacing[4],
    marginBottom: Spacing[3],
  },
  toggleContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[3],
    flex: 1,
  },
  toggleText: {
    flex: 1,
  },
  toggleLabel: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 14,
    lineHeight: 20,
  },
  toggleDesc: {
    fontFamily: FontFamily.body,
    fontSize: 11,
    lineHeight: 15.4,
    marginTop: 1,
  },
  // Frequency
  frequencyRow: {
    flexDirection: 'row',
    gap: Spacing[2],
    marginBottom: Spacing[3],
  },
  frequencyPill: {
    flex: 1,
    borderRadius: Radius.full,
    paddingVertical: Spacing[2],
    alignItems: 'center',
  },
  frequencyText: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 13,
    lineHeight: 18,
  },
  footer: {
    paddingHorizontal: Spacing[5],
    paddingBottom: Spacing[4],
  },
});
