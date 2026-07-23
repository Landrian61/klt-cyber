import { useState } from 'react';
import { View, Text, Pressable, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';

import { FontFamily, Spacing, Radius } from '@/constants/theme';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { useR2Upload } from '@/lib/r2-upload';

export interface ImageUploadFieldProps {
  label: string;
  helperText?: string;
  /** The stored R2 object key once uploaded, or undefined. */
  value?: string;
  onChange: (key: string | undefined) => void;
  /** Circular avatar preset (profile photo) vs. rectangular thumbnail (proofs). */
  circular?: boolean;
  /** Copy on the empty-state tap target. */
  emptyLabel?: string;
}

/**
 * A single image slot backed by the shared R2 upload utility. Handles the pick
 * (camera or library) → upload → key round trip, showing a live local preview
 * while the bytes are in flight and a remove affordance once stored. Used by the
 * profile photo (Step 1), the mentorship certificate (Step 3), and each
 * leadership-proof entry (Step 4) — every upload slot in the wizard.
 *
 * The parent stores only the returned key; the local preview URI lives here so
 * the user sees their image immediately without a getFileUrl round trip.
 */
export function ImageUploadField({
  label,
  helperText,
  value,
  onChange,
  circular = false,
  emptyLabel = 'Add image',
}: ImageUploadFieldProps) {
  const Colors = useThemeColors();
  const upload = useR2Upload();
  const [previewUri, setPreviewUri] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);

  const runUpload = async (asset: ImagePicker.ImagePickerAsset) => {
    setError(undefined);
    setPreviewUri(asset.uri);
    setBusy(true);
    try {
      const key = await upload(asset.uri, asset.mimeType ?? 'image/jpeg');
      onChange(key);
    } catch {
      setError('Upload failed. Tap to try again.');
      setPreviewUri(undefined);
      onChange(undefined);
    } finally {
      setBusy(false);
    }
  };

  const pickFromLibrary = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permission needed', 'Allow photo library access to add an image.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) await runUpload(result.assets[0]);
  };

  const takePhoto = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permission needed', 'Allow camera access to take a photo.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) await runUpload(result.assets[0]);
  };

  const chooseSource = () => {
    if (busy) return;
    Alert.alert(label, 'Add an image from…', [
      { text: 'Take Photo', onPress: takePhoto },
      { text: 'Choose from Library', onPress: pickFromLibrary },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const remove = () => {
    setPreviewUri(undefined);
    setError(undefined);
    onChange(undefined);
  };

  const hasImage = !!value || !!previewUri;
  const shape = circular ? styles.circular : styles.rect;

  return (
    <View style={styles.container}>
      <Text style={[styles.label, { color: Colors.onSurface }]}>{label}</Text>

      <View style={circular ? styles.avatarRow : undefined}>
        <Pressable
          onPress={chooseSource}
          style={[shape, { backgroundColor: Colors.surfaceLowest }]}
          accessibilityRole="button"
          accessibilityLabel={hasImage ? `Change ${label}` : `Add ${label}`}
        >
          {previewUri ? (
            <Image source={{ uri: previewUri }} style={shape} contentFit="cover" />
          ) : (
            <View style={styles.empty}>
              <Ionicons
                name={circular ? 'person-outline' : 'image-outline'}
                size={circular ? 32 : 26}
                color={Colors.outline}
              />
              {!circular && (
                <Text style={[styles.emptyText, { color: Colors.outline }]}>{emptyLabel}</Text>
              )}
            </View>
          )}

          {busy && (
            <View style={[shape, styles.overlay]}>
              <ActivityIndicator size="small" color={Colors.onPrimary} />
            </View>
          )}
        </Pressable>

        <View style={circular ? styles.avatarActions : styles.rectActions}>
          {hasImage && !busy ? (
            <>
              <Pressable onPress={chooseSource} hitSlop={8}>
                <Text style={[styles.action, { color: Colors.primary }]}>Change</Text>
              </Pressable>
              <Pressable onPress={remove} hitSlop={8}>
                <Text style={[styles.action, { color: Colors.error }]}>Remove</Text>
              </Pressable>
            </>
          ) : null}
        </View>
      </View>

      {(error || helperText) && (
        <Text style={[styles.helper, { color: error ? Colors.error : Colors.onSurfaceVariant }]}>
          {error || helperText}
        </Text>
      )}
    </View>
  );
}

const AVATAR = 96;

const styles = StyleSheet.create({
  container: { width: '100%' },
  label: {
    fontFamily: FontFamily.bodyMedium,
    fontSize: 13,
    lineHeight: 18,
    marginBottom: Spacing[2],
  },
  avatarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[4],
  },
  circular: {
    width: AVATAR,
    height: AVATAR,
    borderRadius: AVATAR / 2,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rect: {
    width: '100%',
    height: 160,
    borderRadius: Radius.lg,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  empty: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing[2],
  },
  emptyText: {
    fontFamily: FontFamily.bodyMedium,
    fontSize: 13,
    lineHeight: 18,
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    backgroundColor: 'rgba(28, 28, 24, 0.45)',
  },
  avatarActions: {
    gap: Spacing[3],
  },
  rectActions: {
    flexDirection: 'row',
    gap: Spacing[5],
    marginTop: Spacing[3],
  },
  action: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 14,
    lineHeight: 22.4,
  },
  helper: {
    fontFamily: FontFamily.body,
    fontSize: 12,
    lineHeight: 16,
    marginTop: 6,
    paddingLeft: 2,
  },
});
