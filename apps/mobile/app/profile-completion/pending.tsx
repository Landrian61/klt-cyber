import { View, Text, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { FontFamily, Spacing } from '@/constants/theme';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { Button } from '@/components/ui/button';

/**
 * Shown when the caller already has a `pending_verification` profile — on a
 * fresh app open (via the gate) and right after a successful submission. No
 * form: the profile is with a church admin for review.
 */
export default function PendingReviewScreen() {
  const Colors = useThemeColors();
  const router = useRouter();

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: Colors.surface }]}>
      <View style={styles.center}>
        <View style={[styles.iconCircle, { backgroundColor: Colors.primaryLight }]}>
          <Ionicons name="hourglass-outline" size={40} color={Colors.primary} />
        </View>
        <Text style={[styles.title, { color: Colors.onSurface }]}>Your profile is under review</Text>
        <Text style={[styles.body, { color: Colors.onSurfaceVariant }]}>
          Thank you — your details have been submitted. A church admin will verify your profile,
          and you&apos;ll gain full member access once it&apos;s approved.
        </Text>
      </View>
      <View style={styles.footer}>
        <Button
          label="Back to home"
          variant="primary"
          fullWidth
          onPress={() => router.replace('/(tabs)')}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing[8],
  },
  iconCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing[5],
  },
  title: {
    fontFamily: FontFamily.display,
    fontSize: 24,
    lineHeight: 28.8,
    textAlign: 'center',
  },
  body: {
    fontFamily: FontFamily.body,
    fontSize: 14,
    lineHeight: 22.4,
    textAlign: 'center',
    marginTop: Spacing[3],
  },
  footer: {
    paddingHorizontal: Spacing[5],
    paddingBottom: Spacing[4],
  },
});
