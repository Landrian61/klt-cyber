import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useMutation } from 'convex/react';
import * as Haptics from 'expo-haptics';
import { SETTINGS_COPY } from '@klt-cyber/shared';

import { FontFamily, Spacing } from '@/constants/theme';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { useMyAccount } from '@/hooks/use-my-account';
import { authClient } from '@/lib/auth';
import { api } from '@/lib/api';
import { ErrorState } from '@/components/ui/error-state';
import {
  SettingsDivider,
  SettingsGroup,
  SettingsHeader,
  SettingsRow,
} from '@/components/settings/settings-ui';

/**
 * Whether this person signs in with a password (AC-21). `null` while the
 * account list loads or if it fails, which the row treats as "has one": the
 * password screen then gets a clean rejection from the server if it is wrong,
 * where hiding it would strand a real password user.
 */
function useHasCredentialAccount(): boolean | null {
  const [hasCredential, setHasCredential] = useState<boolean | null>(null);
  useEffect(() => {
    let cancelled = false;
    authClient
      .listAccounts()
      .then((result) => {
        if (cancelled || !result.data) return;
        setHasCredential(result.data.some((account) => account.providerId === 'credential'));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);
  return hasCredential;
}

/**
 * Settings (spec 0023, AC-17 to AC-21): Privacy (verified members only),
 * Notifications, Account and Help, in that order.
 */
export default function SettingsScreen() {
  const Colors = useThemeColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { account, profile, isLoading } = useMyAccount();
  const hasCredential = useHasCredentialAccount();

  const setDirectorySharing = useMutation(api.profile.setDirectorySharing);
  const unregisterPushToken = useMutation(api.notifications.unregisterMyPushNotificationToken);
  const [sharingBusy, setSharingBusy] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  // Privacy keys off the stored profile state, never `users.role` and never
  // roles (AC-17). Hiding it is UI only: the directory's own share to see
  // rule is what protects the data.
  const showPrivacy = profile?.profileStatus === 'verified';

  const onSharingChange = async (next: boolean) => {
    // Waits for the server rather than flipping optimistically: for a
    // disclosure choice, what the switch shows must be what is stored.
    setSharingBusy(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    try {
      await setDirectorySharing({ directorySharing: next });
    } catch {
      // The live query still holds the stored value, so the switch springs back.
    } finally {
      setSharingBusy(false);
    }
  };

  const signOut = async () => {
    setSigningOut(true);
    // Best effort: a failed unregister (offline, say) must not block sign
    // out. Without it this device's push token would stay on the account
    // signing out, and the next person to sign in here would share it.
    await unregisterPushToken().catch(() => {});
    try {
      await authClient.signOut();
    } catch {
      // Offline or a server error: let the row be tapped again.
    } finally {
      setSigningOut(false);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: Colors.surface }]}>
      <SettingsHeader title="Settings" />

      {isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={Colors.primary} />
        </View>
      ) : account === null ? (
        <View style={styles.centered}>
          <ErrorState />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + Spacing[8] }]}
          showsVerticalScrollIndicator={false}
        >
          {showPrivacy && profile ? (
            <SettingsGroup title={SETTINGS_COPY.groups.privacy}>
              <SettingsRow
                icon="people-outline"
                title={SETTINGS_COPY.directory.title}
                body={SETTINGS_COPY.directory.body}
                accessory={
                  <Switch
                    value={profile.directorySharing === true}
                    disabled={sharingBusy}
                    onValueChange={onSharingChange}
                    trackColor={{ false: Colors.surfaceHigh, true: Colors.primaryFixedDim }}
                    thumbColor={profile.directorySharing === true ? Colors.primary : Colors.outline}
                    accessibilityLabel="Let other members find me in the directory"
                  />
                }
              />
            </SettingsGroup>
          ) : null}

          <SettingsGroup title={SETTINGS_COPY.groups.notifications} delay={40}>
            <SettingsRow
              icon="notifications-outline"
              title={SETTINGS_COPY.notifications.rowTitle}
              body={SETTINGS_COPY.notifications.rowBody}
              onPress={() => router.push('/settings/notifications' as any)}
            />
          </SettingsGroup>

          <SettingsGroup title={SETTINGS_COPY.groups.account} delay={80}>
            {hasCredential === false ? (
              <SettingsRow icon="logo-google" title={SETTINGS_COPY.account.providerOnly} />
            ) : (
              <SettingsRow
                icon="key-outline"
                title={SETTINGS_COPY.account.changePassword}
                body={SETTINGS_COPY.account.changePasswordBody}
                onPress={() => router.push('/settings/change-password' as any)}
              />
            )}
            <SettingsDivider />
            <SettingsRow
              icon="log-out-outline"
              title={SETTINGS_COPY.account.signOut}
              tone="destructive"
              busy={signingOut}
              accessory={null}
              onPress={signOut}
            />
            <SettingsDivider />
            <SettingsRow
              icon="trash-outline"
              title={SETTINGS_COPY.account.deleteAccount}
              body={SETTINGS_COPY.account.deleteAccountBody}
              tone="destructive"
              onPress={() => router.push('/delete-account')}
            />
          </SettingsGroup>

          <SettingsGroup title={SETTINGS_COPY.groups.help} delay={120}>
            <SettingsRow
              icon="chatbubble-ellipses-outline"
              title={SETTINGS_COPY.help.rowTitle}
              body={SETTINGS_COPY.help.rowBody}
              onPress={() => router.push('/settings/help' as any)}
            />
          </SettingsGroup>

          {account?.user.email ? (
            <Text style={[styles.footnote, { color: Colors.outline }]}>
              Signed in as {account.user.email}
            </Text>
          ) : null}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, justifyContent: 'center', padding: Spacing[5] },
  body: { paddingHorizontal: Spacing[5], paddingTop: Spacing[2] },
  footnote: {
    fontFamily: FontFamily.body,
    fontSize: 12,
    lineHeight: 17,
    textAlign: 'center',
  },
});
