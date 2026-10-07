import { View, Text, Pressable, Switch, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import { FontFamily, Spacing } from '@/constants/theme';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { usePushPermission } from '@/hooks/use-push-permission';

/**
 * Profile-page notification settings row. Self-contained, like
 * `NotificationPermissionBanner` — reads its own permission state.
 *
 *   never-asked     → toggle off; turning it on requests permission.
 *   granted-active   → toggle on; turning it off pauses delivery.
 *   granted-paused   → toggle off; turning it on resumes delivery.
 *   denied           → no toggle at all — a switch here would silently do
 *                      nothing (OS permission is off), which is worse than
 *                      not showing one. Instead: a static, tappable row
 *                      explaining notifications are off in system settings.
 *
 * Renders nothing while `state` hasn't resolved yet (loading, or signed out).
 */
export function NotificationPermissionRow() {
  const Colors = useThemeColors();
  const {
    state, requestAndRegister, pause, resume, openSystemSettings,
  } = usePushPermission();

  if (!state) return null;

  if (state === 'denied') {
    return (
      <Pressable
        onPress={openSystemSettings}
        style={styles.row}
        accessibilityRole="button"
        accessibilityLabel="Notifications are off. Open system settings to turn them back on."
      >
        <View style={styles.label}>
          <Text style={[styles.title, { color: Colors.onSurface }]}>Push notifications</Text>
          <Text style={[styles.subtitle, { color: Colors.onSurfaceVariant }]}>
            Off in system settings
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color={Colors.outline} />
      </Pressable>
    );
  }

  const isOn = state === 'granted-active';

  const onValueChange = (next: boolean) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (state === 'never-asked') {
      if (next) requestAndRegister();
      return;
    }
    if (state === 'granted-active') {
      if (!next) pause();
      return;
    }
    // granted-paused
    if (next) resume();
  };

  return (
    <View style={styles.row}>
      <View style={styles.label}>
        <Text style={[styles.title, { color: Colors.onSurface }]}>Push notifications</Text>
        <Text style={[styles.subtitle, { color: Colors.onSurfaceVariant }]}>
          {isOn ? 'Service reminders, events, and announcements' : 'Currently paused'}
        </Text>
      </View>
      <Switch
        value={isOn}
        onValueChange={onValueChange}
        trackColor={{ false: Colors.surfaceHigh, true: Colors.primary }}
        thumbColor={Colors.surfaceLowest}
        ios_backgroundColor={Colors.surfaceHigh}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing[4],
    paddingVertical: 14,
  },
  label: { flex: 1 },
  title: { fontFamily: FontFamily.body, fontSize: 15, lineHeight: 20 },
  subtitle: { fontFamily: FontFamily.body, fontSize: 12.5, lineHeight: 17, marginTop: 2 },
});
