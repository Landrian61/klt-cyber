import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SETTINGS_COPY } from '@klt-cyber/shared';

import { FontFamily, Radius, Spacing } from '@/constants/theme';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { NotificationPermissionRow } from '@/components/notification-permission-row';
import { SettingsGroup, SettingsHeader, SettingsRow } from '@/components/settings/settings-ui';

/**
 * Notification choices in one place (spec 0023, AC-19, M6-05): the push
 * permission row and followed radio programs. Feature 28 adds its category
 * switches to this same screen.
 */
export default function NotificationSettingsScreen() {
  const Colors = useThemeColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.container, { backgroundColor: Colors.surface }]}>
      <SettingsHeader title="Notifications" />
      <ScrollView
        contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + Spacing[8] }]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={[styles.intro, { color: Colors.onSurfaceVariant }]}>
          Choose how KLT reaches you on this phone.
        </Text>

        <SettingsGroup title="This device">
          {/* Self contained: renders nothing until its permission state is
              known, so the card keeps a short placeholder line meanwhile. */}
          <View style={styles.permission}>
            <NotificationPermissionRow />
          </View>
        </SettingsGroup>

        <SettingsGroup title="Reign Radio" delay={40}>
          <SettingsRow
            icon="radio-outline"
            title={SETTINGS_COPY.notifications.radioTitle}
            body={SETTINGS_COPY.notifications.radioBody}
            onPress={() => router.push('/radio-follows' as any)}
          />
        </SettingsGroup>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  body: { paddingHorizontal: Spacing[5], paddingTop: Spacing[2] },
  intro: {
    fontFamily: FontFamily.body,
    fontSize: 14,
    lineHeight: 21,
    marginBottom: Spacing[5],
  },
  permission: {
    paddingHorizontal: Spacing[4],
    paddingVertical: Spacing[2],
    minHeight: 64,
    justifyContent: 'center',
    borderRadius: Radius.lg,
  },
});
