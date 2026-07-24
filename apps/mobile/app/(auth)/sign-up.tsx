import { useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Image } from 'expo-image';
import { signUpInputSchema } from '@klt-cyber/shared';

import { FontFamily, Spacing, Radius } from '@/constants/theme';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { AuthHeader } from '@/components/auth/auth-header';
import { KeyboardAwareScroll } from '@/components/auth/keyboard-aware-scroll';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { authClient } from '@/lib/auth';

export default function SignUpScreen() {
  const Colors = useThemeColors();
  const router = useRouter();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firstNameError, setFirstNameError] = useState('');
  const [lastNameError, setLastNameError] = useState('');
  const [emailError, setEmailError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  const handleSignUp = async () => {
    setError('');
    setFirstNameError('');
    setLastNameError('');
    setEmailError('');
    setPasswordError('');

    // Sign-up (docs/DATA_MODEL.md, Increment 1): first/last name + email + password.
    const parsed = signUpInputSchema.safeParse({ firstName, lastName, email, password });
    if (!parsed.success) {
      const fields = parsed.error.flatten().fieldErrors;
      if (fields.firstName) setFirstNameError('Please enter your first name.');
      if (fields.lastName) setLastNameError('Please enter your last name.');
      if (fields.email) setEmailError('Please enter a valid email address.');
      if (fields.password) setPasswordError('Password must be at least 8 characters.');
      return;
    }

    setLoading(true);
    // Better Auth stores a single `name`; the Convex onCreate trigger splits it
    // into first/last — the same path Google sign-in uses. A fresh account is
    // still a visitor (no church profile yet).
    const { error: signUpError } = await authClient.signUp.email({
      email: parsed.data.email,
      password: parsed.data.password,
      name: `${parsed.data.firstName} ${parsed.data.lastName}`,
    });
    setLoading(false);

    if (signUpError) {
      setError(signUpError.message ?? 'Could not create your account. Please try again.');
      return;
    }
    // No manual navigation: once the session is established, the root auth
    // gate (Stack.Protected in app/_layout.tsx) swaps (auth) → (tabs).
  };

  const handleGoogle = async () => {
    setError('');
    setGoogleLoading(true);
    const { error: googleError } = await authClient.signIn.social({ provider: 'google' });
    if (googleError) {
      setGoogleLoading(false);
      setError(googleError.message ?? 'Google sign-in is unavailable right now.');
    }
  };

  return (
    <KeyboardAwareScroll>
      <AuthHeader
        title="Create your account"
        subtitle="Tell us your name and sign up with your email"
      />

      <Animated.View entering={FadeInDown.duration(400).delay(150)} style={styles.form}>
        <Input
          label="First name"
          value={firstName}
          onChangeText={(v) => { setFirstName(v); setFirstNameError(''); }}
          autoCapitalize="words"
          autoComplete="given-name"
          error={firstNameError}
          icon="person-outline"
          placeholder="Grace"
        />

        <View style={styles.fieldGap} />

        <Input
          label="Last name"
          value={lastName}
          onChangeText={(v) => { setLastName(v); setLastNameError(''); }}
          autoCapitalize="words"
          autoComplete="family-name"
          error={lastNameError}
          icon="person-outline"
          placeholder="Nakato"
        />

        <View style={styles.fieldGap} />

        <Input
          label="Email address"
          value={email}
          onChangeText={(v) => { setEmail(v); setEmailError(''); }}
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
          error={emailError}
          icon="mail-outline"
          placeholder="you@example.com"
        />

        <View style={styles.fieldGap} />

        <Input
          label="Password"
          value={password}
          onChangeText={(v) => { setPassword(v); setPasswordError(''); }}
          secureTextEntry
          autoComplete="new-password"
          error={passwordError}
          helperText="Minimum 8 characters"
          icon="lock-closed-outline"
          placeholder="Create a strong password"
        />
      </Animated.View>

      <Animated.View entering={FadeInDown.duration(400).delay(300)} style={styles.actions}>
        {error ? <Text style={[styles.error, { color: Colors.error }]}>{error}</Text> : null}

        <Button
          label="Create account"
          variant="primary"
          onPress={handleSignUp}
          loading={loading}
        />

        {/* Divider */}
        <View style={styles.dividerRow}>
          <View style={[styles.dividerLine, { backgroundColor: Colors.surfaceHigh }]} />
          <Text style={[styles.dividerText, { color: Colors.outline }]}>or</Text>
          <View style={[styles.dividerLine, { backgroundColor: Colors.surfaceHigh }]} />
        </View>

        {/* Google sign in */}
        <Pressable style={styles.googleButton} onPress={handleGoogle} disabled={googleLoading}>
          <Image
            source={require('@/assets/icons/google.svg')}
            style={styles.googleIcon}
            contentFit="contain"
          />
          <Text style={[styles.googleLabel, { color: Colors.onSurface }]}>
            {googleLoading ? 'Connecting…' : 'Continue with Google'}
          </Text>
        </Pressable>

        <View style={styles.createRow}>
          <Text style={[styles.createText, { color: Colors.onSurfaceVariant }]}>Already have an account? </Text>
          <Button
            label="Sign in"
            variant="textLink"
            onPress={() => router.replace('/(auth)/sign-in')}
          />
        </View>
      </Animated.View>
    </KeyboardAwareScroll>
  );
}

const styles = StyleSheet.create({
  form: {
    paddingHorizontal: Spacing[6],
    marginTop: Spacing[8],
  },
  fieldGap: {
    height: Spacing[5],
  },
  actions: {
    paddingHorizontal: Spacing[6],
    marginTop: Spacing[8],
  },
  error: {
    fontFamily: FontFamily.body,
    fontSize: 14,
    lineHeight: 22,
    textAlign: 'center',
    marginBottom: Spacing[3],
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: Spacing[6],
  },
  dividerLine: {
    flex: 1,
    height: 1,
  },
  dividerText: {
    fontFamily: FontFamily.body,
    fontSize: 13,
    marginHorizontal: Spacing[4],
  },
  googleButton: {
    height: 52,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: 'rgba(36, 27, 16, 0.15)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing[3],
  },
  googleIcon: {
    width: 20,
    height: 20,
  },
  googleLabel: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 16,
    lineHeight: 24,
  },
  createRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: Spacing[6],
    marginBottom: Spacing[4],
  },
  createText: {
    fontFamily: FontFamily.body,
    fontSize: 14,
    lineHeight: 22,
  },
});
