import { useState, useMemo } from 'react';
import { View, Text, Pressable, StyleSheet, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { Colors, FontFamily, Spacing, Radius } from '@/constants/theme';
import { AuthHeader } from '@/components/auth/auth-header';
import { KeyboardAwareScroll } from '@/components/auth/keyboard-aware-scroll';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ProgressBar } from '@/components/ui/progress-bar';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { useRegistration } from '@/contexts/registration-context';

const MARITAL_OPTIONS = ['Single', 'Married', 'Widowed', 'Divorced'] as const;

function getPasswordStrength(pw: string): number {
  if (!pw) return 0;
  let score = 0;
  if (pw.length >= 8) score++;
  if (/[A-Z]/.test(pw) && /[0-9]/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  return score;
}

function formatDate(date: Date): string {
  const d = date.getDate().toString().padStart(2, '0');
  const m = (date.getMonth() + 1).toString().padStart(2, '0');
  const y = date.getFullYear();
  return `${d}/${m}/${y}`;
}

const STRENGTH_LABELS = ['Weak', 'Fair', 'Strong'];
const STRENGTH_COLORS = [Colors.error, Colors.warning, Colors.success];

export default function RegisterStep1Screen() {
  const router = useRouter();
  const { data, updateData } = useRegistration();

  const [showDatePicker, setShowDatePicker] = useState(false);
  const [emailError, setEmailError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [dobError, setDobError] = useState('');

  const passwordStrength = useMemo(() => getPasswordStrength(data.password), [data.password]);
  const sexIndex = data.sex === 'Male' ? 0 : data.sex === 'Female' ? 1 : -1;

  const handleDateChange = (_event: DateTimePickerEvent, date?: Date) => {
    setShowDatePicker(Platform.OS === 'ios');
    if (date) {
      const age = new Date().getFullYear() - date.getFullYear();
      if (age < 13) {
        setDobError('Must be 13 or older');
        return;
      }
      setDobError('');
      updateData({ dateOfBirth: date });
    }
  };

  const validateAndContinue = () => {
    let valid = true;
    if (data.password !== data.confirmPassword) {
      setPasswordError('Passwords do not match');
      valid = false;
    } else { setPasswordError(''); }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(data.email)) {
      setEmailError('Please enter a valid email');
      valid = false;
    } else { setEmailError(''); }

    if (valid) router.push('/(auth)/register-step-2');
  };

  const isFormValid =
    data.firstName.length > 0 && data.lastName.length > 0 &&
    data.email.length > 0 && data.password.length >= 8 &&
    data.confirmPassword.length > 0 && data.dateOfBirth !== null &&
    data.sex !== null && data.maritalStatus !== null;

  return (
    <KeyboardAwareScroll>
      <AuthHeader title="" showBack />

      {/* Progress */}
      <View style={styles.progressArea}>
        <ProgressBar totalSteps={3} currentStep={1} />
        <Text style={styles.stepLabel}>Step 1 of 3</Text>
      </View>

      <View style={styles.headingArea}>
        <Text style={styles.heading}>Personal information</Text>
        <Text style={styles.subheading}>
          Tell us about yourself. This builds your church profile.
        </Text>
      </View>

      {/* Form */}
      <Animated.View entering={FadeInDown.duration(400).delay(100)} style={styles.form}>
        {/* Names row */}
        <View style={styles.row}>
          <View style={styles.halfField}>
            <Input
              label="First name"
              value={data.firstName}
              onChangeText={(v) => updateData({ firstName: v })}
              autoComplete="given-name"
              placeholder="First name"
              icon="person-outline"
            />
          </View>
          <View style={styles.halfField}>
            <Input
              label="Last name"
              value={data.lastName}
              onChangeText={(v) => updateData({ lastName: v })}
              autoComplete="family-name"
              placeholder="Last name"
            />
          </View>
        </View>

        <View style={styles.gap} />

        <Input
          label="Email address"
          value={data.email}
          onChangeText={(v) => { updateData({ email: v }); setEmailError(''); }}
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
          error={emailError}
          icon="mail-outline"
          placeholder="you@example.com"
        />

        <View style={styles.gap} />

        <Input
          label="Create password"
          value={data.password}
          onChangeText={(v) => { updateData({ password: v }); setPasswordError(''); }}
          secureTextEntry
          autoComplete="new-password"
          helperText="Minimum 8 characters"
          icon="lock-closed-outline"
          placeholder="Create a strong password"
        />

        {/* Password strength */}
        {data.password.length > 0 && (
          <View style={styles.strengthArea}>
            <View style={styles.strengthBar}>
              {[0, 1, 2].map((i) => (
                <View
                  key={i}
                  style={[
                    styles.strengthSegment,
                    { backgroundColor: i < passwordStrength ? STRENGTH_COLORS[passwordStrength - 1] : Colors.surfaceHigh },
                  ]}
                />
              ))}
            </View>
            {passwordStrength > 0 && (
              <Text style={[styles.strengthLabel, { color: STRENGTH_COLORS[passwordStrength - 1] }]}>
                {STRENGTH_LABELS[passwordStrength - 1]}
              </Text>
            )}
          </View>
        )}

        <View style={styles.gap} />

        <Input
          label="Confirm password"
          value={data.confirmPassword}
          onChangeText={(v) => { updateData({ confirmPassword: v }); setPasswordError(''); }}
          secureTextEntry
          error={passwordError}
          icon="lock-closed-outline"
          placeholder="Re-enter your password"
        />

        <View style={styles.gap} />

        {/* Date of Birth */}
        <Pressable onPress={() => setShowDatePicker(true)}>
          <Input
            label="Date of birth"
            value={data.dateOfBirth ? formatDate(data.dateOfBirth) : ''}
            editable={false}
            pointerEvents="none"
            error={dobError}
            helperText="Must be 13+"
            icon="calendar-outline"
            placeholder="DD/MM/YYYY"
          />
        </Pressable>
        {showDatePicker && (
          <DateTimePicker
            value={data.dateOfBirth || new Date(2000, 0, 1)}
            mode="date"
            display="default"
            maximumDate={new Date()}
            onChange={handleDateChange}
          />
        )}

        <View style={styles.gap} />

        {/* Sex */}
        <Text style={styles.fieldLabel}>Sex</Text>
        <SegmentedControl
          options={['Male', 'Female']}
          selectedIndex={sexIndex}
          onChange={(i) => updateData({ sex: i === 0 ? 'Male' : 'Female' })}
        />

        <View style={styles.gapLarge} />

        {/* Marital Status */}
        <Text style={styles.fieldLabel}>Marital status</Text>
        <View style={styles.pillGrid}>
          {MARITAL_OPTIONS.map((option) => {
            const isSelected = data.maritalStatus === option;
            return (
              <Pressable
                key={option}
                onPress={() => updateData({ maritalStatus: option })}
                style={[styles.pillCard, isSelected && styles.pillCardSelected]}
              >
                <Text style={[styles.pillLabel, isSelected && styles.pillLabelSelected]}>
                  {option}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </Animated.View>

      {/* Footer */}
      <View style={styles.footer}>
        <Button
          label="Continue to step 2"
          variant="primary"
          onPress={validateAndContinue}
          disabled={!isFormValid}
        />
      </View>
    </KeyboardAwareScroll>
  );
}

const styles = StyleSheet.create({
  progressArea: {
    paddingHorizontal: Spacing[6],
    marginTop: Spacing[3],
  },
  stepLabel: {
    fontFamily: FontFamily.bodyMedium,
    fontSize: 12,
    lineHeight: 18,
    color: Colors.primary,
    marginTop: Spacing[2],
  },
  headingArea: {
    paddingHorizontal: Spacing[6],
    marginTop: Spacing[5],
  },
  heading: {
    fontFamily: FontFamily.display,
    fontSize: 24,
    lineHeight: 28.8,
    color: Colors.onSurface,
  },
  subheading: {
    fontFamily: FontFamily.body,
    fontSize: 14,
    lineHeight: 22,
    color: Colors.onSurfaceVariant,
    marginTop: Spacing[2],
  },
  form: {
    paddingHorizontal: Spacing[6],
    marginTop: Spacing[6],
  },
  row: {
    flexDirection: 'row',
    gap: Spacing[3],
  },
  halfField: {
    flex: 1,
  },
  gap: {
    height: Spacing[5],
  },
  gapLarge: {
    height: Spacing[6],
  },
  fieldLabel: {
    fontFamily: FontFamily.bodyMedium,
    fontSize: 13,
    lineHeight: 18,
    color: Colors.onSurface,
    marginBottom: Spacing[2],
  },
  // Password strength
  strengthArea: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[3],
    marginTop: Spacing[2],
  },
  strengthBar: {
    flexDirection: 'row',
    gap: 4,
    flex: 1,
  },
  strengthSegment: {
    flex: 1,
    height: 3,
    borderRadius: Radius.full,
  },
  strengthLabel: {
    fontFamily: FontFamily.bodyMedium,
    fontSize: 11,
    lineHeight: 15,
  },
  // Pill grid
  pillGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing[3],
  },
  pillCard: {
    width: '47%',
    flexGrow: 1,
    height: 50,
    backgroundColor: Colors.surfaceLowest,
    borderRadius: Radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillCardSelected: {
    backgroundColor: Colors.primaryFixedDim,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 2,
  },
  pillLabel: {
    fontFamily: FontFamily.bodyMedium,
    fontSize: 14,
    lineHeight: 22,
    color: Colors.onSurfaceVariant,
  },
  pillLabelSelected: {
    fontFamily: FontFamily.bodySemiBold,
    color: Colors.primary,
  },
  footer: {
    paddingHorizontal: Spacing[6],
    marginTop: Spacing[10],
    marginBottom: Spacing[8],
  },
});
