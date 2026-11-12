import { useState } from 'react';
import {
  Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View,
} from 'react-native';
import { useNavigation, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { SETTINGS_COPY, signUpInputSchema } from '@klt-cyber/shared';

import { FontFamily, Radius, ShadowE1, Spacing } from '@/constants/theme';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { authClient } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SettingsHeader } from '@/components/settings/settings-ui';

type FieldErrors = Partial<Record<'current' | 'next' | 'confirm' | 'form', string>>;

/**
 * Change password (spec 0023, AC-22; F1-04). Uses the sign up password rule,
 * and signs out every other device on success; this device stays signed in.
 */
export default function ChangePasswordScreen() {
  const Colors = useThemeColors();
  const router = useRouter();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();

  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitting, setSubmitting] = useState(false);

  const validate = (): FieldErrors => {
    const found: FieldErrors = {};
    if (!current) found.current = 'Enter your current password';
    if (!signUpInputSchema.shape.password.safeParse(next).success) {
      found.next = SETTINGS_COPY.password.tooShort;
    }
    if (next !== confirm) found.confirm = SETTINGS_COPY.password.mismatch;
    return found;
  };

  const onSubmit = async () => {
    const found = validate();
    setErrors(found);
    if (Object.keys(found).length > 0) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
      return;
    }
    setSubmitting(true);
    try {
      const result = await authClient.changePassword({
        currentPassword: current,
        newPassword: next,
        revokeOtherSessions: true,
      });
      if (result.error) {
        // Inputs are kept either way, so a retry needs no retyping.
        setErrors(
          result.error.code === 'INVALID_PASSWORD'
            ? { current: SETTINGS_COPY.password.wrongCurrent }
            : { form: SETTINGS_COPY.password.generic }
        );
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
        return;
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      Alert.alert(SETTINGS_COPY.password.title, SETTINGS_COPY.password.success, [
        {
          text: 'OK',
          onPress: () => (navigation.canGoBack() ? router.back() : router.replace('/settings' as any)),
        },
      ]);
    } catch {
      setErrors({ form: SETTINGS_COPY.password.generic });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: Colors.surface }]}>
      <SettingsHeader title={SETTINGS_COPY.password.title} backDisabled={submitting} />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + Spacing[8] }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Text style={[styles.intro, { color: Colors.onSurfaceVariant }]}>
            Use at least 8 characters. Once it changes, every other device signed in to your
            account is signed out. This phone stays signed in.
          </Text>

          <View style={[styles.card, ShadowE1, { backgroundColor: Colors.surfaceLowest }]}>
            <Input
              label={SETTINGS_COPY.password.current}
              value={current}
              onChangeText={(v) => {
                setCurrent(v);
                if (errors.current) setErrors((e) => ({ ...e, current: undefined }));
              }}
              secureTextEntry
              autoCapitalize="none"
              autoComplete="current-password"
              textContentType="password"
              error={errors.current}
              icon="lock-closed-outline"
            />
            <Input
              label={SETTINGS_COPY.password.next}
              value={next}
              onChangeText={(v) => {
                setNext(v);
                if (errors.next) setErrors((e) => ({ ...e, next: undefined }));
              }}
              secureTextEntry
              autoCapitalize="none"
              autoComplete="new-password"
              textContentType="newPassword"
              error={errors.next}
              icon="key-outline"
            />
            <Input
              label={SETTINGS_COPY.password.confirm}
              value={confirm}
              onChangeText={(v) => {
                setConfirm(v);
                if (errors.confirm) setErrors((e) => ({ ...e, confirm: undefined }));
              }}
              secureTextEntry
              autoCapitalize="none"
              autoComplete="new-password"
              textContentType="newPassword"
              error={errors.confirm}
              icon="key-outline"
              onSubmitEditing={onSubmit}
              returnKeyType="done"
            />
          </View>

          {errors.form ? (
            <View
              style={[styles.formError, { backgroundColor: Colors.secondaryLight }]}
              accessibilityLiveRegion="polite"
            >
              <Text style={[styles.formErrorText, { color: Colors.secondary }]}>{errors.form}</Text>
            </View>
          ) : null}

          <Button
            label={SETTINGS_COPY.password.submit}
            variant="primary"
            fullWidth
            loading={submitting}
            onPress={onSubmit}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  flex: { flex: 1 },
  body: { paddingHorizontal: Spacing[5], paddingTop: Spacing[2], gap: Spacing[4] },
  intro: { fontFamily: FontFamily.body, fontSize: 14, lineHeight: 21 },
  card: { borderRadius: Radius.lg, padding: Spacing[4], gap: Spacing[2] },
  formError: { borderRadius: Radius.md, padding: Spacing[3] },
  formErrorText: { fontFamily: FontFamily.bodyMedium, fontSize: 13, lineHeight: 19 },
});
