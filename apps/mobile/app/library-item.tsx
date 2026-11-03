import { useCallback, useEffect, useState } from 'react';
import {
  View, Text, Pressable, StyleSheet, ScrollView, ActivityIndicator, Linking,
} from 'react-native';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { useAction, useQuery } from 'convex/react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as WebBrowser from 'expo-web-browser';
import * as Haptics from 'expo-haptics';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { useAudioPlayer, useAudioPlayerStatus, setAudioModeAsync } from 'expo-audio';
import { formatUgx, whatsAppDigits } from '@klt-cyber/shared';

import {
  FontFamily, Spacing, Radius, AmbientShadow, ShadowE1,
} from '@/constants/theme';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { Cover } from '@/components/ui/cover';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ErrorState } from '@/components/ui/error-state';
import { api } from '@/lib/api';

/**
 * One Library item (L1-05, L1-06, L2-02, L3-04).
 *
 * Two shapes behind one screen, decided by whether the item is free:
 *  - something you collect: the price, the "available at the Library desk"
 *    line, and one tap each to WhatsApp or ring the desk.
 *  - something free: a button that opens the PDF in a browser sheet, or an
 *    in-app player for a recording.
 *
 * The item id arrives as a STRING from a deep link or a list tap, and the
 * server resolves it with `normalizeId` — so a malformed, hidden or removed id
 * comes back as null and this screen says the item is no longer available
 * rather than crashing on an argument validation error (AC-17).
 */
export default function LibraryItemScreen() {
  const Colors = useThemeColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id?: string }>();

  const item = useQuery(api.library.getCatalogueItem, id ? { itemId: id } : 'skip');

  if (!id) {
    return (
      <Shell onBack={() => router.back()} title="Library">
        <ErrorState />
      </Shell>
    );
  }

  if (item === undefined) {
    return (
      <Shell onBack={() => router.back()} title="Library">
        <View style={styles.loading}>
          <ActivityIndicator color={Colors.primary} />
        </View>
      </Shell>
    );
  }

  // Null covers all four cases at once — hidden, removed, never existed, or a
  // malformed id — and deliberately does not distinguish them: which one it is
  // is the Library's business, and "no longer available" is the whole of what
  // the member can act on.
  if (item === null) {
    return (
      <Shell onBack={() => router.back()} title="Library">
        <View style={styles.gone}>
          <Ionicons name="book-outline" size={40} color={Colors.outline} />
          <Text style={[styles.goneTitle, { color: Colors.onSurfaceVariant }]}>
            This is no longer available
          </Text>
          <Text style={[styles.goneBody, { color: Colors.outline }]}>
            The Library may have taken it off the list. Have a look at what else
            is there.
          </Text>
          <View style={styles.goneAction}>
            <Button
              label="Back to the Library"
              variant="secondary"
              fullWidth={false}
              onPress={() => router.back()}
            />
          </View>
        </View>
      </Shell>
    );
  }

  return (
    <Shell onBack={() => router.back()} title="Library" paddingBottom={insets.bottom}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + Spacing[10] }]}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View entering={FadeInUp.duration(320)}>
          <Cover uri={item.coverImageUrl} index={0} imageRadius={Radius.xl} style={styles.hero} />
        </Animated.View>

        <Animated.View entering={FadeInUp.duration(320).delay(60)} style={styles.headerBlock}>
          <Text style={[styles.title, { color: Colors.onSurface }]}>{item.title}</Text>
          {item.author && (
            <Text style={[styles.author, { color: Colors.onSurfaceVariant }]}>
              {item.author}
            </Text>
          )}
          <View style={styles.tags}>
            {item.categoryName && <Badge label={item.categoryName} variant="category" />}
            {item.free && <Badge label="Free" variant="confirmed" />}
            {item.outOfStock && <Badge label="Out of stock" variant="cancelled" />}
          </View>
        </Animated.View>

        {item.free ? (
          <FreeContentPanel
            itemId={item._id}
            format={item.format}
            fileSizeBytes={item.fileSizeBytes}
            audioDurationSeconds={item.audioDurationSeconds}
            title={item.title}
          />
        ) : (
          <DeskPanel
            priceUgx={item.priceUgx}
            outOfStock={item.outOfStock}
            contactPhone={item.contactPhone}
            title={item.title}
          />
        )}

        {item.description && (
          <Animated.View entering={FadeInUp.duration(320).delay(140)} style={styles.section}>
            <Text style={[styles.sectionLabel, { color: Colors.outline }]}>ABOUT</Text>
            <Text style={[styles.body, { color: Colors.onSurfaceVariant }]}>
              {item.description}
            </Text>
          </Animated.View>
        )}

        {item.detailLines.length > 0 && (
          <Animated.View entering={FadeInUp.duration(320).delay(180)} style={styles.section}>
            <Text style={[styles.sectionLabel, { color: Colors.outline }]}>
              {item.itemType === 'merchandise' ? 'VARIANTS' : 'WHAT IT CONTAINS'}
            </Text>
            <View style={styles.detailLines}>
              {item.detailLines.map((line, index) => (
                <View key={`${line}-${index}`} style={styles.detailLine}>
                  <Ionicons name="ellipse" size={5} color={Colors.primary} />
                  <Text style={[styles.body, { color: Colors.onSurfaceVariant }]}>{line}</Text>
                </View>
              ))}
            </View>
          </Animated.View>
        )}
      </ScrollView>
    </Shell>
  );
}

