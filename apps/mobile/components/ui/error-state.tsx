import { useCallback, useRef, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';

import { FontFamily, Spacing } from '@/constants/theme';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { Button } from '@/components/ui/button';

export type ErrorStateCause = 'offline' | 'generic';

export interface ErrorStateProps {
  cause?: ErrorStateCause;
  retry?: () => void;
}

const RETRY_COOLDOWN_MS = 3000;

const COPY: Record<ErrorStateCause, { title: string; message: string }> = {
  offline: {
    title: "You're offline",
    message: "Check your connection — this will pick back up on its own once it's back.",
  },
  generic: {
    title: 'Something went wrong',
    message: "That didn't load. Give it another try.",
  },
};

// Shared failure state (Kingdom Radiant). No query/mutation/network call of
// its own — the final fallback wired alongside the boundary exists precisely
// because this component could still throw.
export function ErrorState({ cause = 'generic', retry }: ErrorStateProps) {
  const Colors = useThemeColors();
  const [coolingDown, setCoolingDown] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const copy = COPY[cause];

  const handleRetry = useCallback(() => {
    if (coolingDown || !retry) return;
    retry();
    setCoolingDown(true);
    timeoutRef.current = setTimeout(() => setCoolingDown(false), RETRY_COOLDOWN_MS);
  }, [coolingDown, retry]);

  return (
    <View
      style={styles.container}
      accessible
      accessibilityRole="alert"
      accessibilityLiveRegion="assertive"
    >
      <Text style={[styles.title, { color: Colors.onSurface }]}>{copy.title}</Text>
      <Text style={[styles.message, { color: Colors.outline }]}>{copy.message}</Text>
      {retry && (
        <View style={styles.retryWrap}>
          <Button
            label="Try again"
            variant="secondary"
            fullWidth={false}
            disabled={coolingDown}
            onPress={handleRetry}
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing[12],
    paddingHorizontal: Spacing[6],
    gap: Spacing[2],
  },
  title: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 16,
    textAlign: 'center',
  },
  message: {
    fontFamily: FontFamily.body,
    fontSize: 13,
    textAlign: 'center',
  },
  retryWrap: {
    marginTop: Spacing[3],
  },
});
