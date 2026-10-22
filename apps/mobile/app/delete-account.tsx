import { useState } from 'react';
import {
  View, Text, StyleSheet, ActivityIndicator, Pressable, ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { useAction, useQuery } from 'convex/react';
import * as Haptics from 'expo-haptics';
import Animated, { FadeIn, FadeInUp, useReducedMotion } from 'react-native-reanimated';

import {
  ACCOUNT_DELETION_ERROR_MESSAGES,
  ACCOUNT_DELETION_FINAL_WARNING,
  ACCOUNT_DELETION_KEPT,
  ACCOUNT_DELETION_REMOVED,
  accountDeletionErrorMessage,
  accountDeletionExpiryLabel,
} from '@klt-cyber/shared';

import { FontFamily, Spacing, Radius, ShadowE1 } from '@/constants/theme';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { authClient } from '@/lib/auth';
import { api } from '@/lib/api';

/**
 * Delete account (SRS F1-06, spec 0008).
 *
 * The screen's whole job is to make sure nobody arrives here by accident and
 * leaves without an account. There is no undo and no waiting period, so the
 * weight has to sit in the confirmation rather than in a recovery path that
 * does not exist.
 *
 * Three things carry that weight, in this order: the person reads what goes
 * and what stays BEFORE any destructive control is offered (AC-1), the delete
 * button stays disabled until they have typed their password, and the password
 * itself is checked server side before a single row is touched (AC-2, AC-23).
 *
 * Deliberately not a modal or an alert. An alert is something you dismiss; a
 * screen is something you read.
 */
export default function DeleteAccountScreen() {
  const Colors = useThemeColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();

  // `precheck` answers "may this account be deleted, and is a password the way
  // to prove it" before anything is rendered (AC-9, AC-17), so the screen
  // never offers a password field it would only reject, and never offers
  // deletion to the last System Admin at all.
  const precheck = useQuery(api.accountDeletion.precheck);
  const deleteMyAccount = useAction(api.accountDeletion.deleteMyAccount);
  const requestEmailedLink = useAction(api.accountDeletion.requestEmailedLink);

  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [linkSent, setLinkSent] = useState(false);

  const goBack = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.back();
  };

  const handleDelete = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setError(null);
    setBusy(true);

    // No push-token unregister here, unlike sign out: `performDeletion` removes
    // it server side, inside the deletion transaction. Doing it from the client
    // meant it had to run BEFORE the password was checked (an anonymized
    // account can no longer authenticate, AC-19), so a mistyped password left
    // the device unregistered on an account that still existed — a refusal has
    // to leave every row untouched (AC-23).
    try {
      await deleteMyAccount({ password });
    } catch (err) {
      setBusy(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setError(accountDeletionErrorMessage(err));
      return;
    }

    // The account is gone. Every server session went with it, so this is about
    // this device: drop the stored session and the cached identity so the app
    // returns to the signed out state instead of holding a token for an
    // account that no longer exists (AC-10). It is wrapped because the
    // server side session rows are already deleted, which can make the sign
    // out call itself fail — and by then there is nothing left to undo.
    await authClient.signOut().catch(() => {});
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    router.replace('/(auth)/welcome');
  };

  const handleRequestLink = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setError(null);
    setBusy(true);
    try {
      await requestEmailedLink();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setLinkSent(true);
    } catch (err) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setError(accountDeletionErrorMessage(err));
    }
    setBusy(false);
  };

  const header = (
    <View style={styles.headerRow}>
      <Pressable
        onPress={goBack}
        hitSlop={12}
        style={[styles.backButton, { backgroundColor: Colors.surfaceLow }]}
        accessibilityRole="button"
        accessibilityLabel="Go back without deleting your account"
      >
        <Ionicons name="chevron-back" size={22} color={Colors.onSurface} />
      </Pressable>
    </View>
  );

  // `undefined` is Convex still loading; `null` is this query's unauthenticated
  // answer, which is what a live subscription returns the moment the deletion
  // signs this device out. Neither is an error, and neither should flash one
  // on screen while the app is already navigating away.
  if (precheck === undefined || precheck === null) {
    return (
      <View style={[styles.center, { backgroundColor: Colors.surface }]}>
        <StatusBar style="dark" />
        <ActivityIndicator size="small" color={Colors.primary} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: Colors.surface, paddingTop: insets.top }]}>
      <StatusBar style="dark" />
      {header}

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + Spacing[8] }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <Animated.View entering={reduceMotion ? undefined : FadeInUp.duration(360)}>
          <Text style={[styles.title, { color: Colors.onSurface }]}>Delete your account</Text>
          <Text style={[styles.lede, { color: Colors.onSurfaceVariant }]}>
            You are always welcome here, and you are welcome to leave. Please read
            this first, so nothing about it surprises you afterwards.
          </Text>
        </Animated.View>

        {/* The last System Admin cannot delete their own account, and is told
            why rather than simply refused (AC-9). The destructive controls are
            not rendered at all in this state, so there is nothing to tap. */}
        {!precheck.canDelete ? (
          <Animated.View
            entering={reduceMotion ? undefined : FadeInUp.duration(360).delay(80)}
            style={[styles.card, ShadowE1, { backgroundColor: Colors.warningLight }]}
          >
            <View style={styles.cardHeading}>
              <Ionicons name="shield-half" size={18} color={Colors.warning} />
              <Text style={[styles.cardTitle, { color: Colors.onSurface }]}>
                Not just yet
              </Text>
            </View>
            <Text style={[styles.body, { color: Colors.onSurfaceVariant }]}>
              {ACCOUNT_DELETION_ERROR_MESSAGES.LAST_SYSTEM_ADMIN}
            </Text>
            <View style={styles.actions}>
              <Button label="Go back" variant="ghost" fullWidth onPress={goBack} />
            </View>
          </Animated.View>
        ) : (
          <>
            <Animated.View
              entering={reduceMotion ? undefined : FadeInUp.duration(360).delay(80)}
              style={[styles.card, ShadowE1, { backgroundColor: Colors.surfaceLowest }]}
            >
              <View style={styles.cardHeading}>
                <Ionicons name="trash-outline" size={18} color={Colors.error} />
                <Text style={[styles.cardTitle, { color: Colors.onSurface }]}>
                  What is removed
                </Text>
              </View>
              {ACCOUNT_DELETION_REMOVED.map((item) => (
                <View key={item} style={styles.bulletRow}>
                  <View style={[styles.bullet, { backgroundColor: Colors.error }]} />
                  <Text style={[styles.bulletText, { color: Colors.onSurfaceVariant }]}>{item}</Text>
                </View>
              ))}
            </Animated.View>

            <Animated.View
              entering={reduceMotion ? undefined : FadeInUp.duration(360).delay(140)}
              style={[styles.card, ShadowE1, { backgroundColor: Colors.surfaceLowest }]}
            >
              <View style={styles.cardHeading}>
                <Ionicons name="archive-outline" size={18} color={Colors.primary} />
                <Text style={[styles.cardTitle, { color: Colors.onSurface }]}>
                  What the church keeps
                </Text>
              </View>
              {ACCOUNT_DELETION_KEPT.map((item) => (
                <View key={item} style={styles.bulletRow}>
                  <View style={[styles.bullet, { backgroundColor: Colors.primary }]} />
                  <Text style={[styles.bulletText, { color: Colors.onSurfaceVariant }]}>{item}</Text>
                </View>
              ))}
              <Text style={[styles.footnote, { color: Colors.faint }]}>
                Nothing kept has your name on it.
              </Text>
            </Animated.View>

            <Animated.View
              entering={reduceMotion ? undefined : FadeInUp.duration(360).delay(200)}
              style={[styles.warning, { backgroundColor: Colors.secondaryLight }]}
            >
              <Ionicons name="alert-circle" size={18} color={Colors.error} />
              <Text style={[styles.warningText, { color: Colors.onSurface }]}>
                {ACCOUNT_DELETION_FINAL_WARNING}
              </Text>
            </Animated.View>

            {/* Only now, after all of the above has been read past, is anything
                destructive offered (AC-1). */}
            <Animated.View
              entering={reduceMotion ? undefined : FadeInUp.duration(360).delay(260)}
              style={styles.confirmBlock}
            >
              {precheck.hasPassword ? (
                <>
                  <Input
                    label="Confirm your password"
                    value={password}
                    onChangeText={(next) => {
                      setPassword(next);
                      if (error) setError(null);
                    }}
                    secureTextEntry
                    autoCapitalize="none"
                    autoComplete="current-password"
                    textContentType="password"
                    editable={!busy}
                    helperText="Typing your password is the last step. Nothing is deleted before it is checked."
                    {...(error ? { error } : {})}
                  />
                  <Button
                    label="Delete my account"
                    variant="destructive"
                    fullWidth
                    loading={busy}
                    // Disabled until there is something to check, so the most
                    // destructive control on the screen cannot be hit by a
                    // stray tap on arrival.
                    disabled={password.length === 0 || busy}
                    onPress={handleDelete}
                  />
                </>
              ) : linkSent ? (
                <Animated.View
                  entering={reduceMotion ? undefined : FadeIn.duration(320)}
                  style={[styles.card, { backgroundColor: Colors.surfaceLowest }]}
                >
                  <View style={styles.cardHeading}>
                    <Ionicons name="mail-outline" size={18} color={Colors.success} />
                    <Text style={[styles.cardTitle, { color: Colors.onSurface }]}>
                      Check your inbox
                    </Text>
                  </View>
                  <Text style={[styles.body, { color: Colors.onSurfaceVariant }]}>
                    We have sent a link to the address on your account. Opening it
                    deletes your account straight away. The link works once and
                    expires in {accountDeletionExpiryLabel()}.
                  </Text>
                </Animated.View>
              ) : (
                <>
                  {/* A Google account has no password to confirm, so the
                      emailed link is the proof instead (AC-17). The screen
                      knew which of the two this was before anything was
                      typed, so no password field was ever shown here. */}
                  <Text style={[styles.body, { color: Colors.onSurfaceVariant }]}>
                    {ACCOUNT_DELETION_ERROR_MESSAGES.NO_PASSWORD_CREDENTIAL}
                  </Text>
                  {error ? (
                    <Text style={[styles.errorText, { color: Colors.error }]}>{error}</Text>
                  ) : null}
                  <Button
                    label="Email me a deletion link"
                    variant="destructive"
                    fullWidth
                    loading={busy}
                    disabled={busy}
                    onPress={handleRequestLink}
                  />
                </>
              )}

              <Button label="Keep my account" variant="ghost" fullWidth onPress={goBack} />
            </Animated.View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  headerRow: {
    paddingHorizontal: Spacing[5],
    paddingTop: Spacing[2],
    paddingBottom: Spacing[2],
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },

  content: {
    paddingHorizontal: Spacing[5],
    gap: Spacing[4],
  },

  title: {
    fontFamily: FontFamily.display,
    fontSize: 28,
    lineHeight: 34,
    marginBottom: Spacing[2],
  },
  lede: {
    fontFamily: FontFamily.body,
    fontSize: 15,
    lineHeight: 23,
  },

  card: {
    borderRadius: Radius.lg,
    padding: Spacing[4],
    gap: Spacing[2],
  },
  cardHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[2],
    marginBottom: Spacing[1],
  },
  cardTitle: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 15,
  },

  bulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing[3],
  },
  bullet: {
    width: 6,
    height: 6,
    borderRadius: Radius.full,
    marginTop: 8,
  },
  bulletText: {
    flex: 1,
    fontFamily: FontFamily.body,
    fontSize: 14,
    lineHeight: 22,
  },

  body: {
    fontFamily: FontFamily.body,
    fontSize: 14,
    lineHeight: 22,
  },
  footnote: {
    fontFamily: FontFamily.body,
    fontSize: 12,
    lineHeight: 18,
    marginTop: Spacing[1],
  },
  errorText: {
    fontFamily: FontFamily.body,
    fontSize: 13,
    lineHeight: 20,
  },

  warning: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing[3],
    borderRadius: Radius.lg,
    padding: Spacing[4],
  },
  warningText: {
    flex: 1,
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 14,
    lineHeight: 22,
  },

  confirmBlock: {
    gap: Spacing[3],
    marginTop: Spacing[2],
  },
  actions: {
    marginTop: Spacing[2],
  },
});
