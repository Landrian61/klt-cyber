"use client";

import * as React from "react";
import { useConvexConnectionState } from "convex/react";

// Grace period before a disconnected websocket counts as "offline" — a
// normal cold connect is briefly disconnected too, and without this every
// page load would flash the offline state.
const RECONNECT_GRACE_MS = 2500;

/**
 * Connectivity check (AC-2, spec 0002-error-screens.md). `navigator.onLine`
 * only reflects whether the device has a network interface up, not whether
 * it can reach anything — Wi-Fi connected to a router with no uplink still
 * reports `true`, which is exactly the case AC-2 is for. Convex's own
 * websocket connection state is the authoritative "can we reach the backend"
 * signal, so it's combined here (debounced by RECONNECT_GRACE_MS) rather than
 * relying on `navigator.onLine` alone.
 */
export function useIsOffline(): boolean {
  const [browserOffline, setBrowserOffline] = React.useState(false);
  const [backendUnreachable, setBackendUnreachable] = React.useState(false);
  const { isWebSocketConnected } = useConvexConnectionState();

  React.useEffect(() => {
    setBrowserOffline(!navigator.onLine);
    const onOnline = () => setBrowserOffline(false);
    const onOffline = () => setBrowserOffline(true);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  React.useEffect(() => {
    if (isWebSocketConnected) {
      setBackendUnreachable(false);
      return;
    }
    const timer = setTimeout(
      () => setBackendUnreachable(true),
      RECONNECT_GRACE_MS,
    );
    return () => clearTimeout(timer);
  }, [isWebSocketConnected]);

  return browserOffline || backendUnreachable;
}
