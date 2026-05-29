import { createAuthClient } from 'better-auth/react';
import { convexClient } from '@convex-dev/better-auth/client/plugins';
import { expoClient } from '@better-auth/expo/client';
import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';

/*
  Better Auth Expo client.

  Unlike the web admin (PR 3), the mobile app talks DIRECTLY to the Convex
  deployment's HTTP-actions origin (*.convex.site) rather than through a
  same-origin proxy. The `expoClient` plugin handles that cross-origin flow
  natively: it persists the session cookie in expo-secure-store and replays it
  on each request, and tags requests with an `expo-origin` header that the
  backend's crossDomain plugin recognises. Session tokens therefore live ONLY
  in the secure keychain — never AsyncStorage or memory.

  OAuth redirects use the app `scheme` ("kltcyber") declared in app.json.
*/
const scheme = Constants.expoConfig?.scheme as string;

export const authClient = createAuthClient({
  baseURL: process.env.EXPO_PUBLIC_CONVEX_SITE_URL,
  plugins: [
    expoClient({
      scheme,
      storagePrefix: scheme,
      storage: SecureStore,
    }),
    convexClient(),
  ],
});
