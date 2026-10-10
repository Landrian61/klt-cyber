import { useEffect, useState } from 'react';
import NetInfo from '@react-native-community/netinfo';

/**
 * Null-tolerant connectivity check (AC-2, spec 0002-error-screens.md):
 * NetInfo's `isConnected`/`isInternetReachable` can both be `null` while it's
 * still figuring things out — treated as online, not offline, so a cold
 * start never flashes an offline state it hasn't actually confirmed.
 */
export function useIsOffline(): boolean {
  const [isOffline, setIsOffline] = useState(false);

  useEffect(() => {
    return NetInfo.addEventListener((state) => {
      setIsOffline(state.isConnected === false || state.isInternetReachable === false);
    });
  }, []);

  return isOffline;
}
