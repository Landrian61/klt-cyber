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
  formatSpacePrice,
  formatSpaceSize,
  whatsAppDigits,
} from '@klt-cyber/shared';

import {
  FontFamily, Spacing, Radius, AmbientShadow,
} from '@/constants/theme';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { ErrorState } from '@/components/ui/error-state';
import { api } from '@/lib/api';

/**
 * One space to let (spec 0018, AC-21).
 *
 * The contact buttons here reach the LETTING DESK rather than the space, and
 * the number behind each is resolved on the server: a listing may override
 * either field, and whichever it leaves blank falls back independently to the
 * Real Estate department's own number. Resolving it server side is what stops
 * this screen and the portal disagreeing about which number a member dials.
 *
 * A `let` space resolves to null here even by deep link, so a space taken off
 * the market cannot be reached from an old message.
 */
export default function SpaceDetailScreen() {
  const Colors = useThemeColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id?: string }>();

  const space = useQuery(
    api.realEstate.getSpace,
    id ? { spaceId: id } : 'skip',
  );

  if (!id) {
    return (
      <Shell onBack={() => router.back()}>
        <ErrorState />
      </Shell>
    );
  }

  if (space === undefined) {
    return (
      <Shell onBack={() => router.back()}>
        <View style={styles.loading}>
          <ActivityIndicator color={Colors.primary} />
        </View>
      </Shell>
    );
  }

  if (space === null) {
    return (
      <Shell onBack={() => router.back()}>
        <View style={styles.gone}>
          <Ionicons name="key-outline" size={40} color={Colors.outline} />
          <Text style={[styles.goneTitle, { color: Colors.onSurfaceVariant }]}>
            This is no longer available
          </Text>
        </View>
      </Shell>
    );
  }

  const call = () => {
    if (!space.contactPhone) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    void Linking.openURL(`tel:${space.contactPhone}`);
  };

  const openWhatsApp = () => {
    if (!space.contactWhatsapp) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const text = encodeURIComponent(
      `Hello, I am asking about "${space.title}" available to let at the Tower of Faith.`,
    );
    void Linking.openURL(
      `https://wa.me/${whatsAppDigits(space.contactWhatsapp)}?text=${text}`,
    );
  };

  // Neither number set means neither button renders, and the screen still
  // shows everything else rather than looking broken (AC-21).
  const hasContact = !!space.contactPhone || !!space.contactWhatsapp;

  return (
    <Shell onBack={() => router.back()}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.content,
          { paddingBottom: insets.bottom + Spacing[8] },
        ]}
      >
        <Gallery urls={space.photoUrls} />

        <View style={styles.headerBlock}>
          <Text style={[styles.title, { color: Colors.onSurface }]}>
            {space.title}
          </Text>
          <Text style={[styles.meta, { color: Colors.onSurfaceVariant }]}>
            {space.floorName}
            {space.sizeSqm !== undefined
              ? ` · ${formatSpaceSize(space.sizeSqm)}`
              : ''}
          </Text>
          <View style={styles.priceRow}>
            {/* Mono, because this is a figure. */}
            <Text style={[styles.price, { color: Colors.primary }]}>
              {formatSpacePrice(space.priceUgxPerMonth)}
            </Text>
            {space.priceUgxPerMonth !== undefined ? (
              <Text style={[styles.perMonth, { color: Colors.onSurfaceVariant }]}>
                per month
              </Text>
            ) : null}
            {space.status === 'reserved' ? (
              <View
                style={[styles.pill, { backgroundColor: Colors.surfaceContainer }]}
              >
                <Text
                  style={[styles.pillText, { color: Colors.onSurfaceVariant }]}
                >
                  Reserved
                </Text>
              </View>
            ) : null}
          </View>
        </View>

        {hasContact ? (
          <View style={styles.actions}>
            {space.contactWhatsapp ? (
              <Pressable
                onPress={openWhatsApp}
                accessibilityRole="button"
                accessibilityLabel={`Message the letting desk about ${space.title} on WhatsApp`}
                style={[styles.action, { backgroundColor: Colors.primary }]}
              >
                <Ionicons name="logo-whatsapp" size={18} color={Colors.onPrimary} />
                <Text style={[styles.actionLabel, { color: Colors.onPrimary }]}>
                  WhatsApp
                </Text>
              </Pressable>
            ) : null}
            {space.contactPhone ? (
              <Pressable
                onPress={call}
                accessibilityRole="button"
                accessibilityLabel={`Call the letting desk about ${space.title}`}
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
        ) : null}

        {space.description ? (
          <Animated.View
            entering={FadeInUp.duration(320).delay(80)}
            style={[
              styles.panel,
              AmbientShadow,
              { backgroundColor: Colors.surfaceLowest },
            ]}
          >
            <Text style={[styles.body, { color: Colors.onSurfaceVariant }]}>
              {space.description}
            </Text>
          </Animated.View>
        ) : null}
      </ScrollView>
    </Shell>
  );
}

/** The photos, `photoUrls[0]` first so the cover matches the card tapped. */
function Gallery({ urls }: { urls: string[] }) {
  const Colors = useThemeColors();

  if (urls.length === 0) {
    return (
      <View
        style={[styles.heroEmpty, { backgroundColor: Colors.surfaceContainer }]}
      >
        <Ionicons name="key-outline" size={32} color={Colors.outline} />
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
          Space to let
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
  meta: { fontSize: 15, lineHeight: 23, fontFamily: FontFamily.body },
  priceRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing[2] },
  price: { fontSize: 18, lineHeight: 24, fontFamily: FontFamily.monoBold },
  perMonth: { fontSize: 13, lineHeight: 18, fontFamily: FontFamily.body },

  pill: {
    paddingHorizontal: Spacing[2],
    paddingVertical: 2,
    borderRadius: Radius.full,
  },
  pillText: { fontSize: 11, lineHeight: 16, fontFamily: FontFamily.bodySemiBold },

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
  body: { fontSize: 14, lineHeight: 21, fontFamily: FontFamily.body },
});
