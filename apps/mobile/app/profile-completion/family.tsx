import { memo, useCallback, useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from 'convex/react';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Animated, {
  FadeIn,
  FadeInUp,
  FadeOut,
  LinearTransition,
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  useReducedMotion,
} from 'react-native-reanimated';
import { SEX, type Sex } from '@klt-cyber/shared';

import { FontFamily, Spacing, Radius, Duration } from '@/constants/theme';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { Input } from '@/components/ui/input';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { DateField } from '@/components/ui/date-field';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { StepScaffold, WizardField, FieldLabel, Hint } from '@/components/profile-wizard/step-scaffold';
import { api, type Id } from '@/lib/api';
import { getDisplayName } from '@/lib/user-display';
import { useWizardDraft, type ChildDraft } from './_layout';

const SEX_LABELS = ['Male', 'Female'];

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

function newKey(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// ── Spouse search result row (tactile, memoized) ─────────────────────────────

const SpouseResultRow = memo(function SpouseResultRow({
  id,
  name,
  email,
  index,
  onSelect,
}: {
  id: Id<'users'>;
  name: string;
  email: string;
  index: number;
  onSelect: (id: Id<'users'>, name: string) => void;
}) {
  const Colors = useThemeColors();
  const reduceMotion = useReducedMotion();
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <AnimatedPressable
      onPressIn={() => {
        scale.value = withTiming(0.98, { duration: Duration.fast });
      }}
      onPressOut={() => {
        scale.value = withTiming(1, { duration: 150 });
      }}
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onSelect(id, name);
      }}
      entering={reduceMotion ? undefined : FadeIn.duration(200).delay(index * 40)}
      style={[animatedStyle, styles.resultRow, { backgroundColor: Colors.surfaceLowest }]}
      accessibilityRole="button"
    >
      <Text style={[styles.resultName, { color: Colors.onSurface }]}>{name}</Text>
      <Text style={[styles.resultEmail, { color: Colors.onSurfaceVariant }]}>{email}</Text>
    </AnimatedPressable>
  );
});

// ── Child card (tactile, memoized) ───────────────────────────────────────────

const ChildCard = memo(function ChildCard({
  child,
  index,
  onUpdate,
  onRemove,
}: {
  child: ChildDraft;
  index: number;
  onUpdate: (key: string, partial: Partial<ChildDraft>) => void;
  onRemove: (key: string) => void;
}) {
  const Colors = useThemeColors();
  const reduceMotion = useReducedMotion();
  const trash = useSharedValue(1);
  const trashStyle = useAnimatedStyle(() => ({ transform: [{ scale: trash.value }] }));

  const sexIndex = child.sex ? SEX.indexOf(child.sex) : -1;

  return (
    <Animated.View
      entering={reduceMotion ? undefined : FadeInUp.duration(280).delay(index * 40)}
      exiting={reduceMotion ? undefined : FadeOut.duration(160)}
      layout={reduceMotion ? undefined : LinearTransition.springify().damping(18)}
      style={[styles.childCard, { backgroundColor: Colors.surfaceLowest }]}
    >
      <View style={styles.childHeader}>
        <Text style={[styles.childHeaderText, { color: Colors.outline }]}>CHILD {index + 1}</Text>
        <AnimatedPressable
          onPressIn={() => {
            trash.value = withTiming(0.85, { duration: Duration.fast });
          }}
          onPressOut={() => {
            trash.value = withTiming(1, { duration: 150 });
          }}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            onRemove(child.key);
          }}
          hitSlop={10}
          style={trashStyle}
          accessibilityLabel={`Remove child ${index + 1}`}
          accessibilityRole="button"
        >
          <Ionicons name="trash-outline" size={18} color={Colors.error} />
        </AnimatedPressable>
      </View>
      <Input
        label="Name"
        value={child.name}
        onChangeText={(v) => onUpdate(child.key, { name: v })}
        autoCapitalize="words"
        placeholder="Child's name"
      />
      <View style={{ height: Spacing[3] }} />
      <FieldLabel>Sex</FieldLabel>
      <SegmentedControl
        options={SEX_LABELS}
        selectedIndex={sexIndex}
        onChange={(i) => onUpdate(child.key, { sex: SEX[i] as Sex })}
      />
      {sexIndex < 0 && <Hint>Tap to choose.</Hint>}
      <View style={{ height: Spacing[3] }} />
      <DateField
        label="Date of birth (optional)"
        value={child.dobISO}
        onChange={(v) => onUpdate(child.key, { dobISO: v })}
        placeholder="Add date of birth"
      />
    </Animated.View>
  );
});

