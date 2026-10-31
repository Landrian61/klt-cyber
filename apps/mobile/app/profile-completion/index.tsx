import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { Redirect } from 'expo-router';
import { useQuery } from 'convex/react';

import { api } from '@/lib/api';
import { useThemeColors } from '@/hooks/use-theme-colors';

/**
 * Entry gate for the profile-completion flow.
 * `getMyProfileStatus()` decides what the user sees:
 *   - no profile           → start the 7-step wizard
 *   - pending_verification → the review-pending screen (no form)
 *   - sent_back            → the sent-back screen, carrying the reason
 *   - verified             → nothing to do here; return to the app
 *
 * Every state is matched EXPLICITLY and the fall-through is unreachable by
 * design (spec 0014, AC-31). It used to redirect `pending_verification` and
 * let everything else fall through to `/(tabs)`, which meant the moment
 * `sent_back` existed, somebody whose profile had been handed back landed in
 * the member experience instead of being shown what was asked of them. A
 * fall-through that silently swallows a new state is the defect this file is
 * most likely to ship, so a new `profileStatus` value should be added to the
 * switch below rather than left to the default.
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

  switch (status.profileStatus) {
    case 'pending_verification':
      return <Redirect href="/profile-completion/pending" />;
    case 'sent_back':
      return <Redirect href="/profile-completion/sent-back" />;
    case 'verified':
      // The member experience applies; leave the flow.
      return <Redirect href="/(tabs)" />;
  }
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
