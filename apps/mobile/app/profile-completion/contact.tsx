import { ScrollView, View, Text, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from 'convex/react';

import { FontFamily, Spacing, Radius } from '@/constants/theme';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { api, type Id } from '@/lib/api';
import { useProfileDraft } from './_layout';

export default function ContactStep() {
  const Colors = useThemeColors();
  const router = useRouter();
  const { draft, patch } = useProfileDraft();
  const clans = useQuery(api.clans.listClans);

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={[styles.title, { color: Colors.onSurface }]}>Contact & clan</Text>
        <Text style={[styles.subtitle, { color: Colors.onSurfaceVariant }]}>
          All optional. A clan affiliation is reviewed by the church before it is
          confirmed.
        </Text>

        <View style={styles.field}>
          <Input
            label="Phone number (optional)"
            value={draft.phone}
            onChangeText={(v) => patch({ phone: v })}
            keyboardType="phone-pad"
            icon="call-outline"
            placeholder="+256 700 000 000"
          />
        </View>

        <View style={styles.field}>
          <Text style={[styles.fieldLabel, { color: Colors.onSurface }]}>Clan (optional)</Text>
          {clans === undefined ? (
            <View style={styles.clanLoading}>
              <ActivityIndicator size="small" color={Colors.primary} />
            </View>
          ) : (
            <View style={styles.clanGrid}>
              {clans.map((clan) => {
                const selected = draft.clanId === clan._id;
                return (
                  <Pressable
                    key={clan._id}
                    onPress={() =>
                      patch({ clanId: selected ? undefined : (clan._id as Id<'clans'>) })
                    }
                    style={[
                      styles.clanPill,
                      {
                        backgroundColor: selected ? Colors.primaryFixedDim : Colors.surfaceLowest,
                        borderColor: selected ? Colors.primary : 'transparent',
                      },
                    ]}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    accessibilityLabel={clan.name}
                  >
                    <Text
                      style={[
                        styles.clanText,
                        { color: selected ? Colors.primary : Colors.onSurfaceVariant },
                      ]}
                    >
                      {clan.name}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          )}
        </View>
      </ScrollView>

      <View style={[styles.footer, { backgroundColor: Colors.surface }]}>
        <Button
          label="Continue"
          variant="primary"
          fullWidth
          onPress={() => router.push('/profile-completion/review' as any)}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { flex: 1 },
  content: {
    paddingHorizontal: Spacing[5],
    paddingBottom: Spacing[8],
  },
  title: {
    fontFamily: FontFamily.display,
    fontSize: 24,
    lineHeight: 28.8,
  },
  subtitle: {
    fontFamily: FontFamily.body,
    fontSize: 14,
    lineHeight: 22.4,
    marginTop: Spacing[2],
    marginBottom: Spacing[5],
  },
  field: {
    marginBottom: Spacing[5],
  },
  fieldLabel: {
    fontFamily: FontFamily.bodyMedium,
    fontSize: 13,
    lineHeight: 18,
    marginBottom: Spacing[3],
  },
  clanLoading: {
    paddingVertical: Spacing[5],
    alignItems: 'center',
  },
  clanGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing[2],
  },
  clanPill: {
    borderRadius: Radius.full,
    borderWidth: 1.5,
    paddingHorizontal: Spacing[4],
    paddingVertical: Spacing[2],
  },
  clanText: {
    fontFamily: FontFamily.bodyMedium,
    fontSize: 13,
    lineHeight: 18,
  },
  footer: {
    paddingHorizontal: Spacing[5],
    paddingTop: Spacing[3],
    paddingBottom: Spacing[4],
  },
});
