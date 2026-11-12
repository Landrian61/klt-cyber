import { useState, type ComponentProps, type ReactNode } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Switch, Text, View, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery } from 'convex/react';
import * as Haptics from 'expo-haptics';
import Animated, { FadeInUp, useReducedMotion } from 'react-native-reanimated';

import { DIRECTORY_COPY, DIRECTORY_SHARED_FIELD_LABELS, formatDirectoryBirthday } from '@klt-cyber/shared';

import { api } from '@/lib/api';
import { Sentry } from '@/lib/sentry';
import { FontFamily, Radius, ShadowE1, Spacing } from '@/constants/theme';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { useIsOffline } from '@/hooks/use-is-offline';
import { Button } from '@/components/ui/button';
import { OfflineBanner } from '@/components/ui/offline-banner';
import { MemberGate } from '@/components/member-gate';
import { MemberAvatar } from '@/components/directory/member-avatar';
import { directoryFullName } from '@/components/directory/member-row';
import { ShareConsentSheet } from '@/components/directory/share-consent-sheet';
import { DirectoryError } from '@/components/directory/directory-error';

// One member's directory card (spec 0022, AC-9 to AC-14). Everything shown
// here arrived from `directory.getCard`, which already dropped whatever the
// share to see rule withholds; this screen only decides layout.

type IconName = ComponentProps<typeof Ionicons>['name'];

