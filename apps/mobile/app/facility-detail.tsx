import {
  View, Text, Pressable, StyleSheet, ScrollView, ActivityIndicator, Linking,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from 'convex/react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Animated, { FadeInUp } from 'react-native-reanimated';
import {
  RE_WEEKDAY_DISPLAY_ORDER,
  RE_WEEKDAY_LABELS,
  formatOpeningHoursEntry,
  isFacilityOpenNow,
  whatsAppDigits,
} from '@klt-cyber/shared';

import {
  FontFamily, Spacing, Radius, AmbientShadow,
} from '@/constants/theme';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { useBuildingClock } from '@/hooks/use-building-clock';
import { ErrorState } from '@/components/ui/error-state';
import { OpenPill } from '@/components/ui/open-pill';
import { api } from '@/lib/api';

/**
 * One facility in the Tower (spec 0018, AC-19, AC-23).
 *
 * Reachable only when the facility is actually in the app. A deep link to one
 * that is hidden, removed, unplaced, on a hidden floor, or simply never
 * existed resolves to null, and this screen says "no longer available" for all
 * of them without distinguishing: which one it is is Real Estate's business,
 * and that sentence is the whole of what the member can act on.
 */
export default function FacilityDetailScreen() {
  const Colors = useThemeColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const now = useBuildingClock();

  const facility = useQuery(
    api.facilities.getFacility,
    id ? { facilityId: id } : 'skip',
  );

  if (!id) {
    return (
      <Shell onBack={() => router.back()}>
        <ErrorState />
      </Shell>
    );
  }

  if (facility === undefined) {
    return (
      <Shell onBack={() => router.back()}>
        <View style={styles.loading}>
          <ActivityIndicator color={Colors.primary} />
        </View>
      </Shell>
    );
  }

  if (facility === null) {
    return (
      <Shell onBack={() => router.back()}>
        <View style={styles.gone}>
          <Ionicons name="business-outline" size={40} color={Colors.outline} />
          <Text style={[styles.goneTitle, { color: Colors.onSurfaceVariant }]}>
            This is no longer available
          </Text>
        </View>
      </Shell>
    );
  }

  const state = isFacilityOpenNow(facility.openingHours, now);

  const call = () => {
    if (!facility.contactPhone) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    // `tel:` takes the stored E.164 value exactly as it is.
    void Linking.openURL(`tel:${facility.contactPhone}`);
  };

  const openWhatsApp = () => {
    if (!facility.contactWhatsapp) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const text = encodeURIComponent(
      `Hello, I am asking about ${facility.name} at the Tower of Faith.`,
    );
    // `wa.me` wants the digits with no leading plus. That difference lives in
    // exactly one place: `whatsAppDigits` in @klt-cyber/shared.
    void Linking.openURL(
      `https://wa.me/${whatsAppDigits(facility.contactWhatsapp)}?text=${text}`,
    );
  };

  return (
    <Shell onBack={() => router.back()}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.content,
          { paddingBottom: insets.bottom + Spacing[8] },
        ]}
      >
        <Gallery urls={facility.photoUrls} />

        <View style={styles.headerBlock}>
          <Text style={[styles.title, { color: Colors.onSurface }]}>
            {facility.name}
          </Text>
          {facility.tagline ? (
            <Text style={[styles.tagline, { color: Colors.onSurfaceVariant }]}>
              {facility.tagline}
            </Text>
          ) : null}
          <View style={styles.statusRow}>
            <OpenPill state={state} />
            <Text style={[styles.floor, { color: Colors.onSurfaceVariant }]}>
              {facility.floorName}
            </Text>
          </View>
        </View>

        {/* Contact. Each button renders only when its number exists, rather
            than offering one that dials nothing (AC-19). */}
        {(facility.contactPhone || facility.contactWhatsapp) && (
          <View style={styles.actions}>
            {facility.contactWhatsapp ? (
              <Pressable
                onPress={openWhatsApp}
                accessibilityRole="button"
                accessibilityLabel={`Message ${facility.name} on WhatsApp`}
                style={[styles.action, { backgroundColor: Colors.primary }]}
              >
                <Ionicons name="logo-whatsapp" size={18} color={Colors.onPrimary} />
                <Text style={[styles.actionLabel, { color: Colors.onPrimary }]}>
                  WhatsApp
                </Text>
              </Pressable>
            ) : null}
            {facility.contactPhone ? (
              <Pressable
                onPress={call}
                accessibilityRole="button"
                accessibilityLabel={`Call ${facility.name}`}
                style={[
                  styles.action,
                  { backgroundColor: Colors.surfaceContainer },
                ]}
              >
                <Ionicons name="call-outline" size={18} color={Colors.onSurface} />
                <Text style={[styles.actionLabel, { color: Colors.onSurface }]}>
                  Call
                </Text>
              </Pressable>
            ) : null}
          </View>
        )}

        {facility.description ? (
          <Panel>
            <Text style={[styles.body, { color: Colors.onSurfaceVariant }]}>
              {facility.description}
            </Text>
          </Panel>
        ) : null}

        {facility.servicesOffered.length > 0 ? (
          <Panel title="What you will find here">
            <View style={styles.services}>
              {facility.servicesOffered.map((service) => (
                <View key={service} style={styles.serviceRow}>
                  <Ionicons
                    name="checkmark-circle"
                    size={16}
                    color={Colors.primary}
                  />
                  <Text style={[styles.body, { color: Colors.onSurfaceVariant }]}>
                    {service}
                  </Text>
                </View>
              ))}
            </View>
          </Panel>
        ) : null}

        {/* Hours. Read Monday first, though weekday 0 is stored as Sunday. */}
        {facility.openingHours && facility.openingHours.length > 0 ? (
          <Panel title="Opening hours">
            <View style={styles.hours}>
              {RE_WEEKDAY_DISPLAY_ORDER.map((weekday) => {
                const entry = facility.openingHours?.find(
                  (candidate) => candidate.weekday === weekday,
                );
                const closed = !entry || entry.closed;
                return (
                  <View key={weekday} style={styles.hoursRow}>
                    <Text
                      style={[styles.hoursDay, { color: Colors.onSurfaceVariant }]}
                    >
                      {RE_WEEKDAY_LABELS[weekday]}
                    </Text>
                    <Text
                      style={[
                        styles.hoursValue,
                        { color: closed ? Colors.outline : Colors.onSurface },
                      ]}
                    >
                      {entry ? formatOpeningHoursEntry(entry) : 'Closed'}
                    </Text>
                  </View>
                );
              })}
            </View>
          </Panel>
        ) : (
          <Panel title="Opening hours">
            <Text style={[styles.body, { color: Colors.onSurfaceVariant }]}>
              Not listed yet. Call or message and they will tell you.
            </Text>
          </Panel>
        )}

        {facility.responsibleName ? (
          <Panel title="Who to ask for">
            <Text style={[styles.body, { color: Colors.onSurfaceVariant }]}>
              {facility.responsibleName}
            </Text>
          </Panel>
        ) : null}
      </ScrollView>
    </Shell>
  );
}