export default function FamilyStep() {
  const Colors = useThemeColors();
  const router = useRouter();
  const { draft, patch } = useWizardDraft();

  const isMarried = draft.maritalStatus === 'married';

  // ── Spouse search ───────────────────────────────────────────────────────────
  const [spouseQuery, setSpouseQuery] = useState('');
  const trimmedQuery = spouseQuery.trim();
  const results = useQuery(
    api.users.searchUsersForSpouseLink,
    isMarried && trimmedQuery.length >= 2 && !draft.spouseUserId && !draft.spouseName
      ? { query: trimmedQuery }
      : 'skip',
  );

  const selectSpouse = useCallback(
    (id: Id<'users'>, name: string) => {
      patch({ spouseUserId: id, spouseName: name });
      setSpouseQuery('');
    },
    [patch],
  );
  const useUnlinkedName = () => {
    patch({ spouseUserId: undefined, spouseName: trimmedQuery });
    setSpouseQuery('');
  };
  const clearSpouse = () => patch({ spouseUserId: undefined, spouseName: '' });

  // ── Children ────────────────────────────────────────────────────────────────
  // Ref mirrors the latest rows so the memoized cards' callbacks stay stable.
  const childrenRef = useRef(draft.children);
  childrenRef.current = draft.children;

  const addChild = useCallback(
    () => patch({ children: [...childrenRef.current, { key: newKey(), name: '' }] }),
    [patch],
  );
  const updateChild = useCallback(
    (key: string, partial: Partial<ChildDraft>) =>
      patch({ children: childrenRef.current.map((c) => (c.key === key ? { ...c, ...partial } : c)) }),
    [patch],
  );
  const removeChild = useCallback(
    (key: string) => patch({ children: childrenRef.current.filter((c) => c.key !== key) }),
    [patch],
  );

  // ── Next of kin: all-or-nothing ──────────────────────────────────────────────
  const nokValues = [draft.nextOfKinName, draft.nextOfKinRelationship, draft.nextOfKinPhone];
  const nokFilled = nokValues.filter((v) => v.trim()).length;
  const nokPartial = nokFilled > 0 && nokFilled < 3;

  const childIncomplete = draft.children.some((c) => !c.name.trim() || !c.sex);
  const canContinue = !nokPartial && !childIncomplete;

  return (
    <StepScaffold
      title="Your family"
      subtitle="All optional — share what you'd like. You can add more later."
      onPrimary={() => router.push('/profile-completion/mentorship')}
      primaryDisabled={!canContinue}
    >
      {/* Spouse — only when married */}
      {isMarried && (
        <>
          <WizardField>
            <FieldLabel>Spouse</FieldLabel>
            {draft.spouseName ? (
              <View style={[styles.chip, { backgroundColor: Colors.primaryFixedDim }]}>
                <View style={styles.chipText}>
                  <Text style={[styles.chipName, { color: Colors.onSurface }]}>
                    {draft.spouseName}
                  </Text>
                  <Badge
                    label={draft.spouseUserId ? 'Linked' : 'Not linked'}
                    variant={draft.spouseUserId ? 'confirmed' : 'pending'}
                  />
                </View>
                <Pressable onPress={clearSpouse} hitSlop={8} accessibilityLabel="Remove spouse">
                  <Ionicons name="close-circle" size={20} color={Colors.outline} />
                </Pressable>
              </View>
            ) : (
              <>
                <Input
                  label=""
                  value={spouseQuery}
                  onChangeText={setSpouseQuery}
                  icon="search-outline"
                  placeholder="Search by name or email"
                  autoCapitalize="none"
                />
                {results && results.length > 0 && (
                  <View style={styles.results}>
                    {results.map((u, idx) => (
                      <SpouseResultRow
                        key={u._id}
                        id={u._id as Id<'users'>}
                        name={getDisplayName(u) || u.email}
                        email={u.email}
                        index={idx}
                        onSelect={selectSpouse}
                      />
                    ))}
                  </View>
                )}
                {results && results.length === 0 && trimmedQuery.length >= 2 && (
                  <Hint>No match found.</Hint>
                )}
                {trimmedQuery.length >= 2 && (
                  <View style={styles.unlinked}>
                    <Button
                      variant="textLink"
                      label={`Use "${trimmedQuery}" as an unregistered spouse`}
                      onPress={useUnlinkedName}
                    />
                  </View>
                )}
              </>
            )}
          </WizardField>

          <WizardField>
            <DateField
              label="Anniversary date (optional)"
              value={draft.anniversaryISO}
              onChange={(v) => patch({ anniversaryISO: v })}
              placeholder="Add your anniversary"
            />
          </WizardField>
        </>
      )}

      {/* Children */}
      <WizardField>
        <FieldLabel>Children</FieldLabel>
        {draft.children.length === 0 ? (
          <Hint>None added.</Hint>
        ) : (
          <View style={styles.childList}>
            {draft.children.map((child, idx) => (
              <ChildCard
                key={child.key}
                child={child}
                index={idx}
                onUpdate={updateChild}
                onRemove={removeChild}
              />
            ))}
          </View>
        )}
        <View style={styles.addBtn}>
          <Button variant="ghost" label="Add a child" onPress={addChild} />
        </View>
        {childIncomplete && <Hint>Give each child a name and sex, or remove the row.</Hint>}
      </WizardField>

      {/* Next of kin */}
      <WizardField>
        <FieldLabel>Next of kin (optional)</FieldLabel>
        <Input
          label="Full name"
          value={draft.nextOfKinName}
          onChangeText={(v) => patch({ nextOfKinName: v })}
          autoCapitalize="words"
          placeholder="Their full name"
        />
        <View style={{ height: Spacing[3] }} />
        <Input
          label="Relationship"
          value={draft.nextOfKinRelationship}
          onChangeText={(v) => patch({ nextOfKinRelationship: v })}
          autoCapitalize="words"
          placeholder="e.g. Brother, Aunt"
        />
        <View style={{ height: Spacing[3] }} />
        <Input
          label="Phone"
          value={draft.nextOfKinPhone}
          onChangeText={(v) => patch({ nextOfKinPhone: v })}
          keyboardType="phone-pad"
          placeholder="+256 700 000 000"
        />
        {nokPartial && <Hint>Fill in all three next-of-kin fields, or leave them all blank.</Hint>}
      </WizardField>
    </StepScaffold>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: Radius.lg,
    paddingHorizontal: Spacing[4],
    paddingVertical: Spacing[3],
  },
  chipText: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[3],
    flex: 1,
  },
  chipName: {
    fontFamily: FontFamily.bodyMedium,
    fontSize: 15,
    lineHeight: 22,
  },
  results: {
    marginTop: Spacing[2],
    gap: Spacing[1],
  },
  resultRow: {
    borderRadius: Radius.md,
    paddingHorizontal: Spacing[4],
    paddingVertical: Spacing[3],
  },
  resultName: {
    fontFamily: FontFamily.bodyMedium,
    fontSize: 14,
    lineHeight: 20,
  },
  resultEmail: {
    fontFamily: FontFamily.body,
    fontSize: 12,
    lineHeight: 16,
    marginTop: 1,
  },
  unlinked: { marginTop: Spacing[3] },
  childList: { gap: Spacing[3] },
  childCard: {
    borderRadius: Radius.lg,
    padding: Spacing[4],
  },
  childHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing[3],
  },
  childHeaderText: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 11,
    lineHeight: 15.4,
    letterSpacing: 0.5,
  },
  addBtn: { marginTop: Spacing[3] },
});