/**
 * What a priced item offers: the price, where to get it, and how to ask.
 *
 * The contact buttons render only when the Library's HOD has actually set a
 * number. An absent number removes the buttons entirely rather than leaving
 * one that dials nothing — the price and the desk line still show, because
 * walking over is still the answer (AC-15).
 *
 * "Out of stock" does NOT remove the buttons: a member may very reasonably
 * want to ask when something is back, and taking away the way to ask at
 * exactly the moment they need it would be the wrong call.
 */
function DeskPanel({
  priceUgx, outOfStock, contactPhone, title,
}: {
  priceUgx: number | null;
  outOfStock: boolean;
  contactPhone: string | null;
  title: string;
}) {
  const Colors = useThemeColors();

  const openWhatsApp = () => {
    if (!contactPhone) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const text = encodeURIComponent(`Hello, I am asking about "${title}" from the Library.`);
    // `wa.me` wants the digits with no leading plus; `tel:` wants the stored
    // value exactly as it is. The one place that difference lives is
    // `whatsAppDigits` in @klt-cyber/shared.
    void Linking.openURL(`https://wa.me/${whatsAppDigits(contactPhone)}?text=${text}`);
  };

  const call = () => {
    if (!contactPhone) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    void Linking.openURL(`tel:${contactPhone}`);
  };

  return (
    <Animated.View
      entering={FadeInUp.duration(320).delay(100)}
      style={[styles.panel, AmbientShadow, { backgroundColor: Colors.surfaceLowest }]}
    >
      <Text style={[styles.price, { color: Colors.primaryDeep }]}>
        {priceUgx === null ? 'Ask at the desk' : formatUgx(priceUgx)}
      </Text>
      <Text style={[styles.deskLine, { color: Colors.onSurfaceVariant }]}>
        Available at the Library desk
      </Text>

      {outOfStock && (
        <View style={styles.outOfStockRow}>
          <Ionicons name="alert-circle-outline" size={16} color={Colors.secondary} />
          <Text style={[styles.outOfStock, { color: Colors.secondary }]}>
            Out of stock right now
          </Text>
        </View>
      )}

      {contactPhone ? (
        <View style={styles.contactRow}>
          <Pressable
            onPress={openWhatsApp}
            accessibilityRole="button"
            accessibilityLabel={`Message the Library desk on WhatsApp about ${title}`}
            style={[styles.contactButton, { backgroundColor: Colors.successLight }]}
          >
            <Ionicons name="logo-whatsapp" size={18} color={Colors.success} />
            <Text style={[styles.contactLabel, { color: Colors.success }]}>WhatsApp</Text>
          </Pressable>
          <Pressable
            onPress={call}
            accessibilityRole="button"
            accessibilityLabel={`Call the Library desk about ${title}`}
            style={[styles.contactButton, { backgroundColor: Colors.goldTint }]}
          >
            <Ionicons name="call-outline" size={18} color={Colors.primaryDeep} />
            <Text style={[styles.contactLabel, { color: Colors.primaryDeep }]}>Call</Text>
          </Pressable>
        </View>
      ) : (
        <Text style={[styles.noContact, { color: Colors.outline }]}>
          Come by the Library desk after any service.
        </Text>
      )}
    </Animated.View>
  );
}

/**
 * What a free item offers: open it, right here.
 *
 * The signed URL is fetched by a ONE-SHOT action when the member taps, never
 * from the reactive item query. That is the whole design: a live subscription
 * re-runs whenever its row changes, so a URL delivered that way would be
 * re-signed underneath a playing recording the moment an operator edited the
 * item's description — restarting the audio, or breaking an open sheet. It is
 * also never stored, on a document or in state beyond the life of the thing
 * using it (AC-21).
 */