/**
 * The photo gallery: a horizontal, paged scroll.
 *
 * `photoUrls[0]` is the cover, so the first thing in view is the same picture
 * the card showed, which keeps the tap feeling like it went somewhere rather
 * than somewhere else.
 */
function Gallery({ urls }: { urls: string[] }) {
  const Colors = useThemeColors();

  if (urls.length === 0) {
    return (
      <View
        style={[styles.heroEmpty, { backgroundColor: Colors.surfaceContainer }]}
      >
        <Ionicons name="business-outline" size={32} color={Colors.outline} />
      </View>
    );
  }

  if (urls.length === 1) {
    return (
      <Animated.Image
        entering={FadeInUp.duration(320)}
        source={{ uri: urls[0] }}
        resizeMode="cover"
        style={styles.hero}
        accessibilityIgnoresInvertColors
      />
    );
  }

  return (
    <ScrollView
      horizontal
      pagingEnabled
      showsHorizontalScrollIndicator={false}
      style={styles.gallery}
      accessibilityLabel={`${urls.length} photos`}
    >
      {urls.map((url, index) => (
        <Animated.Image
          key={url}
          entering={FadeInUp.duration(320).delay(index * 60)}
          source={{ uri: url }}
          resizeMode="cover"
          style={styles.galleryImage}
          accessibilityIgnoresInvertColors
        />
      ))}
    </ScrollView>
  );
}