function ContactButton({ icon, label, onPress, a11y }: { icon: IconName; label: string; onPress: () => void; a11y: string }) {
  const Colors = useThemeColors();
  return (
    <Pressable
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel={a11y}
      style={({ pressed }) => [
        styles.contact,
        { backgroundColor: pressed ? Colors.surfaceHigh : Colors.primaryLight },
      ]}
    >
      <Ionicons name={icon} size={22} color={Colors.primary} />
      <Text style={[styles.contactLabel, { color: Colors.primaryDeep }]}>{label}</Text>
    </Pressable>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  const Colors = useThemeColors();
  return (
    <View style={styles.field} accessible accessibilityLabel={`${label}: ${value}`}>
      <Text style={[styles.fieldLabel, { color: Colors.outline }]}>{label}</Text>
      <Text style={[styles.fieldValue, { color: Colors.onSurface }]} selectable>
        {value}
      </Text>
    </View>
  );
}

function Note({ icon, text, children }: { icon: IconName; text: string; children?: ReactNode }) {
  const Colors = useThemeColors();
  return (
    <View style={[styles.note, { backgroundColor: Colors.surfaceLow }]}>
      <View style={styles.noteRow}>
        <Ionicons name={icon} size={20} color={Colors.onSurfaceVariant} />
        <Text style={[styles.noteText, { color: Colors.onSurfaceVariant }]}>{text}</Text>
      </View>
      {children}
    </View>
  );
}

function MemberDetailScreen({ userId }: { userId: string }) {
  const Colors = useThemeColors();
  const reduceMotion = useReducedMotion();
  // The raw route param: the server normalizes it, and anything that is not
  // a directory member's id comes back as null (AC-14).
  const card = useQuery(api.directory.getCard, { userId });
  const setDirectorySharing = useMutation(api.profile.setDirectorySharing);
  const [consentOpen, setConsentOpen] = useState(false);
  const [sharingBusy, setSharingBusy] = useState(false);

  if (card === undefined) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="small" color={Colors.primary} accessibilityLabel="Loading member" />
      </View>
    );
  }
  if (card === null) return <NotFound />;

  const { basic, shared, isSelf, viewerSharing, targetSharing, areas } = card;
  const birthday = shared?.birthday ? formatDirectoryBirthday(shared.birthday) : '';
  const fullName = directoryFullName(basic.name);
  const first = basic.name.first;

  // Own card switch (AC-13): off is instant, on goes through consent. It waits
  // for the server rather than flipping optimistically, as profile.tsx does.
  const onSwitch = async (next: boolean) => {
    if (next) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setConsentOpen(true);
      return;
    }
    setSharingBusy(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      await setDirectorySharing({ directorySharing: false });
    } catch {
      // The reactive card still holds the stored value, so the switch springs back.
    } finally {
      setSharingBusy(false);
    }
  };

  const enter = (delay: number) => (reduceMotion ? undefined : FadeInUp.duration(320).delay(delay));

  return (
    <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
      <Animated.View entering={enter(0)} style={styles.hero}>
        <MemberAvatar name={basic.name} photoUrl={basic.photoUrl} size={104} />
        <Text style={[styles.name, { color: Colors.onSurface }]} accessibilityRole="header">
          {fullName}
        </Text>
        {basic.clan && (
          <Text style={[styles.clan, { color: Colors.onSurfaceVariant }]}>{basic.clan.name} clan</Text>
        )}
        {areas.length > 0 && (
          <View style={styles.pills}>
            {areas.map((area) => (
              <View key={area.id} style={[styles.pill, { backgroundColor: Colors.tertiaryLight }]}>
                <Text style={[styles.pillText, { color: Colors.tertiaryDeep }]}>{area.name}</Text>
              </View>
            ))}
          </View>
        )}
      </Animated.View>

      {isSelf && (
        <Animated.View entering={enter(80)} style={[styles.card, ShadowE1, { backgroundColor: Colors.surfaceLowest }]}>
          <Text style={[styles.caption, { color: Colors.outline }]}>{DIRECTORY_COPY.ownCard.caption}</Text>
          <View style={styles.switchRow}>
            <View style={styles.switchText}>
              <Text style={[styles.switchTitle, { color: Colors.onSurface }]}>
                {DIRECTORY_COPY.ownCard.switchLabel}
              </Text>
              <Text style={[styles.switchBody, { color: Colors.onSurfaceVariant }]}>
                {targetSharing ? DIRECTORY_COPY.ownCard.switchOnBody : DIRECTORY_COPY.ownCard.switchOffBody}
              </Text>
            </View>
            <Switch
              value={targetSharing === true}
              disabled={sharingBusy}
              onValueChange={onSwitch}
              trackColor={{ false: Colors.surfaceHigh, true: Colors.primaryFixedDim }}
              thumbColor={targetSharing ? Colors.primary : Colors.outline}
              accessibilityLabel={DIRECTORY_COPY.ownCard.switchLabel}
            />
          </View>
        </Animated.View>
      )}

      {shared && !isSelf && (
        <Animated.View entering={enter(80)} style={styles.contacts}>
          {shared.phone && (
            <ContactButton
              icon="call"
              label={DIRECTORY_COPY.actions.call}
              a11y={`Call ${first}`}
              onPress={() => Linking.openURL(`tel:${shared.phone!.dial}`)}
            />
          )}
          {shared.phone?.whatsappDigits && (
            <ContactButton
              icon="logo-whatsapp"
              label={DIRECTORY_COPY.actions.whatsapp}
              a11y={`WhatsApp ${first}`}
              onPress={() => Linking.openURL(`https://wa.me/${shared.phone!.whatsappDigits}`)}
            />
          )}
          <ContactButton
            icon="mail"
            label={DIRECTORY_COPY.actions.email}
            a11y={`Email ${first}`}
            onPress={() => Linking.openURL(`mailto:${shared.email}`)}
          />
        </Animated.View>
      )}

      {shared && (
        <Animated.View entering={enter(140)} style={[styles.card, ShadowE1, { backgroundColor: Colors.surfaceLowest }]}>
          {shared.phone && <Field label={DIRECTORY_SHARED_FIELD_LABELS.phone} value={shared.phone.raw} />}
          <Field label={DIRECTORY_SHARED_FIELD_LABELS.email} value={shared.email} />
          {shared.occupation && <Field label={DIRECTORY_SHARED_FIELD_LABELS.occupation} value={shared.occupation} />}
          {shared.industry && <Field label={DIRECTORY_SHARED_FIELD_LABELS.industry} value={shared.industry} />}
          {shared.employer && <Field label={DIRECTORY_SHARED_FIELD_LABELS.employer} value={shared.employer} />}
          {shared.skills && <Field label={DIRECTORY_SHARED_FIELD_LABELS.skills} value={shared.skills.join(', ')} />}
          {shared.shortBio && <Field label={DIRECTORY_SHARED_FIELD_LABELS.shortBio} value={shared.shortBio} />}
          {birthday !== '' && (
            <Field label={DIRECTORY_COPY.birthdayLabel} value={birthday} />
          )}
        </Animated.View>
      )}

      {!shared && viewerSharing && (
        <Animated.View entering={enter(80)}>
          <Note icon="lock-closed-outline" text={DIRECTORY_COPY.targetPrivateNote(first)} />
        </Animated.View>
      )}

      {!shared && !viewerSharing && (
        <Animated.View entering={enter(80)}>
          <Note icon="key-outline" text={DIRECTORY_COPY.privateViewerNote}>
            <Button
              label={DIRECTORY_COPY.privateBanner.action}
              variant="primary"
              fullWidth
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setConsentOpen(true);
              }}
            />
          </Note>
        </Animated.View>
      )}

      <ShareConsentSheet visible={consentOpen} onClose={() => setConsentOpen(false)} />
    </ScrollView>
  );
}

