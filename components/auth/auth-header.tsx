import { View, Text, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { Colors, FontFamily, Spacing, Radius } from '@/constants/theme';
import { Button } from '@/components/ui/button';

export interface AuthHeaderProps {
  title: string;
  subtitle?: string;
  showBack?: boolean;
}

export function AuthHeader({ title, subtitle, showBack = true }: AuthHeaderProps) {
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
              <View style={styles.backButton}>
                <Ionicons name="arrow-back" size={20} color={Colors.onSurface} />
              </View>
            }
          />
        </View>
      )}
      {(title || subtitle) && (
        <View style={styles.textContainer}>
          {title ? <Text style={styles.title}>{title}</Text> : null}
          {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
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
    backgroundColor: Colors.surfaceLowest,
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
    color: Colors.onSurface,
  },
  subtitle: {
    fontFamily: FontFamily.body,
    fontSize: 14,
    lineHeight: 22,
    color: Colors.onSurfaceVariant,
    marginTop: Spacing[2],
  },
});
