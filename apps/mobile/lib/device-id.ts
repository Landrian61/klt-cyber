import AsyncStorage from '@react-native-async-storage/async-storage';

// This phone's own identity for the activity counts (spec 0011, AC-2).
//
// Generated once on the device and kept in AsyncStorage, never derived on the
// server: the server only knows which account called, and the same account on
// two phones has to produce two rows. Deliberately not expo-secure-store —
// this is not a secret and it is not personal; it is an opaque value whose
// only job is to stop one phone being counted twice.
//
// Losing it (reinstall, storage cleared) just means this phone starts a fresh
// row, which over-counts slightly rather than losing the phone. That is the
// right way round for a figure whose question is "how many phones have the
// app signed in".

const DEVICE_ID_KEY = '@klt-cyber/device-id';

// In-memory cache: the id is read on every launch and on every return to the
// foreground, and it never changes within a session.
let cached: string | null = null;

/** This phone's stable id, generated and stored on first call. */
export async function getDeviceId(): Promise<string> {
  if (cached) return cached;

  const stored = await AsyncStorage.getItem(DEVICE_ID_KEY);
  if (stored) {
    cached = stored;
    return stored;
  }

  // Hermes exposes crypto.randomUUID on modern React Native; fall back to a
  // random string of the same shape when it does not, because failing to
  // generate an id must not be allowed to break app launch.
  const fresh =
    typeof globalThis.crypto?.randomUUID === 'function'
      ? globalThis.crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 14)}`;

  await AsyncStorage.setItem(DEVICE_ID_KEY, fresh);
  cached = fresh;
  return fresh;
}
