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

import { Colors, FontFamily, Spacing, Radius, Duration } from '@/constants/theme';
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
}: {
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
  children: React.ReactNode;
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
    <View style={collStyles.container}>
      <Pressable onPress={toggleOpen} style={collStyles.header}>
        <View style={collStyles.headerLeft}>
          <View style={collStyles.iconBox}>
            <Ionicons name={icon} size={18} color={Colors.primary} />
          </View>
          <Text style={collStyles.headerText}>{title}</Text>
        </View>
        <Animated.View style={chevronStyle}>
          <Ionicons name="chevron-down" size={18} color={Colors.outline} />
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
    backgroundColor: Colors.surfaceLowest,
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
    backgroundColor: Colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerText: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 15,
    lineHeight: 22,
    color: Colors.onSurface,
  },
  content: {
    paddingHorizontal: Spacing[4],
    paddingBottom: Spacing[5],
    gap: Spacing[5],
  },
});

export default function RegisterStep3Screen() {
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
        <Text style={styles.stepLabel}>Step 3 of 3</Text>
      </View>

      <View style={styles.headingArea}>
        <Text style={styles.heading}>Optional details</Text>
        <Text style={styles.subheading}>
          All optional — you can complete this from your profile anytime.
        </Text>
      </View>

      <Animated.View entering={FadeInDown.duration(400).delay(100)} style={styles.form}>
        {/* Professional Information */}
        <CollapsibleSection title="Professional information" icon="briefcase-outline">
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
          <View style={styles.toggleCard}>
            <Text style={styles.toggleLabel}>Show on public profile</Text>
            <Switch
              value={data.showProfessionalOnProfile}
              onValueChange={(v) => updateData({ showProfessionalOnProfile: v })}
              trackColor={{ false: Colors.surfaceHigh, true: Colors.primaryLight }}
              thumbColor={data.showProfessionalOnProfile ? Colors.primary : Colors.outline}
            />
          </View>
        </CollapsibleSection>

        {/* Leadership Institute */}
        <CollapsibleSection title="Leadership Institute" icon="school-outline">
          <Text style={styles.helperNote}>
            Verified by the Leadership Institute department.
          </Text>
          <View style={styles.radioGroup}>
            {LEADERSHIP_OPTIONS.map((option) => {
              const isSelected = data.leadershipInstituteLevel === option.key;
              return (
                <Pressable
                  key={option.key}
                  onPress={() => updateData({ leadershipInstituteLevel: option.key })}
                  style={[styles.radioCard, isSelected && styles.radioCardSelected]}
                >
                  <Ionicons name={option.icon} size={18} color={isSelected ? Colors.primary : Colors.outline} />
                  <Text style={[styles.radioLabel, isSelected && styles.radioLabelSelected]}>
                    {option.label}
                  </Text>
                  <View style={[styles.radioCircle, isSelected && styles.radioCircleSelected]}>
                    {isSelected && <View style={styles.radioCircleInner} />}
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
        <Text style={styles.legal}>
          By creating an account you agree to our{' '}
          <Text style={styles.legalLink}>Terms of Service</Text> and{' '}
          <Text style={styles.legalLink}>Privacy Policy</Text>.
        </Text>
      </View>
    </KeyboardAwareScroll>
  );
}

const styles = StyleSheet.create({
  progressArea: { paddingHorizontal: Spacing[6], marginTop: Spacing[3] },
  stepLabel: { fontFamily: FontFamily.bodyMedium, fontSize: 12, color: Colors.primary, marginTop: Spacing[2] },
  headingArea: { paddingHorizontal: Spacing[6], marginTop: Spacing[5] },
  heading: { fontFamily: FontFamily.display, fontSize: 24, lineHeight: 28.8, color: Colors.onSurface },
  subheading: { fontFamily: FontFamily.body, fontSize: 14, lineHeight: 22, color: Colors.onSurfaceVariant, marginTop: Spacing[2] },
  form: { paddingHorizontal: Spacing[6], marginTop: Spacing[6] },
  helperNote: { fontFamily: FontFamily.body, fontSize: 12, lineHeight: 18, color: Colors.onSurfaceVariant },
  // Radio cards
  radioGroup: { gap: Spacing[2] },
  radioCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.surfaceLow, borderRadius: Radius.md,
    paddingVertical: Spacing[3], paddingHorizontal: Spacing[4], gap: Spacing[3],
  },
  radioCardSelected: { backgroundColor: Colors.primaryFixedDim },
  radioLabel: { fontFamily: FontFamily.body, fontSize: 14, color: Colors.onSurface, flex: 1 },
  radioLabelSelected: { fontFamily: FontFamily.bodyMedium, color: Colors.primary },
  radioCircle: {
    width: 20, height: 20, borderRadius: 10,
    borderWidth: 2, borderColor: Colors.surfaceHigh,
    alignItems: 'center', justifyContent: 'center',
  },
  radioCircleSelected: { borderColor: Colors.primary },
  radioCircleInner: { width: 10, height: 10, borderRadius: 5, backgroundColor: Colors.primary },
  // Toggle
  toggleCard: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: Colors.surfaceLow, borderRadius: Radius.md, padding: Spacing[3], paddingHorizontal: Spacing[4],
  },
  toggleLabel: { fontFamily: FontFamily.body, fontSize: 14, color: Colors.onSurfaceVariant },
  // Footer
  footer: { paddingHorizontal: Spacing[6], marginTop: Spacing[8], marginBottom: Spacing[8] },
  legal: {
    fontFamily: FontFamily.body, fontSize: 12, lineHeight: 18,
    color: Colors.outline, textAlign: 'center', marginTop: Spacing[4],
  },
  legalLink: { color: Colors.primary, textDecorationLine: 'underline' },
});
