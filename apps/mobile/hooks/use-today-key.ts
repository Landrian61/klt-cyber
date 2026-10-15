import { useEffect, useState } from "react";
import { AppState } from "react-native";
import { dateKeyFromMs } from "@klt-cyber/shared";

export function useTodayKey(): string {
  const [key, setKey] = useState(() => dateKeyFromMs(Date.now()));

  useEffect(() => {
    function refresh() {
      setKey((prev) => {
        const next = dateKeyFromMs(Date.now());
        return next === prev ? prev : next;
      });
    }

    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") refresh();
    });

    const now = new Date();
    const msUntilMidnight =
      new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime() -
      now.getTime() +
      500;
    const timer = setTimeout(refresh, msUntilMidnight);

    return () => {
      sub.remove();
      clearTimeout(timer);
    };
  }, []);

  return key;
}
