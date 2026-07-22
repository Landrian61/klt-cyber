import type { ReactNode } from 'react';
import {
  ScrollView,
  View,
  Text,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';

import { FontFamily, Spacing } from '@/constants/theme';
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
  /** Optional secondary action shown above the primary button (e.g. "Skip"). */
  secondaryLabel?: string;
  onSecondary?: () => void;
  /** Small note rendered below the primary button. */
  footerNote?: string;
}

/**
 * Shared chrome for every wizard step: scrolling title/subtitle/body over a
 * pinned footer with a primary (and optional secondary) action. Keeps all seven
 * steps visually consistent and keyboard-safe.
 */
export function StepScaffold({
  title,
  subtitle,
  children,
  primaryLabel = 'Continue',
  onPrimary,
  primaryDisabled,
  primaryLoading,
  secondaryLabel,
  onSecondary,
  footerNote,
}: StepScaffoldProps) {
  const Colors = useThemeColors();

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={[styles.title, { color: Colors.onSurface }]}>{title}</Text>
        {subtitle ? (
          <Text style={[styles.subtitle, { color: Colors.onSurfaceVariant }]}>{subtitle}</Text>
        ) : (
          <View style={{ height: Spacing[5] }} />
        )}
        {children}
      </ScrollView>

      <View style={[styles.footer, { backgroundColor: Colors.surface }]}>
        {secondaryLabel && onSecondary ? (
          <View style={styles.secondary}>
            <Button label={secondaryLabel} variant="ghost" fullWidth onPress={onSecondary} />
          </View>
        ) : null}
        <Button
          label={primaryLabel}
          variant="primary"
          fullWidth
          disabled={primaryDisabled}
          loading={primaryLoading}
          onPress={onPrimary}
        />
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
  secondary: { marginBottom: Spacing[3] },
  footerNote: {
    fontFamily: FontFamily.body,
    fontSize: 12,
    lineHeight: 16,
    textAlign: 'center',
    marginTop: Spacing[3],
  },
});
