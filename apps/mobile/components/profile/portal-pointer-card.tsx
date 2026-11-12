import { Linking, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInUp, useReducedMotion } from 'react-native-reanimated';
import { SETTINGS_COPY } from '@klt-cyber/shared';

import { FontFamily, HeavenGradient, Radius, ShadowE1, Spacing } from '@/constants/theme';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { Button } from '@/components/ui/button';

const PORTAL_URL = process.env.EXPO_PUBLIC_PORTAL_URL;

if (__DEV__ && !PORTAL_URL) {
  // AC-6: the card still explains itself, but there is nowhere to send people.
  console.warn('EXPO_PUBLIC_PORTAL_URL is not set; the web portal button is hidden.');
}

export interface PortalPointerCardProps {
  /** Why the portal has work for this person, from `getMyChurchLife`. */
  reasons: string[];
  delay?: number;
}

/**
 * Points a person with portal work at the web portal (spec 0023, AC-5, AC-6).
 * UX only: the portal's own middleware and Convex checks are the real gate.
 */
export function PortalPointerCard({ reasons, delay = 0 }: PortalPointerCardProps) {
  const Colors = useThemeColors();
  const reduceMotion = useReducedMotion();

  return (
    <Animated.View
      entering={reduceMotion ? undefined : FadeInUp.duration(320).delay(delay)}
      style={[styles.card, ShadowE1]}
    >
      <LinearGradient
        colors={[...HeavenGradient.colors]}
        start={{ x: 0.1, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.gradient}
      >
        <View style={styles.titleRow}>
          <View style={styles.iconWell}>
            <Ionicons name="desktop-outline" size={18} color={Colors.onTertiary} />
          </View>
          <Text style={[styles.title, { color: Colors.onTertiary }]}>
            {SETTINGS_COPY.portal.title}
          </Text>
        </View>
        <Text style={[styles.because, { color: Colors.onTertiary }]}>
          {SETTINGS_COPY.portal.because}
        </Text>
        <View style={styles.reasons}>
          {reasons.map((reason) => (
            <View key={reason} style={styles.reasonPill}>
              <Text style={[styles.reasonText, { color: Colors.onTertiary }]}>{reason}</Text>
            </View>
          ))}
        </View>
        {PORTAL_URL ? (
          <View style={styles.cta}>
            <Button
              label={SETTINGS_COPY.portal.button}
              variant="primary"
              fullWidth
              icon={<Ionicons name="open-outline" size={18} color={Colors.onPrimary} />}
              onPress={() => {
                Linking.openURL(PORTAL_URL).catch(() => {});
              }}
              accessibilityLabel="Open the web portal in your browser"
            />
          </View>
        ) : null}
      </LinearGradient>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: Radius.lg, marginBottom: Spacing[4] },
  gradient: { borderRadius: Radius.lg, padding: Spacing[5] },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing[3] },
  iconWell: {
    width: 36,
    height: 36,
    borderRadius: Radius.full,
    backgroundColor: 'rgba(255,255,255,0.16)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { flex: 1, fontFamily: FontFamily.displaySemi, fontSize: 18, lineHeight: 24 },
  because: {
    fontFamily: FontFamily.body,
    fontSize: 13,
    lineHeight: 19,
    opacity: 0.8,
    marginTop: Spacing[3],
  },
  reasons: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing[2], marginTop: Spacing[2] },
  reasonPill: {
    borderRadius: Radius.full,
    paddingHorizontal: Spacing[3],
    paddingVertical: 6,
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
  reasonText: { fontFamily: FontFamily.bodySemiBold, fontSize: 13, lineHeight: 18 },
  cta: { marginTop: Spacing[4] },
});
