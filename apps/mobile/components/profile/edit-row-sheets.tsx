import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, Text, View } from 'react-native';
import { useMutation } from 'convex/react';
import * as Haptics from 'expo-haptics';
import { SEX, type Sex } from '@klt-cyber/shared';

import { FontFamily, Radius, Spacing } from '@/constants/theme';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { api, type Id } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DateField } from '@/components/ui/date-field';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { ImageUploadField } from '@/components/ui/image-upload-field';
import { DirectorySheet } from '@/components/directory/directory-sheet';

/**
 * The children and leadership row sheets on the edit screen (spec 0023,
 * AC-11). Each Done saves that one row straight away through its own
 * mutation, apart from the main Save, and a failure shows on the sheet only.
 */

const ROW_ERROR = "Couldn't save this, check your connection and try again";

/** `YYYY-MM-DD` to church local midnight, as the wizard stores it. */
function isoToMs(iso?: string): number | undefined {
  if (!iso) return undefined;
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return undefined;
  return new Date(y, m - 1, d).getTime();
}

function msToIso(ms?: number): string | undefined {
  if (ms === undefined) return undefined;
  const date = new Date(ms);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

function SheetError({ message }: { message: string | null }) {
  const Colors = useThemeColors();
  if (!message) return null;
  return (
    <View style={[styles.error, { backgroundColor: Colors.secondaryLight }]} accessibilityLiveRegion="polite">
      <Text style={[styles.errorText, { color: Colors.secondary }]}>{message}</Text>
    </View>
  );
}

// ── Children ────────────────────────────────────────────────────────────────

export interface ChildRow {
  _id: Id<'children'>;
  name: string;
  sex: Sex;
  dateOfBirth?: number;
}

export interface ChildSheetProps {
  /** `null` adds a new child; a row edits it. `undefined` keeps it closed. */
  row: ChildRow | null | undefined;
  onClose: () => void;
  onDirtyChange: (dirty: boolean) => void;
  /** Asks before closing a sheet with unsaved edits. */
  confirmDiscard: (onDiscard: () => void) => void;
}

const SEX_LABELS = ['Male', 'Female'];

export function ChildSheet({ row, onClose, onDirtyChange, confirmDiscard }: ChildSheetProps) {
  const addChild = useMutation(api.children.addChild);
  const updateChild = useMutation(api.children.updateChild);
  const removeChild = useMutation(api.children.removeChild);

  const visible = row !== undefined;
  const [name, setName] = useState('');
  const [sex, setSex] = useState<Sex | undefined>(undefined);
  const [dobISO, setDobISO] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setName(row?.name ?? '');
    setSex(row?.sex);
    setDobISO(msToIso(row?.dateOfBirth));
    setError(null);
  }, [visible, row]);

  const dirty =
    visible &&
    (name !== (row?.name ?? '') || sex !== row?.sex || dobISO !== msToIso(row?.dateOfBirth));
  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]);

  const dismiss = () => {
    if (busy) return;
    if (dirty) confirmDiscard(onClose);
    else onClose();
  };

  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      onDirtyChange(false);
      onClose();
    } catch {
      setError(ROW_ERROR);
    } finally {
      setBusy(false);
    }
  };

  const onDone = () => {
    if (!name.trim() || !sex) {
      setError('Add a name and choose a sex');
      return;
    }
    const fields = { name: name.trim(), sex, dateOfBirth: isoToMs(dobISO) };
    void run(() =>
      row ? updateChild({ childId: row._id, ...fields }) : addChild(fields),
    );
  };

  return (
    <DirectorySheet visible={visible} title={row ? 'Edit child' : 'Add a child'} onDismiss={dismiss}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.body}>
          <Input label="Name" value={name} onChangeText={setName} autoCapitalize="words" />
          <SegmentedControl
            options={SEX_LABELS}
            selectedIndex={sex ? SEX.indexOf(sex) : -1}
            onChange={(i) => setSex(SEX[i])}
          />
          <DateField label="Date of birth (optional)" value={dobISO} onChange={setDobISO} />
          <SheetError message={error} />
          <Button label="Done" variant="primary" loading={busy} onPress={onDone} />
          {row ? (
            <Button
              label="Remove this child"
              variant="textLink"
              disabled={busy}
              onPress={() => void run(() => removeChild({ childId: row._id }))}
            />
          ) : null}
        </View>
      </KeyboardAvoidingView>
    </DirectorySheet>
  );
}

// ── Leadership ──────────────────────────────────────────────────────────────

export type LeadershipLevel = 'level_1' | 'level_2' | 'advanced';
export const LEADERSHIP_LEVELS: LeadershipLevel[] = ['level_1', 'level_2', 'advanced'];
export const LEADERSHIP_LEVEL_LABEL: Record<LeadershipLevel, string> = {
  level_1: 'Level 1',
  level_2: 'Level 2',
  advanced: 'Advanced',
};
const LEAD_STATUSES = ['enrolled', 'completed'] as const;
type LeadStatus = (typeof LEAD_STATUSES)[number];

