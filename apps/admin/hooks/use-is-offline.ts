"use client";

import * as React from "react";

/**
 * Null-tolerant connectivity check (AC-2, spec 0002-error-screens.md):
 * `navigator.onLine` is itself boolean-only on web, so there's no "unknown"
 * state to special-case here the way mobile's NetInfo has — this always
 * starts `false` (online) until a `offline` event says otherwise.
 */
export function useIsOffline(): boolean {
  const [isOffline, setIsOffline] = React.useState(false);

  React.useEffect(() => {
    setIsOffline(!navigator.onLine);
    const onOnline = () => setIsOffline(false);
    const onOffline = () => setIsOffline(true);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  return isOffline;
}
