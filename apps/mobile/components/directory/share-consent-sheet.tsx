import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useMutation } from 'convex/react';
import * as Haptics from 'expo-haptics';

import {
  DIRECTORY_COPY,
  DIRECTORY_SHARED_FIELDS,
  DIRECTORY_SHARED_FIELD_LABELS,
} from '@klt-cyber/shared';

import { api } from '@/lib/api';
import { FontFamily, Radius, Spacing } from '@/constants/theme';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { Button } from '@/components/ui/button';
import { DirectorySheet } from '@/components/directory/directory-sheet';

export interface ShareConsentSheetProps {
  visible: boolean;
  onClose: () => void;
}

/**
 * The consent step before a member shares their details (spec 0022, AC-12;
 * Uganda Data Protection and Privacy Act consent). Lists exactly the fields
 * the server discloses, from the same shared list the server's allowlist
 * mirrors. Confirm turns sharing on; cancel or dismiss changes nothing.
 *
 * Feature 14 (My Profile) should open this same sheet from its toggle.
 */
export function ShareConsentSheet({ visible, onClose }: ShareConsentSheetProps) {
  const Colors = useThemeColors();
  const setDirectorySharing = useMutation(api.profile.setDirectorySharing);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const close = () => {
    if (busy) return;
    setFailed(false);
    onClose();
  };

  const confirm = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setBusy(true);
    setFailed(false);
    try {
      await setDirectorySharing({ directorySharing: true });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setBusy(false);
      onClose();
    } catch {
      setBusy(false);
      setFailed(true);
    }
  };

  return (
    <DirectorySheet visible={visible} title={DIRECTORY_COPY.consent.title} onDismiss={close}>
      <Text style={[styles.body, { color: Colors.onSurfaceVariant }]}>
        {DIRECTORY_COPY.consent.body}
      </Text>
      <View style={[styles.fields, { backgroundColor: Colors.surfaceLow }]}>
        {DIRECTORY_SHARED_FIELDS.map((field) => (
          <View key={field} style={styles.fieldRow}>
            <Ionicons name="checkmark-circle" size={18} color={Colors.primary} />
            <Text style={[styles.fieldLabel, { color: Colors.onSurface }]}>
              {DIRECTORY_SHARED_FIELD_LABELS[field]}
            </Text>
          </View>
        ))}
      </View>
      {failed && (
        <Text style={[styles.error, { color: Colors.error }]} accessibilityLiveRegion="polite">
          That didn&apos;t save. Give it another try.
        </Text>
      )}
      <View style={styles.actions}>
        <Button
          label={DIRECTORY_COPY.consent.confirm}
          variant="primary"
          fullWidth
          loading={busy}
          disabled={busy}
          onPress={confirm}
        />
        <Button
          label={DIRECTORY_COPY.consent.cancel}
          variant="textLink"
          disabled={busy}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            close();
          }}
        />
      </View>
    </DirectorySheet>
  );
}

const styles = StyleSheet.create({
  body: {
    fontFamily: FontFamily.body,
    fontSize: 14,
    lineHeight: 22,
  },
  fields: {
    marginTop: Spacing[4],
    borderRadius: Radius.md,
    padding: Spacing[4],
    gap: Spacing[3],
  },
  fieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[3],
  },
  fieldLabel: {
    fontFamily: FontFamily.bodyMedium,
    fontSize: 14,
  },
  error: {
    fontFamily: FontFamily.bodyMedium,
    fontSize: 13,
    marginTop: Spacing[3],
  },
  actions: {
    marginTop: Spacing[5],
    gap: Spacing[2],
    alignItems: 'center',
  },
});