export interface LeadershipRow {
  _id: Id<'leadershipProgress'>;
  level: string;
  status: string;
  proofUrl?: string;
}

export interface LeadershipSheetProps {
  /** `null` adds a level; a row edits it. `undefined` keeps it closed. */
  row: LeadershipRow | null | undefined;
  /** Every stored row, so picking a level that exists is shown as an edit. */
  existing: LeadershipRow[];
  onClose: () => void;
  onDirtyChange: (dirty: boolean) => void;
  confirmDiscard: (onDiscard: () => void) => void;
}

export function LeadershipSheet({
  row,
  existing,
  onClose,
  onDirtyChange,
  confirmDiscard,
}: LeadershipSheetProps) {
  const Colors = useThemeColors();
  const addMine = useMutation(api.leadershipProgress.addMine);
  const updateMine = useMutation(api.leadershipProgress.updateMine);
  const removeMine = useMutation(api.leadershipProgress.removeMine);

  const visible = row !== undefined;
  const [level, setLevel] = useState<LeadershipLevel | undefined>(undefined);
  const [status, setStatus] = useState<LeadStatus | undefined>(undefined);
  const [proofUrl, setProofUrl] = useState<string | undefined>(undefined);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setLevel(row ? (row.level as LeadershipLevel) : undefined);
    setStatus(row ? (row.status === 'completed' ? 'completed' : 'enrolled') : undefined);
    setProofUrl(row?.proofUrl);
    setError(null);
  }, [visible, row]);

  // `addMine` on a level that already has a row updates that row, so the
  // sheet says "edit" the moment such a level is picked (AC-11).
  const matching = !row && level ? existing.find((r) => r.level === level) : undefined;
  const isEdit = !!row || !!matching;

  const initialStatus = row ? (row.status === 'completed' ? 'completed' : 'enrolled') : undefined;
  const dirty =
    visible &&
    (level !== (row?.level ?? undefined) || status !== initialStatus || proofUrl !== row?.proofUrl);
  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]);

  const dismiss = () => {
    if (busy || uploading) return;
    if (dirty) confirmDiscard(onClose);
    else onClose();
  };

  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      onDirtyChange(false);
      onClose();
    } catch {
      setError(ROW_ERROR);
    } finally {
      setBusy(false);
    }
  };

  const onDone = () => {
    if (!level || !status) {
      setError('Choose a level and where you are with it');
      return;
    }
    const proof = proofUrl ? { proofUrl } : {};
    void run(() =>
      row
        ? updateMine({ leadershipId: row._id, status, ...proof })
        : addMine({ level, status, ...proof }),
    );
  };

  return (
    <DirectorySheet
      visible={visible}
      title={isEdit ? 'Edit leadership level' : 'Add a leadership level'}
      onDismiss={dismiss}
    >
      <View style={styles.body}>
        {row ? (
          <Text style={[styles.fixedLevel, { color: Colors.onSurface }]}>
            {LEADERSHIP_LEVEL_LABEL[row.level as LeadershipLevel] ?? row.level}
          </Text>
        ) : (
          <SegmentedControl
            options={LEADERSHIP_LEVELS.map((l) => LEADERSHIP_LEVEL_LABEL[l])}
            selectedIndex={level ? LEADERSHIP_LEVELS.indexOf(level) : -1}
            onChange={(i) => setLevel(LEADERSHIP_LEVELS[i])}
          />
        )}
        {matching ? (
          <Text style={[styles.note, { color: Colors.onSurfaceVariant }]}>
            You already have this level recorded. Done updates it.
          </Text>
        ) : null}
        <SegmentedControl
          options={['Enrolled', 'Completed']}
          selectedIndex={status ? LEAD_STATUSES.indexOf(status) : -1}
          onChange={(i) => setStatus(LEAD_STATUSES[i])}
        />
        <ImageUploadField
          label="Certificate (optional)"
          value={proofUrl}
          onChange={setProofUrl}
          onBusyChange={setUploading}
          emptyLabel="Add a certificate photo"
        />
        <SheetError message={error} />
        <Button
          label="Done"
          variant="primary"
          loading={busy}
          disabled={uploading}
          onPress={onDone}
        />
        {row ? (
          <Button
            label="Remove this level"
            variant="textLink"
            disabled={busy || uploading}
            onPress={() => void run(() => removeMine({ leadershipId: row._id }))}
          />
        ) : null}
      </View>
    </DirectorySheet>
  );
}

const styles = StyleSheet.create({
  body: { gap: Spacing[3], paddingTop: Spacing[2] },
  fixedLevel: { fontFamily: FontFamily.bodySemiBold, fontSize: 16, lineHeight: 22 },
  note: { fontFamily: FontFamily.body, fontSize: 13, lineHeight: 19 },
  error: { borderRadius: Radius.md, padding: Spacing[3] },
  errorText: { fontFamily: FontFamily.bodyMedium, fontSize: 13, lineHeight: 19 },
});
