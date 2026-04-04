import { View, Text, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { FontFamily, Spacing, Radius } from '@/constants/theme';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { Button } from '@/components/ui/button';

export interface AuthHeaderProps {
  title: string;
  subtitle?: string;
  showBack?: boolean;
}

export function AuthHeader({ title, subtitle, showBack = true }: AuthHeaderProps) {
  const Colors = useThemeColors();
  const router = useRouter();

  return (
    <View style={styles.container}>
      {showBack && (
        <View style={styles.backRow}>
          <Button
            variant="icon"
            onPress={() => router.back()}
            accessibilityLabel="Go back"
            icon={
              <View style={[styles.backButton, { backgroundColor: Colors.surfaceLowest }]}>
                <Ionicons name="arrow-back" size={20} color={Colors.onSurface} />
              </View>
            }
          />
        </View>
      )}
      {(title || subtitle) && (
        <View style={styles.textContainer}>
          {title ? <Text style={[styles.title, { color: Colors.onSurface }]}>{title}</Text> : null}
          {subtitle && <Text style={[styles.subtitle, { color: Colors.onSurfaceVariant }]}>{subtitle}</Text>}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingTop: Spacing[1],
  },
  backRow: {
    paddingHorizontal: Spacing[2],
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: Radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textContainer: {
    paddingHorizontal: Spacing[6],
    marginTop: Spacing[4],
  },
  title: {
    fontFamily: FontFamily.display,
    fontSize: 26,
    lineHeight: 32,
  },
  subtitle: {
    fontFamily: FontFamily.body,
    fontSize: 14,
    lineHeight: 22,
    marginTop: Spacing[2],
  },
});
