import { type ReactNode } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { FontFamily, Spacing } from '@/constants/theme';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { Button } from '@/components/ui/button';
import { useMyAccount } from '@/hooks/use-my-account';

export interface MemberGateProps {
  children: ReactNode;
  /** Short noun phrase for the feature being gated, e.g. "the announcements". */
  featureLabel?: string;
}

/**
 * Screen-level membership gate. Members see the wrapped screen; visitors see a
 * warm "Complete your profile" nudge that routes into the completion flow.
 *
 * The nudge lives at the screen level, not the navigation level — visitors keep
 * seeing the tab labels (what they're missing) without being funnelled.
 */
export function MemberGate({ children, featureLabel }: MemberGateProps) {
  const Colors = useThemeColors();
  const router = useRouter();
  const { isLoading, isMember, isPending } = useMyAccount();

  // Subtle, branded hold while the reactive query first resolves — no flash.
  if (isLoading) {
    return (
      <View style={[styles.loading, { backgroundColor: Colors.surface }]}>
        <ActivityIndicator size="small" color={Colors.primary} />
      </View>
    );
  }

  if (isMember) return <>{children}</>;

  // Submitted-but-unverified: reassure rather than re-prompt to "complete".
  if (isPending) {
    return (
      <View style={[styles.gate, { backgroundColor: Colors.surface }]}>
        <View style={[styles.iconCircle, { backgroundColor: Colors.primaryLight }]}>
          <Ionicons name="hourglass-outline" size={34} color={Colors.primary} />
        </View>
        <Text style={[styles.title, { color: Colors.onSurface }]}>Almost there</Text>
        <Text style={[styles.body, { color: Colors.onSurfaceVariant }]}>
          Your profile is with a church admin for verification. You&apos;ll unlock{' '}
          {featureLabel ?? 'this space'} once it&apos;s approved.
        </Text>
        <View style={styles.cta}>
          <Button
            label="View status"
            variant="primary"
            fullWidth
            onPress={() => router.push('/profile-completion' as any)}
          />
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.gate, { backgroundColor: Colors.surface }]}>
      <View style={[styles.iconCircle, { backgroundColor: Colors.primaryLight }]}>
        <Ionicons name="sparkles-outline" size={34} color={Colors.primary} />
      </View>
      <Text style={[styles.title, { color: Colors.onSurface }]}>Join the KLT family</Text>
      <Text style={[styles.body, { color: Colors.onSurfaceVariant }]}>
        Complete your member profile to unlock {featureLabel ?? 'this space'} and grow,
        connect, and serve with the church.
      </Text>
      <View style={styles.cta}>
        <Button
          label="Complete your profile"
          variant="primary"
          fullWidth
          onPress={() => router.push('/profile-completion' as any)}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gate: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing[8],
  },
  iconCircle: {
    width: 88,
    height: 88,
    borderRadius: 44,
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
  cta: {
    width: '100%',
    marginTop: Spacing[6],
  },
});
