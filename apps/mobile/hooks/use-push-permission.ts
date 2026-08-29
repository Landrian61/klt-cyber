import { useCallback, useEffect, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Linking from 'expo-linking';
import Constants from 'expo-constants';
import { useMutation, useQuery } from 'convex/react';

import { api } from '@/lib/api';

// Inferred from the real getPermissionsAsync() return type rather than a
// guessed import path — expo-notifications re-exports PermissionResponse's
// shape but not the PermissionStatus enum itself from its public surface.
type OsPermissionStatus = Awaited<ReturnType<typeof Notifications.getPermissionsAsync>>['status'];

/**
 * The four states the notification-permission UI (Home banner, Profile
 * toggle) renders. Resolved by combining the OS-level permission
 * (`Notifications.getPermissionsAsync()`) with the app-level pause state
 * (`api.notifications.getMyPushStatus`, backed by
 * `@convex-dev/expo-push-notifications`) — OS permission alone can't tell
 * "paused" from "active", and the component's status alone can't tell
 * "never asked" from "denied".
 */
export type PushPermissionState =
  | 'never-asked'
  | 'granted-active'
  | 'granted-paused'
  | 'denied';

/**
 * Resolves the caller's current push-notification permission state and the
 * actions the Home banner (`NotificationPermissionBanner`) and Profile
 * toggle (`NotificationPermissionRow`) drive it with.
 *
 * `state` is `undefined` until both halves have resolved at least once, or
 * while signed out (`getMyPushStatus` returns null) — callers should render
 * nothing in that case, same as other `isLoading`-gated components in this
 * app (see `useMyAccount`).
 */
export function usePushPermission() {
  const [osStatus, setOsStatus] = useState<OsPermissionStatus | null>(null);
  const pushStatus = useQuery(api.notifications.getMyPushStatus);
  const recordToken = useMutation(api.notifications.recordPushNotificationToken);
  const pauseMutation = useMutation(api.notifications.pauseMyPushNotifications);
  const resumeMutation = useMutation(api.notifications.resumeMyPushNotifications);

  const refreshOsStatus = useCallback(async () => {
    const { status } = await Notifications.getPermissionsAsync();
    setOsStatus(status);
    return status;
  }, []);

  useEffect(() => {
    refreshOsStatus();
  }, [refreshOsStatus]);

  /**
   * Fetches a fresh Expo push token and records it against the caller.
   * Silent — no UI. Used both right after a permission grant and on the
   * foreground token-refresh below.
   */
  const registerToken = useCallback(async () => {
    const projectId = Constants.expoConfig?.extra?.eas?.projectId as string | undefined;
    const { data: pushToken } = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined
    );
    await recordToken({ pushToken });
  }, [recordToken]);

  const state: PushPermissionState | undefined =
    osStatus === null || pushStatus === undefined || pushStatus === null
      ? undefined
      : osStatus !== 'granted'
        ? osStatus === 'undetermined'
          ? 'never-asked'
          : 'denied'
        : pushStatus.paused
          ? 'granted-paused'
          : 'granted-active';

  // Part F — silent token refresh on foreground. OS permission exists
  // either way for granted-active/granted-paused, so this is never
  // user-visible: just keep the stored token current in case it rotated.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
      if (next !== 'active') return;
      refreshOsStatus().then((status) => {
        if (status === 'granted') registerToken().catch(() => {});
      });
    });
    return () => sub.remove();
  }, [refreshOsStatus, registerToken]);

  /**
   * Requests OS permission; on grant, fetches and records the push token.
   * On denial, does nothing further — `state` resolves to "denied" on the
   * next read (there's no separate denied-handling branch here).
   */
  const requestAndRegister = useCallback(async () => {
    const { status } = await Notifications.requestPermissionsAsync();
    setOsStatus(status);
    if (status === 'granted') await registerToken();
  }, [registerToken]);

  const openSystemSettings = useCallback(() => {
    Linking.openSettings();
  }, []);

  return {
    state,
    requestAndRegister,
    openSystemSettings,
    pause: pauseMutation,
    resume: resumeMutation,
  };
}
