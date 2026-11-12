import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ConvexError } from 'convex/values';

import { DIRECTORY_COPY, DIRECTORY_ERROR_CODES } from '@klt-cyber/shared';

import { FontFamily, Radius, Spacing } from '@/constants/theme';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { ErrorState } from '@/components/ui/error-state';

/** True when the server refused the viewer outright (spec 0022, AC-2). */
export function isDirectoryMembersOnly(error: unknown): boolean {
  return (
    error instanceof ConvexError &&
    (error.data as { code?: string } | undefined)?.code === DIRECTORY_ERROR_CODES.MEMBERS_ONLY
  );
}

export interface DirectoryErrorProps {
  error: unknown;
  retry: () => void;
}

/**
 * The directory screens' error boundary fallback. `MemberGate` lets in any
 * `role === "member"`, but the server also needs a verified profile, so a
 * member without one is refused with `DIRECTORY_MEMBERS_ONLY`. Retrying that
 * can never succeed, so it gets a calm explanation with no retry button.
 * Anything else is a real failure and gets the shared `ErrorState`.
 */
export function DirectoryError({ error, retry }: DirectoryErrorProps) {
  const Colors = useThemeColors();
  if (!isDirectoryMembersOnly(error)) return <ErrorState cause="generic" retry={retry} />;

  return (
    <View style={styles.container} accessible accessibilityRole="alert">
      <View style={[styles.icon, { backgroundColor: Colors.primaryLight }]}>
        <Ionicons name="hourglass-outline" size={30} color={Colors.primary} />
      </View>
      <Text style={[styles.title, { color: Colors.onSurface }]}>{DIRECTORY_COPY.membersOnly.title}</Text>
      <Text style={[styles.body, { color: Colors.onSurfaceVariant }]}>{DIRECTORY_COPY.membersOnly.body}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    paddingVertical: Spacing[12],
    paddingHorizontal: Spacing[8],
  },
  icon: {
    width: 72,
    height: 72,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing[4],
  },
  title: {
    fontFamily: FontFamily.displaySemi,
    fontSize: 20,
    lineHeight: 26,
    textAlign: 'center',
  },
  body: {
    fontFamily: FontFamily.body,
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
    marginTop: Spacing[2],
  },
});
