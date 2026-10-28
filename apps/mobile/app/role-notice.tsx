import { View, Text, Pressable, ScrollView, StyleSheet, Linking, ActivityIndicator } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useQuery } from 'convex/react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInUp } from 'react-native-reanimated';

import { ROLE_COPY } from '@klt-cyber/shared';

import { FontFamily, Spacing, Radius, ShadowE1 } from '@/constants/theme';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { api } from '@/lib/api';
import type { Id } from '@/lib/api';

/**
 * What a tap on an appointment notice opens (spec 0013, AC-14, AC-15).
 *
 * The appointee sees their role, what it involves and a way into the web
 * portal, where the role's work is done. A member of the group sees who now
 * leads it, nothing more, and no portal button. Every refusal from the server
 * (not theirs, missing, a deleted holder, an older push without a notification
 * id) reads the same: no longer available.
 */
export default function RoleNoticeScreen() {
  const Colors = useThemeColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id, n } = useLocalSearchParams<{ id?: string; n?: string }>();
  // Skipped without an id: the server's id validator would throw and crash
  // the screen, where a truncated link should read as "no longer available".
  const result = useQuery(
    api.roles.getRoleNotice,
    id
      ? {
          roleAssignmentId: id as Id<'roleAssignments'>,
          ...(n ? { notificationId: n as Id<'notifications'> } : {}),
        }
      : 'skip',
  );
  const notice = id ? result : null;
  const portalUrl = process.env.EXPO_PUBLIC_PORTAL_URL;

  const header = (
    <View style={styles.header}>
      <Pressable onPress={() => router.back()} hitSlop={12} style={styles.backButton} accessibilityLabel="Go back">
        <Ionicons name="arrow-back" size={24} color={Colors.onSurface} />
      </Pressable>
    </View>
  );

  if (notice === undefined) {
    return (
      <View style={[styles.container, { backgroundColor: Colors.surface, paddingTop: insets.top }]}>
        <View style={styles.fallback}>
          <ActivityIndicator color={Colors.primary} />
        </View>
      </View>
    );
  }

  if (notice === null) {
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

  const copy = ROLE_COPY[notice.roleType];
  const roleWithScope = notice.scopeName ? `${copy.label} for ${notice.scopeName}` : copy.label;
  const isAppointee = notice.view === 'appointee';

  return (
    <View style={[styles.container, { backgroundColor: Colors.surface, paddingTop: insets.top }]}>
      {header}
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + Spacing[6] }]}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View entering={FadeInUp.duration(300)} style={styles.metaRow}>
          <Badge
            label={notice.active ? (isAppointee ? 'Your role' : 'New leader') : 'Ended'}
            variant={notice.active ? 'member' : 'pending'}
          />
        </Animated.View>

        <Animated.Text
          entering={FadeInUp.duration(300).delay(80)}
          style={[styles.title, { color: Colors.onSurface }]}
          accessibilityRole="header"
        >
          {/* Past tense once it has ended, so the title never contradicts
              the Ended badge beside it. */}
          {isAppointee
            ? `${notice.active ? 'You are' : 'You were'} the ${roleWithScope}`
            : `${notice.holderName} ${notice.active ? 'is now' : 'was'} the ${roleWithScope}`}
        </Animated.Text>

        {isAppointee && !notice.active && (
          <Animated.View
            entering={FadeInUp.duration(300).delay(160)}
            style={[styles.endedNote, { backgroundColor: Colors.surfaceLow }]}
          >
            <Ionicons name="time-outline" size={20} color={Colors.outline} />
            <Text style={[styles.endedText, { color: Colors.onSurfaceVariant }]}>This role has ended</Text>
          </Animated.View>
        )}

        {isAppointee && notice.active && (
          <>
            <Animated.View
              entering={FadeInUp.duration(300).delay(160)}
              style={[styles.card, ShadowE1, { backgroundColor: Colors.surfaceLowest }]}
            >
              <Text style={[styles.cardLabel, { color: Colors.outline }]}>What this role involves</Text>
              <Text style={[styles.body, { color: Colors.onSurfaceVariant }]}>{copy.description}</Text>
            </Animated.View>

            {portalUrl && (
              <Animated.View entering={FadeInUp.duration(300).delay(240)} style={styles.actions}>
                <Button
                  label="Open the web portal"
                  onPress={() => Linking.openURL(portalUrl).catch(() => {})}
                />
                <Text style={[styles.hint, { color: Colors.outline }]}>
                  Sign in with this same account.
                </Text>
              </Animated.View>
            )}
          </>
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
    gap: Spacing[2],
  },
  cardLabel: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 12,
    lineHeight: 16,
  },
  body: {
    fontFamily: FontFamily.body,
    fontSize: 15,
    lineHeight: 24,
  },
  endedNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[3],
    borderRadius: Radius.lg,
    padding: Spacing[4],
  },
  endedText: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 15,
    lineHeight: 22,
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
