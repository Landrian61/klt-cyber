import { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInDown, FadeIn } from 'react-native-reanimated';

import { FontFamily, Spacing } from '@/constants/theme';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { AuthHeader } from '@/components/auth/auth-header';
import { KeyboardAwareScroll } from '@/components/auth/keyboard-aware-scroll';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

export default function ForgotPasswordScreen() {
  const Colors = useThemeColors();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSendReset = async () => {
    setLoading(true);
    // TODO: Integrate real password reset
    setTimeout(() => {
      setLoading(false);
      setSent(true);
    }, 1500);
  };

  if (sent) {
    return (
      <KeyboardAwareScroll>
        <AuthHeader title="" showBack />
        <Animated.View entering={FadeIn.duration(500)} style={styles.successContainer}>
          <LinearGradient
            colors={[Colors.success, '#3a9140']}
            style={[styles.checkCircle, { shadowColor: Colors.success }]}
          >
            <Ionicons name="checkmark" size={40} color="#FFFFFF" />
          </LinearGradient>
          <Text style={[styles.successTitle, { color: Colors.onSurface }]}>Check your inbox</Text>
          <Text style={[styles.successBody, { color: Colors.onSurfaceVariant }]}>
            {"We've sent a reset link to"}{'\n'}
            <Text style={[styles.emailHighlight, { color: Colors.onSurface }]}>{email}</Text>
            {'\n'}Expires in 30 minutes.
          </Text>
          <View style={styles.backLink}>
            <Button
              label="Back to sign in"
              variant="primary"
              onPress={() => router.navigate('/(auth)/sign-in')}
            />
          </View>
        </Animated.View>
      </KeyboardAwareScroll>
    );
  }

  return (
    <KeyboardAwareScroll>
      <AuthHeader
        title="Reset your password"
        subtitle={"No worries! Enter your email and we'll send you a reset link."}
      />

      {/* Illustration area */}
      <Animated.View entering={FadeInDown.duration(400).delay(100)} style={styles.illustrationArea}>
        <View style={[styles.illustrationCircle, { backgroundColor: Colors.primaryLight }]}>
          <Ionicons name="key-outline" size={40} color={Colors.primary} />
        </View>
      </Animated.View>

      <Animated.View entering={FadeInDown.duration(400).delay(200)} style={styles.form}>
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
      </Animated.View>

      <Animated.View entering={FadeInDown.duration(400).delay(300)} style={styles.actions}>
        <Button
          label="Send reset link"
          variant="primary"
          onPress={handleSendReset}
          loading={loading}
          disabled={!email}
        />
        <View style={styles.backTextRow}>
          <Text style={[styles.backText, { color: Colors.onSurfaceVariant }]}>Remember your password? </Text>
          <Button
            label="Sign in"
            variant="textLink"
            onPress={() => router.back()}
          />
        </View>
      </Animated.View>
    </KeyboardAwareScroll>
  );
}

const styles = StyleSheet.create({
  illustrationArea: {
    alignItems: 'center',
    marginTop: Spacing[8],
  },
  illustrationCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  form: {
    paddingHorizontal: Spacing[6],
    marginTop: Spacing[8],
  },
  actions: {
    paddingHorizontal: Spacing[6],
    marginTop: Spacing[8],
  },
  backTextRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: Spacing[5],
  },
  backText: {
    fontFamily: FontFamily.body,
    fontSize: 14,
    lineHeight: 22,
  },
  // Success state
  successContainer: {
    alignItems: 'center',
    paddingHorizontal: Spacing[6],
    marginTop: Spacing[16],
  },
  checkCircle: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 16,
    elevation: 6,
  },
  successTitle: {
    fontFamily: FontFamily.display,
    fontSize: 24,
    lineHeight: 28.8,
    textAlign: 'center',
    marginTop: Spacing[6],
  },
  successBody: {
    fontFamily: FontFamily.body,
    fontSize: 14,
    lineHeight: 22,
    textAlign: 'center',
    marginTop: Spacing[3],
  },
  emailHighlight: {
    fontFamily: FontFamily.bodySemiBold,
  },
  backLink: {
    marginTop: Spacing[8],
    width: '100%',
  },
});
