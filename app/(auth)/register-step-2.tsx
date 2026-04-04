import { View, Text, Pressable, Switch, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { Colors, FontFamily, Spacing, Radius } from '@/constants/theme';
import { AuthHeader } from '@/components/auth/auth-header';
import { KeyboardAwareScroll } from '@/components/auth/keyboard-aware-scroll';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ProgressBar } from '@/components/ui/progress-bar';
import { useRegistration } from '@/contexts/registration-context';

const MENTORSHIP_OPTIONS = [
  { key: 'not_enrolled' as const, label: 'Not enrolled in mentorship', icon: 'close-circle-outline' as const },
  { key: 'undergoing' as const, label: 'Currently undergoing mentorship', icon: 'hourglass-outline' as const },
  { key: 'completed' as const, label: 'Completed mentorship training', icon: 'checkmark-circle-outline' as const },
];

export default function RegisterStep2Screen() {
  const router = useRouter();
  const { data, updateData } = useRegistration();

  const handleAddChild = () => {
    if (data.children.length >= 10) return;
    updateData({ children: [...data.children, { firstName: '', dateOfBirth: null }] });
  };

  const handleRemoveChild = (index: number) => {
    updateData({ children: data.children.filter((_, i) => i !== index) });
  };

  const handleChildNameChange = (index: number, name: string) => {
    const updated = [...data.children];
    updated[index] = { ...updated[index], firstName: name };
    updateData({ children: updated });
  };

  return (
    <KeyboardAwareScroll>
      <AuthHeader title="" showBack />

      <View style={styles.progressArea}>
        <ProgressBar totalSteps={3} currentStep={2} />
        <Text style={styles.stepLabel}>Step 2 of 3</Text>
      </View>

      <View style={styles.headingArea}>
        <Text style={styles.heading}>Church involvement</Text>
        <Text style={styles.subheading}>
          Connect yourself to the community. All fields are optional.
        </Text>
      </View>

      <Animated.View entering={FadeInDown.duration(400).delay(100)} style={styles.form}>
        <Input
          label="Clan"
          value={data.clan}
          onChangeText={(v) => updateData({ clan: v })}
          helperText="Subject to leadership approval"
          icon="shield-outline"
          placeholder="Select your clan"
        />

        <View style={styles.gap} />

        <Input
          label="Departments"
          value={data.departments.join(', ')}
          onChangeText={(v) => updateData({ departments: v.split(',').map((d) => d.trim()).filter(Boolean) })}
          helperText="Max 3, comma-separated. Shown after HOD approval."
          icon="layers-outline"
          placeholder="e.g. Media, Worship"
        />

        <View style={styles.gapLarge} />

        {/* Mentorship Status */}
        <Text style={styles.fieldLabel}>Mentorship status</Text>
        <View style={styles.radioGroup}>
          {MENTORSHIP_OPTIONS.map((option) => {
            const isSelected = data.mentorshipStatus === option.key;
            return (
              <Pressable
                key={option.key}
                onPress={() => updateData({ mentorshipStatus: option.key })}
                style={[styles.radioCard, isSelected && styles.radioCardSelected]}
              >
                <View style={[styles.radioIcon, isSelected && styles.radioIconSelected]}>
                  <Ionicons name={option.icon} size={18} color={isSelected ? Colors.primary : Colors.outline} />
                </View>
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

        <View style={styles.gapLarge} />

        {/* Children Toggle */}
        <View style={styles.toggleCard}>
          <View style={styles.toggleContent}>
            <Ionicons name="people-outline" size={20} color={Colors.primary} />
            <Text style={styles.toggleLabel}>I have children</Text>
          </View>
          <Switch
            value={data.hasChildren}
            onValueChange={(v) => updateData({ hasChildren: v, children: v ? data.children : [] })}
            trackColor={{ false: Colors.surfaceHigh, true: Colors.primaryLight }}
            thumbColor={data.hasChildren ? Colors.primary : Colors.outline}
          />
        </View>

        {data.hasChildren && (
          <Animated.View entering={FadeInDown.duration(300)} style={styles.childrenArea}>
            {data.children.map((child, index) => (
              <View key={index} style={styles.childRow}>
                <View style={styles.childField}>
                  <Input
                    label={`Child ${index + 1}`}
                    value={child.firstName}
                    onChangeText={(v) => handleChildNameChange(index, v)}
                    placeholder="First name"
                  />
                </View>
                <Pressable onPress={() => handleRemoveChild(index)} style={styles.removeBtn}>
                  <Ionicons name="close-circle" size={22} color={Colors.outline} />
                </Pressable>
              </View>
            ))}
            {data.children.length < 10 && (
              <Button label="+ Add child" variant="textLink" onPress={handleAddChild} />
            )}
          </Animated.View>
        )}

        {/* Spouse */}
        {data.maritalStatus === 'Married' && (
          <>
            <View style={styles.gapLarge} />
            <Input
              label="Spouse name"
              value={data.spouseName}
              onChangeText={(v) => updateData({ spouseName: v })}
              helperText="Can be linked later if they join"
              icon="heart-outline"
              placeholder="Spouse's name"
            />
          </>
        )}
      </Animated.View>

      {/* Footer */}
      <View style={styles.footer}>
        <Button
          label="Continue to step 3"
          variant="primary"
          onPress={() => router.push('/(auth)/register-step-3')}
        />
        <View style={styles.skipRow}>
          <Button label="Skip this step" variant="textLink" onPress={() => router.push('/(auth)/register-step-3')} />
        </View>
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
  gap: { height: Spacing[5] },
  gapLarge: { height: Spacing[6] },
  fieldLabel: { fontFamily: FontFamily.bodyMedium, fontSize: 13, color: Colors.onSurface, marginBottom: Spacing[3] },
  // Radio cards
  radioGroup: { gap: Spacing[3] },
  radioCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surfaceLowest,
    borderRadius: Radius.lg,
    padding: Spacing[4],
    gap: Spacing[3],
  },
  radioCardSelected: { backgroundColor: Colors.primaryFixedDim },
  radioIcon: {
    width: 36,
    height: 36,
    borderRadius: Radius.md,
    backgroundColor: Colors.surfaceLow,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioIconSelected: { backgroundColor: Colors.primaryLight },
  radioLabel: { fontFamily: FontFamily.body, fontSize: 14, lineHeight: 22, color: Colors.onSurface, flex: 1 },
  radioLabelSelected: { fontFamily: FontFamily.bodyMedium, color: Colors.primary },
  radioCircle: {
    width: 20, height: 20, borderRadius: 10,
    borderWidth: 2, borderColor: Colors.surfaceHigh,
    alignItems: 'center', justifyContent: 'center',
  },
  radioCircleSelected: { borderColor: Colors.primary },
  radioCircleInner: { width: 10, height: 10, borderRadius: 5, backgroundColor: Colors.primary },
  // Toggle card
  toggleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.surfaceLowest,
    borderRadius: Radius.lg,
    padding: Spacing[4],
  },
  toggleContent: { flexDirection: 'row', alignItems: 'center', gap: Spacing[3] },
  toggleLabel: { fontFamily: FontFamily.bodyMedium, fontSize: 14, color: Colors.onSurface },
  // Children
  childrenArea: { marginTop: Spacing[4], gap: Spacing[3] },
  childRow: { flexDirection: 'row', alignItems: 'center' },
  childField: { flex: 1 },
  removeBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  // Footer
  footer: { paddingHorizontal: Spacing[6], marginTop: Spacing[10], marginBottom: Spacing[8] },
  skipRow: { alignItems: 'center', marginTop: Spacing[4] },
});
