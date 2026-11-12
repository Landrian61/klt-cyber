import { Linking, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Constants from 'expo-constants';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInUp, useReducedMotion } from 'react-native-reanimated';
import { SETTINGS_COPY, SUPPORT_CONTACT, buildSupportWhatsAppUrl } from '@klt-cyber/shared';

import { FontFamily, Radius, ShadowE1, Spacing } from '@/constants/theme';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { Button } from '@/components/ui/button';
import { SettingsHeader } from '@/components/settings/settings-ui';

/**
 * Help & Support (spec 0023, AC-23, AC-24; F5-11, M6-07). One WhatsApp button
 * with a prefilled message carrying only the app version and the platform.
 */
export default function HelpScreen() {
  const Colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();

  const url = buildSupportWhatsAppUrl(SUPPORT_CONTACT, {
    version: Constants.expoConfig?.version,
    platform: Platform.OS,
  });

  return (
    <View style={[styles.container, { backgroundColor: Colors.surface }]}>
      <SettingsHeader title={SETTINGS_COPY.help.title} />
      <ScrollView
        contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + Spacing[8] }]}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View
          entering={reduceMotion ? undefined : FadeInUp.duration(320)}
          style={[styles.card, ShadowE1, { backgroundColor: Colors.surfaceLowest }]}
        >
          <View style={[styles.iconWell, { backgroundColor: Colors.primaryLight }]}>
            <Ionicons name="chatbubbles-outline" size={28} color={Colors.primary} />
          </View>
          <Text style={[styles.title, { color: Colors.onSurface }]}>We&apos;re here to help</Text>
          <Text style={[styles.text, { color: Colors.onSurfaceVariant }]}>
            {SETTINGS_COPY.help.who(SUPPORT_CONTACT.name)}
          </Text>

          {url ? (
            <View style={styles.cta}>
              <Button
                label={SETTINGS_COPY.help.button}
                variant="primary"
                fullWidth
                icon={<Ionicons name="logo-whatsapp" size={18} color={Colors.onPrimary} />}
                onPress={() => {
                  // Without WhatsApp installed, wa.me opens in the browser,
                  // which is an acceptable fallback (AC-23).
                  Linking.openURL(url).catch(() => {});
                }}
              />
            </View>
          ) : (
            <View style={[styles.notice, { backgroundColor: Colors.surfaceLow }]}>
              <Ionicons name="construct-outline" size={18} color={Colors.onSurfaceVariant} />
              <Text style={[styles.noticeText, { color: Colors.onSurfaceVariant }]}>
                {SETTINGS_COPY.help.notSetUp}
              </Text>
            </View>
          )}
        </Animated.View>

        <Text style={[styles.footnote, { color: Colors.outline }]}>
          Your message says which app version and phone type you use, nothing else.
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  body: { paddingHorizontal: Spacing[5], paddingTop: Spacing[2] },
  card: {
    borderRadius: Radius.lg,
    padding: Spacing[6],
    alignItems: 'center',
    marginBottom: Spacing[4],
  },
  iconWell: {
    width: 64,
    height: 64,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing[4],
  },
  title: {
    fontFamily: FontFamily.displaySemi,
    fontSize: 22,
    lineHeight: 28,
    textAlign: 'center',
  },
  text: {
    fontFamily: FontFamily.body,
    fontSize: 14,
    lineHeight: 22,
    textAlign: 'center',
    marginTop: Spacing[2],
  },
  cta: { alignSelf: 'stretch', marginTop: Spacing[5] },
  notice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[2],
    borderRadius: Radius.md,
    padding: Spacing[3],
    marginTop: Spacing[5],
    alignSelf: 'stretch',
  },
  noticeText: { flex: 1, fontFamily: FontFamily.bodyMedium, fontSize: 13, lineHeight: 19 },
  footnote: {
    fontFamily: FontFamily.body,
    fontSize: 12,
    lineHeight: 17,
    textAlign: 'center',
  },
});
