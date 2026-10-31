import { useState } from 'react';
import { View, Text, Pressable, ActivityIndicator, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useMutation, useQuery } from 'convex/react';
import Animated, { FadeIn, FadeOut, LinearTransition, useReducedMotion } from 'react-native-reanimated';
import {
  MAX_ACTIVE_DEPARTMENTS,
  profileLifecycleErrorMessage,
} from '@klt-cyber/shared';

import { FontFamily, Spacing, Radius, ShadowE1 } from '@/constants/theme';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { Button } from '@/components/ui/button';
import { SelectList } from '@/components/ui/select-list';
import { api, type Id } from '@/lib/api';

/**
 * A verified member's own Areas of Service (F2-07, spec 0014 AC-19 to AC-21).
 *
 * Three actions, each the member's own to take:
 *
 *   **Add** creates a REQUEST, not a seat. The department's head confirms it,
 *   and the copy says so, because somebody who thinks they have joined and
 *   then hears nothing will assume the app is broken.
 *
 *   **Withdraw** takes a request back while it is still waiting.
 *
 *   **Leave** steps off a roster already confirmed, unless they lead it. The
 *   block EXPLAINS rather than hiding the button: a head who cannot find the
 *   leave button assumes it is missing, where one who is told their role has
 *   to end first knows what to do next.
 *
 * The cap counts both kinds of row together, which is what the server
 * enforces: counting only confirmed seats would let somebody queue ten
 * requests and land on ten rosters once each head said yes.
 */
