"use client";

import { useEffect, useRef } from "react";
import { useConvexAuth, useMutation } from "convex/react";
import { ACTIVITY_REPORT_THROTTLE_MS } from "@klt-cyber/shared";
import { api } from "@/lib/api";

/**
 * Reports "the portal is being used" (spec 0011, SRS F1-11).
 *
 * Renders nothing. Fires on mount and whenever the tab regains focus, which
 * together cover the two ways a portal session comes back to life: a fresh
 * navigation, and a tab left open overnight.
 *
 * It sends no device fields. `userDevices` counts phones, and a browser is not
 * one — the table has no `web` member precisely so a reporter like this one
 * cannot add browsers to the phone counts by accident.
 *
 * Failure is swallowed. Nothing on this page depends on the report landing,
 * and a missed hour costs one data point on an internal analytics page.
 */
export function ActivityReporter() {
  const { isAuthenticated } = useConvexAuth();
  const recordActivity = useMutation(api.activity.recordActivity);
  // A ref, not state: reporting must not re-render the portal shell it sits
  // in, and the focus listener has to read the latest value without being
  // rebuilt after every report.
  const lastReportedAt = useRef(0);

  useEffect(() => {
    if (!isAuthenticated) {
      // Sign-out resets the local clock, so the next person to sign in on
      // this browser reports immediately rather than inheriting the hour
      // somebody else already spent.
      lastReportedAt.current = 0;
      return;
    }

    async function report() {
      const now = Date.now();
      // The client's copy of the rule is an optimisation only; the server
      // does its own 55-minute check and is the real cap.
      if (now - lastReportedAt.current < ACTIVITY_REPORT_THROTTLE_MS) return;
      lastReportedAt.current = now;

      try {
        await recordActivity({});
      } catch {
        // Let the next focus try again rather than holding the claimed slot
        // for an hour over what may have been a blip.
        lastReportedAt.current = 0;
      }
    }

    report();

    function onVisibilityChange() {
      if (document.visibilityState === "visible") report();
    }

    // Both, deliberately: `visibilitychange` catches a tab switch within the
    // same window, `focus` catches the window itself coming back from behind
    // another application. The throttle makes the overlap free.
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("focus", report);

    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("focus", report);
    };
  }, [isAuthenticated, recordActivity]);

  return null;
}
