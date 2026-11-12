import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';

import { FontFamily, GoldGradient } from '@/constants/theme';
import { useThemeColors } from '@/hooks/use-theme-colors';

export interface MemberAvatarProps {
  name: { first: string; last: string };
  photoUrl?: string;
  size?: number;
}

/** Up to two initials from first and last name, derived on the client (AC-1). */
export function directoryInitials(name: { first: string; last: string }): string {
  return `${name.first.trim().charAt(0)}${name.last.trim().charAt(0)}`.toUpperCase();
}

/** A member's resolved photo, or their initials on the gold leaf gradient. */
export const MemberAvatar = memo(function MemberAvatar({ name, photoUrl, size = 48 }: MemberAvatarProps) {
  const Colors = useThemeColors();
  const box = { width: size, height: size, borderRadius: size / 2 };

  if (photoUrl) {
    return (
      <View style={[box, styles.clip, { backgroundColor: Colors.surfaceLow }]}>
        <Image source={{ uri: photoUrl }} style={box} contentFit="cover" transition={150} accessibilityIgnoresInvertColors />
      </View>
    );
  }
  return (
    <LinearGradient colors={[...GoldGradient.colors]} start={GoldGradient.start} end={GoldGradient.end} style={[box, styles.center]}>
      <Text style={[styles.initials, { color: Colors.onPrimary, fontSize: Math.round(size * 0.3) }]}>
        {directoryInitials(name)}
      </Text>
    </LinearGradient>
  );
});

const styles = StyleSheet.create({
  clip: {
    overflow: 'hidden',
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  initials: {
    fontFamily: FontFamily.bodyExtraBold,
  },
});
