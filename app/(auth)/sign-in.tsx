import { useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { Image } from 'expo-image';

import { Colors, FontFamily, Spacing, Radius } from '@/constants/theme';
import { AuthHeader } from '@/components/auth/auth-header';
import { KeyboardAwareScroll } from '@/components/auth/keyboard-aware-scroll';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

export default function SignInScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSignIn = async () => {
    setError('');
    setLoading(true);
    // TODO: Integrate real auth
    setTimeout(() => {
      setLoading(false);
      router.replace('/(tabs)');
    }, 1500);
  };

  return (
    <KeyboardAwareScroll>
      <AuthHeader
        title="Welcome back"
        subtitle="Sign in to your account to continue"
      />

      <Animated.View entering={FadeInDown.duration(400).delay(150)} style={styles.form}>
        <Input
          label="Email address"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
          icon="mail-outline"
          placeholder="Enter your email"
        />

        <View style={styles.fieldGap} />

        <Input
          label="Password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoComplete="current-password"
          icon="lock-closed-outline"
          placeholder="Enter your password"
        />

        <View style={styles.forgotRow}>
          <Button
            label="Forgot password?"
            variant="textLink"
            onPress={() => router.push('/(auth)/forgot-password')}
          />
        </View>
      </Animated.View>

      <Animated.View entering={FadeInDown.duration(400).delay(300)} style={styles.actions}>
        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Button
          label="Sign in"
          variant="primary"
          onPress={handleSignIn}
          loading={loading}
          disabled={!email || !password}
        />

        {/* Divider */}
        <View style={styles.dividerRow}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>or</Text>
          <View style={styles.dividerLine} />
        </View>

        {/* Google sign in */}
        <Pressable style={styles.googleButton} onPress={() => {}}>
          <Image
            source={require('@/assets/icons/google.svg')}
            style={styles.googleIcon}
            contentFit="contain"
          />
          <Text style={styles.googleLabel}>Continue with Google</Text>
        </Pressable>

        <View style={styles.createRow}>
          <Text style={styles.createText}>{"Don't have an account? "}</Text>
          <Button
            label="Sign up"
            variant="textLink"
            onPress={() => router.push('/(auth)/register-step-1')}
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
  forgotRow: {
    alignItems: 'flex-end',
    marginTop: Spacing[3],
  },
  actions: {
    paddingHorizontal: Spacing[6],
    marginTop: Spacing[8],
  },
  error: {
    fontFamily: FontFamily.body,
    fontSize: 14,
    lineHeight: 22,
    color: Colors.error,
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
    backgroundColor: Colors.surfaceHigh,
  },
  dividerText: {
    fontFamily: FontFamily.body,
    fontSize: 13,
    color: Colors.outline,
    marginHorizontal: Spacing[4],
  },
  googleButton: {
    height: 52,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: 'rgba(120, 86, 0, 0.20)',
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
    color: Colors.onSurface,
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
    color: Colors.onSurfaceVariant,
  },
});