function FreeContentPanel({
  itemId, format, fileSizeBytes, audioDurationSeconds, title,
}: {
  itemId: string;
  format: 'physical' | 'pdf' | 'audio';
  fileSizeBytes: number | null;
  audioDurationSeconds: number | null;
  title: string;
}) {
  const Colors = useThemeColors();
  const getItemFileUrl = useAction(api.library.getItemFileUrl);

  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);

  const sizeLabel =
    fileSizeBytes === null ? null : `${(fileSizeBytes / (1024 * 1024)).toFixed(1)} MB`;

  async function open() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setFailed(false);
    setLoading(true);
    try {
      const result = await getItemFileUrl({ itemId });
      if (!result) {
        setFailed(true);
        return;
      }
      if (format === 'pdf') {
        // An in-app browser sheet rather than handing the file to another app:
        // the member stays in the app, and there is no download or share
        // action anywhere on this screen (AC-21).
        await WebBrowser.openBrowserAsync(result.url, {
          presentationStyle: WebBrowser.WebBrowserPresentationStyle.PAGE_SHEET,
          enableBarCollapsing: true,
        });
      } else {
        setAudioUrl(result.url);
      }
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Animated.View
      entering={FadeInUp.duration(320).delay(100)}
      style={[styles.panel, AmbientShadow, { backgroundColor: Colors.surfaceLowest }]}
    >
      <Text style={[styles.price, { color: Colors.tertiary }]}>Free</Text>
      <Text style={[styles.deskLine, { color: Colors.onSurfaceVariant }]}>
        {format === 'pdf' ? 'Read it here in the app' : 'Listen here in the app'}
        {sizeLabel ? ` · ${sizeLabel}` : ''}
      </Text>

      {audioUrl ? (
        // Keyed on the URL so the player is constructed ONCE, with its final
        // source, rather than being handed a source that changes under it.
        <AudioPlayer
          key={audioUrl}
          url={audioUrl}
          title={title}
          knownDurationSeconds={audioDurationSeconds}
        />
      ) : (
        <View style={styles.freeAction}>
          <Button
            label={
              loading
                ? 'Opening…'
                : format === 'pdf'
                  ? 'Read it'
                  : 'Play it'
            }
            loading={loading}
            onPress={open}
          />
        </View>
      )}

      {failed && (
        <Text
          role="alert"
          style={[styles.failed, { color: Colors.secondary }]}
        >
          We could not open this file. Try again.
        </Text>
      )}
    </Animated.View>
  );
}

/** mm:ss from a number of seconds. Mono numerals, per INTERFACE_SPEC §1.3. */
function clock(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const whole = Math.floor(seconds);
  const minutes = Math.floor(whole / 60);
  const rest = whole % 60;
  return `${minutes}:${String(rest).padStart(2, '0')}`;
}

/**
 * The in-app audio player (AC-20).
 *
 * Play and pause, a progress bar, elapsed and total time in the mono numeral
 * face, and a buffering state while the file loads. Playback PAUSES when the
 * member leaves the screen rather than following them around the app: this is
 * a teaching they chose to open on this screen, not a radio station, and
 * background audio is feature 20's job with its own controls.
 *
 * The total comes from the duration the Library typed in when they bothered,
 * and from the file's own metadata once it has loaded otherwise — so nothing
 * depends on that field being filled.
 */
function AudioPlayer({
  url, title, knownDurationSeconds,
}: {
  url: string;
  title: string;
  knownDurationSeconds: number | null;
}) {
  const Colors = useThemeColors();
  const player = useAudioPlayer({ uri: url });
  const status = useAudioPlayerStatus(player);

  // Play through the earpiece switch on iOS: a teaching the member deliberately
  // started should not go silent because their ringer is off.
  useEffect(() => {
    void setAudioModeAsync({ playsInSilentMode: true }).catch(() => {});
  }, []);

  // Pause on blur, and let the hook release the player on unmount. Without
  // this a member who taps back carries on hearing a teaching from a screen
  // they have left.
  useFocusEffect(
    useCallback(() => {
      return () => {
        try {
          player.pause();
        } catch {
          // The player may already be released by the time the screen tears
          // down; nothing to do about it and nothing to tell the member.
        }
      };
    }, [player]),
  );

  const duration =
    status.duration && status.duration > 0
      ? status.duration
      : (knownDurationSeconds ?? 0);
  const elapsed = status.currentTime ?? 0;
  const progress = duration > 0 ? Math.min(elapsed / duration, 1) : 0;
  const buffering = status.isBuffering || !status.isLoaded;

  return (
    <View style={styles.playerWrap}>
      <View style={styles.playerRow}>
        <Pressable
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            if (status.playing) player.pause();
            else player.play();
          }}
          disabled={buffering}
          accessibilityRole="button"
          accessibilityState={{ disabled: buffering, selected: status.playing }}
          accessibilityLabel={
            buffering
              ? `Loading ${title}`
              : status.playing
                ? `Pause ${title}`
                : `Play ${title}`
          }
          style={[styles.playButton, ShadowE1, { backgroundColor: Colors.primaryFixedDim }]}
        >
          {buffering ? (
            <ActivityIndicator color={Colors.primaryDeep} />
          ) : (
            <Ionicons
              name={status.playing ? 'pause' : 'play'}
              size={24}
              color={Colors.primaryDeep}
            />
          )}
        </Pressable>

        <View style={styles.playerMeter}>
          <View
            style={[styles.track, { backgroundColor: Colors.surfaceHigh }]}
            accessibilityRole="progressbar"
            accessibilityValue={{ min: 0, max: 100, now: Math.round(progress * 100) }}
          >
            <View
              style={[
                styles.trackFill,
                { width: `${progress * 100}%`, backgroundColor: Colors.primary },
              ]}
            />
          </View>
          <View style={styles.timeRow}>
            <Text style={[styles.time, { color: Colors.onSurfaceVariant }]}>
              {clock(elapsed)}
            </Text>
            <Text style={[styles.time, { color: Colors.outline }]}>
              {duration > 0 ? clock(duration) : '--:--'}
            </Text>
          </View>
        </View>
      </View>

      {buffering && (
        <Text style={[styles.buffering, { color: Colors.outline }]}>Loading the recording…</Text>
      )}
    </View>
  );
}

