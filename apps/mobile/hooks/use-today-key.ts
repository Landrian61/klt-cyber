import { useEffect, useState } from "react";
import { AppState } from "react-native";
import { dateKeyFromMs, EAT_UTC_OFFSET_MS } from "@klt-cyber/shared";

const MS_PER_DAY = 86_400_000;

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

    const now = Date.now();
    const nextEatMidnight =
      Math.ceil((now + EAT_UTC_OFFSET_MS) / MS_PER_DAY) * MS_PER_DAY -
      EAT_UTC_OFFSET_MS;
    const timer = setTimeout(refresh, nextEatMidnight - now + 500);

    return () => {
      sub.remove();
      clearTimeout(timer);
    };
  }, [key]);

  return key;
}