function Panel({
  title,
  children,
}: {
  title?: string;
  children: React.ReactNode;
}) {
  const Colors = useThemeColors();
  return (
    <Animated.View
      entering={FadeInUp.duration(320).delay(80)}
      style={[
        styles.panel,
        AmbientShadow,
        { backgroundColor: Colors.surfaceLowest },
      ]}
    >
      {title ? (
        <Text style={[styles.panelTitle, { color: Colors.onSurface }]}>
          {title}
        </Text>
      ) : null}
      {children}
    </Animated.View>
  );
}

function Shell({
  onBack,
  children,
}: {
  onBack: () => void;
  children: React.ReactNode;
}) {
  const Colors = useThemeColors();
  const insets = useSafeAreaInsets();
  return (
    <View
      style={[
        styles.container,
        { paddingTop: insets.top, backgroundColor: Colors.surface },
      ]}
    >
      <View style={styles.header}>
        <Pressable
          onPress={onBack}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          style={styles.backButton}
        >
          <Ionicons name="arrow-back" size={24} color={Colors.onSurface} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: Colors.onSurface }]}>
          Tower of Faith
        </Text>
        <View style={styles.backButton} />
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing[4],
    paddingVertical: Spacing[3],
  },
  backButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 18, lineHeight: 24, fontFamily: FontFamily.displaySemi },

  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  gone: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing[3] },
  goneTitle: { fontSize: 16, lineHeight: 22, fontFamily: FontFamily.body },

  content: { paddingHorizontal: Spacing[5], paddingTop: Spacing[2], gap: Spacing[5] },

  hero: { height: 220, borderRadius: Radius.xl, width: '100%' },
  heroEmpty: {
    height: 220,
    borderRadius: Radius.xl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gallery: { height: 220 },
  galleryImage: {
    height: 220,
    width: 300,
    borderRadius: Radius.xl,
    marginRight: Spacing[2],
  },

  headerBlock: { gap: Spacing[2] },
  title: { fontSize: 24, lineHeight: 30, fontFamily: FontFamily.display },
  tagline: { fontSize: 15, lineHeight: 23, fontFamily: FontFamily.body },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing[3] },
  floor: { fontSize: 13, lineHeight: 18, fontFamily: FontFamily.body },

  actions: { flexDirection: 'row', gap: Spacing[3] },
  action: {
    flex: 1,
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing[2],
    borderRadius: Radius.full,
  },
  actionLabel: { fontSize: 15, lineHeight: 20, fontFamily: FontFamily.bodySemiBold },

  panel: { padding: Spacing[4], borderRadius: Radius.xl, gap: Spacing[2] },
  panelTitle: { fontSize: 15, lineHeight: 20, fontFamily: FontFamily.bodySemiBold },
  body: { fontSize: 14, lineHeight: 21, fontFamily: FontFamily.body, flex: 1 },

  services: { gap: Spacing[2] },
  serviceRow: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing[2] },

  hours: { gap: Spacing[2] },
  hoursRow: { flexDirection: 'row', justifyContent: 'space-between', gap: Spacing[3] },
  hoursDay: { fontSize: 14, lineHeight: 20, fontFamily: FontFamily.body },
  hoursValue: { fontSize: 14, lineHeight: 20, fontFamily: FontFamily.bodyMedium },
});