/** The screen frame: a back button, a title, and the parchment page. */
function Shell({
  onBack, title, paddingBottom, children,
}: {
  onBack: () => void;
  title: string;
  paddingBottom?: number;
  children: React.ReactNode;
}) {
  const Colors = useThemeColors();
  const insets = useSafeAreaInsets();
  return (
    <View
      style={[
        styles.container,
        { paddingTop: insets.top, paddingBottom: paddingBottom ?? 0, backgroundColor: Colors.surface },
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
        <Text style={[styles.headerTitle, { color: Colors.onSurface }]}>{title}</Text>
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
  content: { paddingHorizontal: Spacing[5], paddingTop: Spacing[2], gap: Spacing[5] },

  hero: { height: 220, borderRadius: Radius.xl, overflow: 'hidden' },

  headerBlock: { gap: Spacing[1] },
  title: { fontSize: 24, lineHeight: 30, fontFamily: FontFamily.display },
  author: { fontSize: 15, lineHeight: 23, fontFamily: FontFamily.body },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing[2], marginTop: Spacing[2] },

  panel: { borderRadius: Radius.lg, padding: Spacing[5], gap: Spacing[2] },
  price: { fontSize: 22, lineHeight: 26, fontFamily: FontFamily.monoBold },
  deskLine: { fontSize: 13, lineHeight: 18, fontFamily: FontFamily.bodyMedium },

  outOfStockRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing[1] },
  outOfStock: { fontSize: 13, fontFamily: FontFamily.bodySemiBold },

  contactRow: { flexDirection: 'row', gap: Spacing[3], marginTop: Spacing[3] },
  contactButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing[2],
    minHeight: 48,
    borderRadius: Radius.full,
  },
  contactLabel: { fontSize: 15, fontFamily: FontFamily.bodyBold },
  noContact: { fontSize: 13, fontFamily: FontFamily.body, marginTop: Spacing[2] },

  freeAction: { marginTop: Spacing[3] },
  failed: { fontSize: 13, fontFamily: FontFamily.bodyMedium, marginTop: Spacing[2] },

  playerWrap: { marginTop: Spacing[4], gap: Spacing[2] },
  playerRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing[4] },
  playButton: {
    width: 56,
    height: 56,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playerMeter: { flex: 1, gap: Spacing[2] },
  track: { height: 4, borderRadius: Radius.full, overflow: 'hidden' },
  trackFill: { height: 4, borderRadius: Radius.full },
  timeRow: { flexDirection: 'row', justifyContent: 'space-between' },
  time: { fontSize: 12.5, fontFamily: FontFamily.mono },
  buffering: { fontSize: 12.5, fontFamily: FontFamily.body },

  gone: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing[2],
    paddingHorizontal: Spacing[8],
  },
  goneTitle: { fontSize: 16, fontFamily: FontFamily.bodySemiBold, textAlign: 'center' },
  goneBody: { fontSize: 13, fontFamily: FontFamily.body, textAlign: 'center' },
  goneAction: { marginTop: Spacing[3] },

  section: { gap: Spacing[2] },
  sectionLabel: {
    fontSize: 10.5,
    letterSpacing: 2,
    fontFamily: FontFamily.bodyExtraBold,
  },
  body: { fontSize: 15, lineHeight: 23, fontFamily: FontFamily.body, flex: 1 },
  detailLines: { gap: Spacing[2] },
  detailLine: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing[3], paddingTop: 6 },
});
