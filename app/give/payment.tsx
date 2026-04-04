import { useState } from 'react';
import {
  View, Text, Pressable, TextInput, ScrollView, StyleSheet,
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

type PaymentMethod = 'mobile_money' | 'card' | 'bank_transfer';

const METHODS: { key: PaymentMethod; label: string; icon: keyof typeof Ionicons.glyphMap; description: string }[] = [
  { key: 'mobile_money', label: 'Mobile Money', icon: 'phone-portrait-outline', description: 'MTN, Airtel, or other' },
  { key: 'card', label: 'Card Payment', icon: 'card-outline', description: 'Visa, Mastercard' },
  { key: 'bank_transfer', label: 'Bank Transfer', icon: 'business-outline', description: 'Direct bank deposit' },
];

export default function PaymentScreen() {
  const Colors = useThemeColors();
  const router = useRouter();
  const { data, updateData } = useGivingFlow();
  const [phoneNumber, setPhoneNumber] = useState(data.phoneNumber || '+256 ');

  const selectedMethod = data.paymentMethod;

  const selectMethod = (method: PaymentMethod) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    updateData({ paymentMethod: method });
  };

  const canProceed = () => {
    if (!selectedMethod) return false;
    if (selectedMethod === 'mobile_money' && phoneNumber.replace(/\s/g, '').length < 13) return false;
    return true;
  };

  const handleNext = () => {
    if (selectedMethod === 'mobile_money') {
      updateData({ phoneNumber });
    }
    router.push('/give/confirm');
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: Colors.surface }]} edges={['top', 'bottom']}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.backButton} accessibilityLabel="Go back">
          <Ionicons name="arrow-back" size={24} color={Colors.onSurface} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: Colors.onSurface }]}>Payment</Text>
        <View style={styles.backButton} />
      </View>

      <View style={styles.progress}>
        <ProgressBar totalSteps={4} currentStep={2} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Animated.View entering={FadeInUp.duration(300).delay(100)}>
          <Text style={[styles.label, { color: Colors.outline }]}>PAYMENT METHOD</Text>
        </Animated.View>

        {METHODS.map((method, index) => {
          const isSelected = selectedMethod === method.key;
          return (
            <Animated.View key={method.key} entering={FadeInUp.duration(300).delay(150 + index * 60)}>
              <Pressable
                onPress={() => selectMethod(method.key)}
                style={[
                  styles.methodCard,
                  { backgroundColor: isSelected ? Colors.primaryFixedDim : Colors.surfaceLowest },
                ]}
              >
                <View style={[styles.methodIcon, { backgroundColor: isSelected ? Colors.primaryLight : Colors.surfaceLow }]}>
                  <Ionicons name={method.icon} size={22} color={Colors.primary} />
                </View>
                <View style={styles.methodContent}>
                  <Text style={[styles.methodLabel, { color: Colors.onSurface }]}>{method.label}</Text>
                  <Text style={[styles.methodDesc, { color: Colors.onSurfaceVariant }]}>{method.description}</Text>
                </View>
                {isSelected && (
                  <Ionicons name="checkmark-circle" size={22} color={Colors.primary} />
                )}
                {isSelected && <View style={[styles.methodAccent, { backgroundColor: Colors.primary }]} />}
              </Pressable>
            </Animated.View>
          );
        })}

        {/* Mobile Money sub-form */}
        {selectedMethod === 'mobile_money' && (
          <Animated.View entering={FadeInDown.duration(300)} style={styles.subForm}>
            <Text style={[styles.subFormLabel, { color: Colors.onSurfaceVariant }]}>Phone number</Text>
            <TextInput
              style={[styles.phoneInput, { backgroundColor: Colors.surfaceLow, color: Colors.onSurface }]}
              value={phoneNumber}
              onChangeText={setPhoneNumber}
              keyboardType="phone-pad"
              placeholder="+256 7XX XXX XXX"
              placeholderTextColor={Colors.outline}
            />
          </Animated.View>
        )}

        {/* Bank transfer info */}
        {selectedMethod === 'bank_transfer' && (
          <Animated.View entering={FadeInDown.duration(300)} style={[styles.bankInfo, { backgroundColor: Colors.surfaceLow }]}>
            <Text style={[styles.bankInfoTitle, { color: Colors.onSurface }]}>Bank Details</Text>
            <View style={styles.bankRow}>
              <Text style={[styles.bankLabel, { color: Colors.outline }]}>Bank</Text>
              <Text style={[styles.bankValue, { color: Colors.onSurface }]}>Stanbic Bank Uganda</Text>
            </View>
            <View style={styles.bankRow}>
              <Text style={[styles.bankLabel, { color: Colors.outline }]}>Account</Text>
              <Text style={[styles.bankValue, { color: Colors.onSurface }]}>9030005678901</Text>
            </View>
            <View style={styles.bankRow}>
              <Text style={[styles.bankLabel, { color: Colors.outline }]}>Reference</Text>
              <Text style={[styles.bankValue, { color: Colors.primary }]}>KLT-GIVE-2026</Text>
            </View>
          </Animated.View>
        )}
      </ScrollView>

      {/* Next CTA */}
      <Animated.View entering={FadeInUp.duration(300).delay(400)} style={styles.footer}>
        <Button
          label="Next"
          variant="primary"
          disabled={!canProceed()}
          onPress={handleNext}
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
    marginBottom: Spacing[4],
  },
  // Method cards
  methodCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: Radius.lg,
    padding: Spacing[4],
    gap: Spacing[3],
    marginBottom: Spacing[3],
    overflow: 'hidden',
  },
  methodIcon: {
    width: 44,
    height: 44,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  methodContent: {
    flex: 1,
  },
  methodLabel: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 15,
    lineHeight: 20,
  },
  methodDesc: {
    fontFamily: FontFamily.body,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 1,
  },
  methodAccent: {
    position: 'absolute',
    bottom: 0,
    left: '15%',
    right: '15%',
    height: 2,
    borderRadius: 1,
  },
  // Sub-forms
  subForm: {
    marginTop: Spacing[2],
  },
  subFormLabel: {
    fontFamily: FontFamily.bodyMedium,
    fontSize: 13,
    lineHeight: 18,
    marginBottom: Spacing[2],
  },
  phoneInput: {
    borderRadius: Radius.md,
    padding: Spacing[4],
    fontFamily: FontFamily.mono,
    fontSize: 16,
    lineHeight: 24,
  },
  // Bank info
  bankInfo: {
    borderRadius: Radius.lg,
    padding: Spacing[4],
    marginTop: Spacing[2],
    gap: Spacing[3],
  },
  bankInfoTitle: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 14,
    lineHeight: 20,
  },
  bankRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  bankLabel: {
    fontFamily: FontFamily.body,
    fontSize: 12,
    lineHeight: 18,
  },
  bankValue: {
    fontFamily: FontFamily.bodyMedium,
    fontSize: 13,
    lineHeight: 18,
  },
  footer: {
    paddingHorizontal: Spacing[5],
    paddingBottom: Spacing[4],
  },
});
