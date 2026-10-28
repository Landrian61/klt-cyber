import { View, Text, Pressable, ScrollView, StyleSheet, Linking } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInUp } from 'react-native-reanimated';

import { PORTAL_WORK_COPY, PORTAL_WORK_TYPES, type PortalWorkType } from '@klt-cyber/shared';

import { FontFamily, Spacing, Radius, ShadowE1 } from '@/constants/theme';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

function isPortalWorkType(value: string | undefined): value is PortalWorkType {
  return (PORTAL_WORK_TYPES as readonly string[]).includes(value ?? '');
}

/**
 * What a tap on a "work is waiting for you" notice opens (spec 0013, AC-16):
 * a profile to review, a request to join a roster, or a notice from another
 * HOD. That work is done on the web portal, so this screen says what is
 * waiting and links there. It reads nothing from the server: the copy is keyed
 * by the notice's deep link type alone.
 */
export default function PortalWorkScreen() {
  const Colors = useThemeColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { type } = useLocalSearchParams<{ type?: string }>();
  const portalUrl = process.env.EXPO_PUBLIC_PORTAL_URL;

  const header = (
    <View style={styles.header}>
      <Pressable onPress={() => router.back()} hitSlop={12} style={styles.backButton} accessibilityLabel="Go back">
        <Ionicons name="arrow-back" size={24} color={Colors.onSurface} />
      </Pressable>
    </View>
  );

  if (!isPortalWorkType(type)) {
    return (
      <View style={[styles.container, { backgroundColor: Colors.surface, paddingTop: insets.top }]}>
        {header}
        <View style={styles.fallback}>
          <Text style={[styles.fallbackText, { color: Colors.onSurfaceVariant }]}>
            This notice is no longer available
          </Text>
          <Button label="Go back" variant="ghost" fullWidth={false} onPress={() => router.back()} />
        </View>
      </View>
    );
  }

  const copy = PORTAL_WORK_COPY[type];

  return (
    <View style={[styles.container, { backgroundColor: Colors.surface, paddingTop: insets.top }]}>
      {header}
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + Spacing[6] }]}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View entering={FadeInUp.duration(300)} style={styles.metaRow}>
          <Badge label="Waiting for you" variant="pending" />
        </Animated.View>

        <Animated.Text
          entering={FadeInUp.duration(300).delay(80)}
          style={[styles.title, { color: Colors.onSurface }]}
          accessibilityRole="header"
        >
          {copy.title}
        </Animated.Text>

        <Animated.View
          entering={FadeInUp.duration(300).delay(160)}
          style={[styles.card, ShadowE1, { backgroundColor: Colors.surfaceLowest }]}
        >
          <Text style={[styles.body, { color: Colors.onSurfaceVariant }]}>{copy.body}</Text>
        </Animated.View>

        {portalUrl && (
          <Animated.View entering={FadeInUp.duration(300).delay(240)} style={styles.actions}>
            <Button label="Open the web portal" onPress={() => Linking.openURL(portalUrl).catch(() => {})} />
            <Text style={[styles.hint, { color: Colors.outline }]}>Sign in with this same account.</Text>
          </Animated.View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  fallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing[4],
    paddingHorizontal: Spacing[5],
  },
  fallbackText: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 16,
    lineHeight: 24,
    textAlign: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing[5],
    paddingVertical: Spacing[2],
  },
  backButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    paddingHorizontal: Spacing[5],
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing[3],
  },
  title: {
    fontFamily: FontFamily.display,
    fontSize: 24,
    lineHeight: 30,
    marginBottom: Spacing[5],
  },
  card: {
    borderRadius: Radius.lg,
    padding: Spacing[5],
  },
  body: {
    fontFamily: FontFamily.body,
    fontSize: 15,
    lineHeight: 24,
  },
  actions: {
    marginTop: Spacing[6],
    gap: Spacing[3],
    alignItems: 'center',
  },
  hint: {
    fontFamily: FontFamily.body,
    fontSize: 13,
    lineHeight: 18,
  },
});
