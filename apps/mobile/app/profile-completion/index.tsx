import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { Redirect } from 'expo-router';
import { useQuery } from 'convex/react';

import { api } from '@/lib/api';
import { useThemeColors } from '@/hooks/use-theme-colors';

/**
 * Entry gate for the profile-completion flow (docs/Profile-completion-mobile.md).
 * `getMyProfileStatus()` decides what the user sees:
 *   - no profile         → start the 7-step wizard
 *   - pending_verification → the review-pending screen (no form)
 *   - verified           → nothing to do here; return to the app
 */
export default function ProfileCompletionGate() {
  const Colors = useThemeColors();
  const status = useQuery(api.profile.getMyProfileStatus);

  if (status === undefined) {
    return (
      <View style={[styles.center, { backgroundColor: Colors.surface }]}>
        <ActivityIndicator size="small" color={Colors.primary} />
      </View>
    );
  }

  if (status === null) return <Redirect href="/profile-completion/personal" />;
  if (status.profileStatus === 'pending_verification') {
    return <Redirect href="/profile-completion/pending" />;
  }
  // verified — the member experience applies; leave the flow.
  return <Redirect href="/(tabs)" />;
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