function NotFound() {
  const Colors = useThemeColors();
  return (
    <View style={styles.center} accessible accessibilityRole="alert">
      <View style={[styles.notFoundIcon, { backgroundColor: Colors.surfaceLow }]}>
        <Ionicons name="person-outline" size={34} color={Colors.outline} />
      </View>
      <Text style={[styles.notFoundTitle, { color: Colors.onSurface }]}>{DIRECTORY_COPY.notFound.title}</Text>
      <Text style={[styles.notFoundBody, { color: Colors.outline }]}>{DIRECTORY_COPY.notFound.body}</Text>
    </View>
  );
}

function MemberDetailRoute() {
  const Colors = useThemeColors();
  const router = useRouter();
  const isOffline = useIsOffline();
  const { userId } = useLocalSearchParams<{ userId?: string }>();
  const [attempt, setAttempt] = useState(0);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: Colors.surface }]} edges={['top']}>
      <View style={styles.header}>
        <Button
          variant="icon"
          onPress={() => router.back()}
          accessibilityLabel="Go back"
          icon={<Ionicons name="arrow-back" size={24} color={Colors.onSurface} />}
        />
      </View>
      {isOffline && (
        <View style={styles.offline}>
          <OfflineBanner />
        </View>
      )}
      {userId ? (
        <Sentry.ErrorBoundary
          key={attempt}
          fallback={({ error }) => <DirectoryError error={error} retry={() => setAttempt((a) => a + 1)} />}
        >
          <MemberDetailScreen userId={userId} />
        </Sentry.ErrorBoundary>
      ) : (
        <NotFound />
      )}
    </SafeAreaView>
  );
}

export default function MemberDetail() {
  return (
    <MemberGate featureLabel="the member directory">
      <MemberDetailRoute />
    </MemberGate>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  header: {
    paddingHorizontal: Spacing[2],
  },
  offline: {
    paddingHorizontal: Spacing[5],
    marginBottom: Spacing[2],
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing[8],
  },
  scroll: {
    paddingHorizontal: Spacing[5],
    paddingBottom: Spacing[12],
    gap: Spacing[5],
  },
  hero: {
    alignItems: 'center',
    paddingTop: Spacing[2],
  },
  name: {
    fontFamily: FontFamily.display,
    fontSize: 26,
    lineHeight: 32,
    textAlign: 'center',
    marginTop: Spacing[4],
  },
  clan: {
    fontFamily: FontFamily.bodyMedium,
    fontSize: 14,
    marginTop: Spacing[1],
  },
  pills: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: Spacing[2],
    marginTop: Spacing[3],
  },
  pill: {
    borderRadius: Radius.full,
    paddingHorizontal: Spacing[3],
    height: 26,
    justifyContent: 'center',
  },
  pillText: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 12,
  },
  contacts: {
    flexDirection: 'row',
    gap: Spacing[3],
  },
  contact: {
    flex: 1,
    minHeight: 72,
    borderRadius: Radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing[1],
  },
  contactLabel: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 13,
  },
  card: {
    borderRadius: Radius.lg,
    padding: Spacing[4],
    gap: Spacing[4],
  },
  field: {
    gap: 2,
  },
  fieldLabel: {
    fontFamily: FontFamily.bodyMedium,
    fontSize: 12,
  },
  fieldValue: {
    fontFamily: FontFamily.body,
    fontSize: 15,
    lineHeight: 22,
  },
  caption: {
    fontFamily: FontFamily.bodyMedium,
    fontSize: 12,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[3],
  },
  switchText: {
    flex: 1,
  },
  switchTitle: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 15,
    lineHeight: 22,
  },
  switchBody: {
    fontFamily: FontFamily.body,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 2,
  },
  note: {
    borderRadius: Radius.lg,
    padding: Spacing[4],
    gap: Spacing[4],
  },
  noteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[3],
  },
  noteText: {
    flex: 1,
    fontFamily: FontFamily.bodyMedium,
    fontSize: 14,
    lineHeight: 21,
  },
  notFoundIcon: {
    width: 80,
    height: 80,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing[4],
  },
  notFoundTitle: {
    fontFamily: FontFamily.displaySemi,
    fontSize: 20,
    lineHeight: 26,
    textAlign: 'center',
  },
  notFoundBody: {
    fontFamily: FontFamily.body,
    fontSize: 13,
    lineHeight: 20,
    textAlign: 'center',
    marginTop: Spacing[2],
  },
});
