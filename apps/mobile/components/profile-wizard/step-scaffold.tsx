import type { ReactNode } from 'react';
import {
  ScrollView,
  View,
  Text,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInDown, useReducedMotion } from 'react-native-reanimated';

import { FontFamily, Spacing, AmbientShadowUp } from '@/constants/theme';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { Button } from '@/components/ui/button';

export interface StepScaffoldProps {
  title: string;
  subtitle?: string;
  children: ReactNode;
  primaryLabel?: string;
  onPrimary: () => void;
  primaryDisabled?: boolean;
  primaryLoading?: boolean;
  /** Show a Back button paired with the primary action (default true). */
  showBack?: boolean;
  /** Small note rendered below the buttons. */
  footerNote?: string;
}

/**
 * Shared chrome for every wizard step: a scrolling title/subtitle/body over a
 * pinned footer that pairs a Back button with the primary action — so each
 * section can be revisited and the user sees how the flow is structured. The
 * whole thing is keyboard-aware: the footer lifts above the keyboard and the
 * focused field scrolls into the visible area.
 */
export function StepScaffold({
  title,
  subtitle,
  children,
  primaryLabel = 'Continue',
  onPrimary,
  primaryDisabled,
  primaryLoading,
  showBack = true,
  footerNote,
}: StepScaffoldProps) {
  const Colors = useThemeColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();

  // When a step is opened from the review preview (`?returnTo=1`), it's an edit,
  // not a forward walk: the primary action saves-in-place (the draft is shared)
  // and returns to review, and the redundant Back button is dropped.
  const { returnTo } = useLocalSearchParams<{ returnTo?: string }>();
  const editing = returnTo === '1';
  const resolvedPrimaryLabel = editing ? 'Save changes' : primaryLabel;
  const resolvedOnPrimary = editing ? () => router.back() : onPrimary;
  const resolvedShowBack = editing ? false : showBack;

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 24}
    >
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        <Animated.View entering={reduceMotion ? undefined : FadeInDown.duration(360)}>
          <Text style={[styles.title, { color: Colors.onSurface }]}>{title}</Text>
          {subtitle ? (
            <Text style={[styles.subtitle, { color: Colors.onSurfaceVariant }]}>{subtitle}</Text>
          ) : (
            <View style={{ height: Spacing[5] }} />
          )}
        </Animated.View>
        {children}
      </ScrollView>

      {/* Pinned action bar — floats over the scrolling body via an upward
          ambient shadow (No-Line), and clears the home indicator. */}
      <View
        style={[
          styles.footer,
          { backgroundColor: Colors.surface, paddingBottom: insets.bottom + Spacing[4] },
          AmbientShadowUp,
        ]}
      >
        <View style={styles.footerRow}>
          {resolvedShowBack && router.canGoBack() ? (
            <View style={styles.backWrap}>
              <Button label="Back" variant="ghost" fullWidth onPress={() => router.back()} />
            </View>
          ) : null}
          <View style={styles.primaryWrap}>
            <Button
              label={resolvedPrimaryLabel}
              variant="primary"
              fullWidth
              disabled={primaryDisabled}
              loading={primaryLoading}
              onPress={resolvedOnPrimary}
            />
          </View>
        </View>
        {footerNote ? (
          <Text style={[styles.footerNote, { color: Colors.outline }]}>{footerNote}</Text>
        ) : null}
      </View>
    </KeyboardAvoidingView>
  );
}

/** A vertical-rhythm wrapper for a single field within a step. */
export function WizardField({ children }: { children: ReactNode }) {
  return <View style={styles.field}>{children}</View>;
}

/** Small uppercase section label matching the profile card style. */
export function FieldLabel({ children }: { children: ReactNode }) {
  const Colors = useThemeColors();
  return <Text style={[styles.fieldLabel, { color: Colors.onSurface }]}>{children}</Text>;
}

/** A faint hint line beneath a control. */
export function Hint({ children }: { children: ReactNode }) {
  const Colors = useThemeColors();
  return <Text style={[styles.hint, { color: Colors.outline }]}>{children}</Text>;
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { flex: 1 },
  content: {
    paddingHorizontal: Spacing[5],
    paddingBottom: Spacing[10],
  },
  title: {
    fontFamily: FontFamily.display,
    fontSize: 24,
    lineHeight: 28.8,
  },
  subtitle: {
    fontFamily: FontFamily.body,
    fontSize: 14,
    lineHeight: 22.4,
    marginTop: Spacing[2],
    marginBottom: Spacing[5],
  },
  field: { marginBottom: Spacing[5] },
  fieldLabel: {
    fontFamily: FontFamily.bodyMedium,
    fontSize: 13,
    lineHeight: 18,
    marginBottom: Spacing[2],
  },
  hint: {
    fontFamily: FontFamily.body,
    fontSize: 12,
    lineHeight: 16,
    marginTop: 6,
    paddingLeft: 2,
  },
  footer: {
    paddingHorizontal: Spacing[5],
    paddingTop: Spacing[3],
    paddingBottom: Spacing[4],
  },
  footerRow: {
    flexDirection: 'row',
    gap: Spacing[3],
  },
  backWrap: { flex: 1 },
  primaryWrap: { flex: 1.8 },
  footerNote: {
    fontFamily: FontFamily.body,
    fontSize: 12,
    lineHeight: 16,
    textAlign: 'center',
    marginTop: Spacing[3],
  },
});