export function MyAreasOfService() {
  const Colors = useThemeColors();
  const reduceMotion = useReducedMotion();

  const mine = useQuery(api.departmentMemberships.getMyDepartmentMemberships);
  const departments = useQuery(api.departments.listDepartments);
  const addArea = useMutation(api.departmentMemberships.addMyAreaOfService);
  const withdrawClaim = useMutation(api.departmentMemberships.withdrawMyClaim);
  const leaveArea = useMutation(api.departmentMemberships.leaveMyAreaOfService);

  const [picking, setPicking] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  if (mine === undefined) {
    return (
      <View style={[styles.card, ShadowE1, { backgroundColor: Colors.surfaceLowest }]}>
        <Text style={[styles.cardLabel, { color: Colors.primary }]}>AREAS OF SERVICE</Text>
        <ActivityIndicator size="small" color={Colors.primary} />
      </View>
    );
  }
  if (mine === null) return null;

  const atCap = mine.length >= MAX_ACTIVE_DEPARTMENTS;
  const takenIds = new Set(mine.map((row) => row.departmentId));
  const available = (departments ?? []).filter((d) => !takenIds.has(d._id));

  const run = async (key: string, action: () => Promise<unknown>) => {
    setBusyId(key);
    setMessage(null);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      await action();
    } catch (err) {
      // The shared sentence for a coded refusal, so the phone and the portal
      // say the same thing about the same rule.
      setMessage(profileLifecycleErrorMessage(err));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <View style={[styles.card, ShadowE1, { backgroundColor: Colors.surfaceLowest }]}>
      <Text style={[styles.cardLabel, { color: Colors.primary }]}>AREAS OF SERVICE</Text>

      {mine.length === 0 ? (
        <Text style={[styles.empty, { color: Colors.onSurfaceVariant }]}>
          You are not serving anywhere yet. Ask to join up to{' '}
          {MAX_ACTIVE_DEPARTMENTS} areas, and each one&apos;s head will confirm
          you.
        </Text>
      ) : (
        <View style={styles.rows}>
          {mine.map((row) => (
            <Animated.View
              key={row._id}
              entering={reduceMotion ? undefined : FadeIn.duration(200)}
              exiting={reduceMotion ? undefined : FadeOut.duration(160)}
              layout={reduceMotion ? undefined : LinearTransition.springify().damping(18)}
              style={[styles.row, { backgroundColor: Colors.surfaceLow }]}
            >
              <View style={styles.rowText}>
                <Text style={[styles.rowName, { color: Colors.onSurface }]}>
                  {row.departmentName}
                </Text>
                <Text style={[styles.rowMeta, { color: Colors.onSurfaceVariant }]}>
                  {row.status === 'pending_claim'
                    ? 'Waiting for the head to confirm you'
                    : row.blockedByRole
                      ? `You are its ${row.blockedByRole}. That role has to end before you can leave.`
                      : 'Serving here'}
                </Text>
              </View>

              {row.status === 'pending_claim' ? (
                <Button
                  label="Withdraw"
                  variant="textLink"
                  onPress={() =>
                    run(row._id, () =>
                      withdrawClaim({ departmentId: row.departmentId }),
                    )
                  }
                  disabled={busyId === row._id}
                />
              ) : row.blockedByRole ? null : (
                <Button
                  label="Leave"
                  variant="textLink"
                  onPress={() =>
                    run(row._id, () =>
                      leaveArea({ departmentId: row.departmentId }),
                    )
                  }
                  disabled={busyId === row._id}
                />
              )}
            </Animated.View>
          ))}
        </View>
      )}

      {message ? (
        <Text style={[styles.message, { color: Colors.secondary }]} role="status">
          {message}
        </Text>
      ) : null}

      {picking ? (
        <Animated.View
          entering={reduceMotion ? undefined : FadeIn.duration(200)}
          style={styles.picker}
        >
          <SelectList
            options={available.map((d) => ({ id: d._id, label: d.name }))}
            selectedId={undefined}
            onSelect={(id) => {
              if (!id) return;
              setPicking(false);
              void run('add', () =>
                addArea({ departmentId: id as Id<'departments'> }),
              );
            }}
            emptyText="Nothing left to join."
          />
          <Button label="Cancel" variant="textLink" onPress={() => setPicking(false)} />
        </Animated.View>
      ) : (
        <View style={styles.addRow}>
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setMessage(null);
              setPicking(true);
            }}
            disabled={atCap || available.length === 0 || busyId === 'add'}
            style={styles.addPress}
            accessibilityRole="button"
            accessibilityLabel="Ask to serve in another area"
          >
            <Ionicons
              name="add-circle-outline"
              size={20}
              color={atCap ? Colors.outline : Colors.primary}
            />
            <Text
              style={[
                styles.addLabel,
                { color: atCap ? Colors.outline : Colors.primary },
              ]}
            >
              {atCap
                ? `That is as many as one person can hold (${MAX_ACTIVE_DEPARTMENTS})`
                : 'Ask to serve somewhere else'}
            </Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: Radius.lg,
    padding: Spacing[5],
    marginBottom: Spacing[4],
  },
  cardLabel: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 11,
    lineHeight: 15.4,
    letterSpacing: 0.6,
    marginBottom: Spacing[3],
  },
  empty: {
    fontFamily: FontFamily.body,
    fontSize: 13,
    lineHeight: 20,
  },
  rows: { gap: Spacing[2] },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[3],
    borderRadius: Radius.md,
    paddingHorizontal: Spacing[4],
    paddingVertical: Spacing[3],
  },
  rowText: { flex: 1 },
  rowName: {
    fontFamily: FontFamily.bodyMedium,
    fontSize: 14,
    lineHeight: 20,
  },
  rowMeta: {
    fontFamily: FontFamily.body,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 1,
  },
  message: {
    fontFamily: FontFamily.body,
    fontSize: 13,
    lineHeight: 20,
    marginTop: Spacing[3],
  },
  picker: { marginTop: Spacing[3], gap: Spacing[2] },
  addRow: { marginTop: Spacing[3] },
  addPress: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[2],
    minHeight: 44,
  },
  addLabel: {
    fontFamily: FontFamily.bodyMedium,
    fontSize: 14,
    lineHeight: 20,
  },
});
