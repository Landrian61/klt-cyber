import { useState } from 'react';
import { View, Text, Pressable, Switch, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  FadeInDown,
} from 'react-native-reanimated';

import { FontFamily, Spacing, Radius, Duration } from '@/constants/theme';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { AuthHeader } from '@/components/auth/auth-header';
import { KeyboardAwareScroll } from '@/components/auth/keyboard-aware-scroll';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ProgressBar } from '@/components/ui/progress-bar';
import { useRegistration } from '@/contexts/registration-context';

const LEADERSHIP_OPTIONS = [
  { key: 'not_enrolled' as const, label: 'Not enrolled', icon: 'remove-circle-outline' as const },
  { key: 'level_1' as const, label: 'Level 1', icon: 'school-outline' as const },
  { key: 'level_2' as const, label: 'Level 2', icon: 'ribbon-outline' as const },
  { key: 'advanced' as const, label: 'Advanced Level', icon: 'trophy-outline' as const },
];

function CollapsibleSection({
  title,
  icon,
  children,
  colors,
}: {
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
  children: React.ReactNode;
  colors: ReturnType<typeof import('@/hooks/use-theme-colors').useThemeColors>;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const rotation = useSharedValue(0);

  const toggleOpen = () => {
    setIsOpen((prev) => !prev);
    rotation.value = withTiming(isOpen ? 0 : 1, { duration: Duration.normal });
  };

  const chevronStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value * 180}deg` }],
  }));

  return (
    <View style={[collStyles.container, { backgroundColor: colors.surfaceLowest }]}>
      <Pressable onPress={toggleOpen} style={collStyles.header}>
        <View style={collStyles.headerLeft}>
          <View style={[collStyles.iconBox, { backgroundColor: colors.primaryLight }]}>
            <Ionicons name={icon} size={18} color={colors.primary} />
          </View>
          <Text style={[collStyles.headerText, { color: colors.onSurface }]}>{title}</Text>
        </View>
        <Animated.View style={chevronStyle}>
          <Ionicons name="chevron-down" size={18} color={colors.outline} />
        </Animated.View>
      </Pressable>
      {isOpen && (
        <Animated.View entering={FadeInDown.duration(200)} style={collStyles.content}>
          {children}
        </Animated.View>
      )}
    </View>
  );
}

const collStyles = StyleSheet.create({
  container: {
    borderRadius: Radius.lg,
    overflow: 'hidden',
    marginBottom: Spacing[4],
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: Spacing[4],
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[3],
  },
  iconBox: {
    width: 36,
    height: 36,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerText: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 15,
    lineHeight: 22,
  },
  content: {
    paddingHorizontal: Spacing[4],
    paddingBottom: Spacing[5],
    gap: Spacing[5],
  },
});

export default function RegisterStep3Screen() {
  const Colors = useThemeColors();
  const router = useRouter();
  const { data, updateData } = useRegistration();
  const [loading, setLoading] = useState(false);

  const handleCreateAccount = async () => {
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      router.replace('/(auth)/register-success');
    }, 1500);
  };

  return (
    <KeyboardAwareScroll>
      <AuthHeader title="" showBack />

      <View style={styles.progressArea}>
        <ProgressBar totalSteps={3} currentStep={3} />
        <Text style={[styles.stepLabel, { color: Colors.primary }]}>Step 3 of 3</Text>
      </View>

      <View style={styles.headingArea}>
        <Text style={[styles.heading, { color: Colors.onSurface }]}>Optional details</Text>
        <Text style={[styles.subheading, { color: Colors.onSurfaceVariant }]}>
          All optional — you can complete this from your profile anytime.
        </Text>
      </View>

      <Animated.View entering={FadeInDown.duration(400).delay(100)} style={styles.form}>
        {/* Professional Information */}
        <CollapsibleSection title="Professional information" icon="briefcase-outline" colors={Colors}>
          <Input
            label="Profession / field of work"
            value={data.profession}
            onChangeText={(v) => updateData({ profession: v })}
            placeholder="e.g. Software Engineer"
          />
          <Input
            label="Job title or role"
            value={data.jobTitle}
            onChangeText={(v) => updateData({ jobTitle: v })}
            placeholder="e.g. Senior Developer"
          />
          <Input
            label="Workplace or organisation"
            value={data.workplace}
            onChangeText={(v) => updateData({ workplace: v })}
            placeholder="e.g. Acme Inc."
          />
          <View style={[styles.toggleCard, { backgroundColor: Colors.surfaceLow }]}>
            <Text style={[styles.toggleLabel, { color: Colors.onSurfaceVariant }]}>Show on public profile</Text>
            <Switch
              value={data.showProfessionalOnProfile}
              onValueChange={(v) => updateData({ showProfessionalOnProfile: v })}
              trackColor={{ false: Colors.surfaceHigh, true: Colors.primaryLight }}
              thumbColor={data.showProfessionalOnProfile ? Colors.primary : Colors.outline}
            />
          </View>
        </CollapsibleSection>

        {/* Leadership Institute */}
        <CollapsibleSection title="Leadership Institute" icon="school-outline" colors={Colors}>
          <Text style={[styles.helperNote, { color: Colors.onSurfaceVariant }]}>
            Verified by the Leadership Institute department.
          </Text>
          <View style={styles.radioGroup}>
            {LEADERSHIP_OPTIONS.map((option) => {
              const isSelected = data.leadershipInstituteLevel === option.key;
              return (
                <Pressable
                  key={option.key}
                  onPress={() => updateData({ leadershipInstituteLevel: option.key })}
                  style={[
                    styles.radioCard,
                    { backgroundColor: Colors.surfaceLow },
                    isSelected && { backgroundColor: Colors.primaryFixedDim },
                  ]}
                >
                  <Ionicons name={option.icon} size={18} color={isSelected ? Colors.primary : Colors.outline} />
                  <Text
                    style={[
                      styles.radioLabel,
                      { color: Colors.onSurface },
                      isSelected && { fontFamily: FontFamily.bodyMedium, color: Colors.primary },
                    ]}
                  >
                    {option.label}
                  </Text>
                  <View
                    style={[
                      styles.radioCircle,
                      { borderColor: Colors.surfaceHigh },
                      isSelected && { borderColor: Colors.primary },
                    ]}
                  >
                    {isSelected && <View style={[styles.radioCircleInner, { backgroundColor: Colors.primary }]} />}
                  </View>
                </Pressable>
              );
            })}
          </View>
        </CollapsibleSection>
      </Animated.View>

      {/* Footer */}
      <View style={styles.footer}>
        <Button
          label="Create my account"
          variant="primary"
          onPress={handleCreateAccount}
          loading={loading}
        />
        <Text style={[styles.legal, { color: Colors.outline }]}>
          By creating an account you agree to our{' '}
          <Text style={{ color: Colors.primary, textDecorationLine: 'underline' }}>Terms of Service</Text> and{' '}
          <Text style={{ color: Colors.primary, textDecorationLine: 'underline' }}>Privacy Policy</Text>.
        </Text>
      </View>
    </KeyboardAwareScroll>
  );
}

const styles = StyleSheet.create({
  progressArea: { paddingHorizontal: Spacing[6], marginTop: Spacing[3] },
  stepLabel: { fontFamily: FontFamily.bodyMedium, fontSize: 12, marginTop: Spacing[2] },
  headingArea: { paddingHorizontal: Spacing[6], marginTop: Spacing[5] },
  heading: { fontFamily: FontFamily.display, fontSize: 24, lineHeight: 28.8 },
  subheading: { fontFamily: FontFamily.body, fontSize: 14, lineHeight: 22, marginTop: Spacing[2] },
  form: { paddingHorizontal: Spacing[6], marginTop: Spacing[6] },
  helperNote: { fontFamily: FontFamily.body, fontSize: 12, lineHeight: 18 },
  // Radio cards
  radioGroup: { gap: Spacing[2] },
  radioCard: {
    flexDirection: 'row', alignItems: 'center',
    borderRadius: Radius.md,
    paddingVertical: Spacing[3], paddingHorizontal: Spacing[4], gap: Spacing[3],
  },
  radioLabel: { fontFamily: FontFamily.body, fontSize: 14, flex: 1 },
  radioCircle: {
    width: 20, height: 20, borderRadius: 10,
    borderWidth: 2,
    alignItems: 'center', justifyContent: 'center',
  },
  radioCircleInner: { width: 10, height: 10, borderRadius: 5 },
  // Toggle
  toggleCard: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderRadius: Radius.md, padding: Spacing[3], paddingHorizontal: Spacing[4],
  },
  toggleLabel: { fontFamily: FontFamily.body, fontSize: 14 },
  // Footer
  footer: { paddingHorizontal: Spacing[6], marginTop: Spacing[8], marginBottom: Spacing[8] },
  legal: {
    fontFamily: FontFamily.body, fontSize: 12, lineHeight: 18,
    textAlign: 'center', marginTop: Spacing[4],
  },
});
