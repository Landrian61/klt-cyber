import { useState, useRef, useEffect } from 'react';
import {
  View,
  TextInput,
  Text,
  Pressable,
  StyleSheet,
  TextInputProps,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';

import { Colors, FontFamily, Spacing, Radius, Duration } from '@/constants/theme';

export interface InputProps extends Omit<TextInputProps, 'style'> {
  label: string;
  error?: string;
  helperText?: string;
  secureTextEntry?: boolean;
  icon?: keyof typeof Ionicons.glyphMap;
}

export function Input({
  label,
  value,
  onChangeText,
  error,
  helperText,
  secureTextEntry: secureTextEntryProp = false,
  icon,
  ...rest
}: InputProps) {
  const [isFocused, setIsFocused] = useState(false);
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const inputRef = useRef<TextInput>(null);

  // Animated focus border
  const focusProgress = useSharedValue(0);

  useEffect(() => {
    focusProgress.value = withTiming(isFocused ? 1 : 0, { duration: Duration.inputFocus });
  }, [isFocused, focusProgress]);

  const focusBorderStyle = useAnimatedStyle(() => ({
    borderColor: error
      ? Colors.error
      : focusProgress.value > 0.5
        ? Colors.primary
        : 'transparent',
    borderWidth: 1.5,
  }));

  return (
    <View style={styles.container}>
      {/* Label above input */}
      <Text style={[styles.label, error && styles.labelError]}>
        {label}
      </Text>

      {/* Input container with subtle background */}
      <Animated.View style={[styles.inputContainer, focusBorderStyle, error && styles.inputContainerError]}>
        <Pressable onPress={() => inputRef.current?.focus()} style={styles.inputRow}>
          {icon && (
            <Ionicons
              name={icon}
              size={18}
              color={isFocused ? Colors.primary : Colors.outline}
              style={styles.leftIcon}
            />
          )}
          <TextInput
            ref={inputRef}
            value={value}
            onChangeText={onChangeText}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            secureTextEntry={secureTextEntryProp && !isPasswordVisible}
            style={[styles.input, icon && styles.inputWithIcon]}
            placeholderTextColor={Colors.outline}
            selectionColor={Colors.primary}
            placeholder={rest.placeholder || label}
            {...rest}
          />
          {secureTextEntryProp && (
            <Pressable
              onPress={() => setIsPasswordVisible((prev) => !prev)}
              style={styles.eyeToggle}
              accessibilityLabel={isPasswordVisible ? 'Hide password' : 'Show password'}
            >
              <Ionicons
                name={isPasswordVisible ? 'eye-off-outline' : 'eye-outline'}
                size={20}
                color={Colors.outline}
              />
            </Pressable>
          )}
        </Pressable>
      </Animated.View>

      {/* Helper / error text */}
      {(error || helperText) && (
        <Text style={[styles.helper, error && styles.helperError]}>
          {error || helperText}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  label: {
    fontFamily: FontFamily.bodyMedium,
    fontSize: 13,
    lineHeight: 18,
    color: Colors.onSurface,
    marginBottom: Spacing[2],
  },
  labelError: {
    color: Colors.error,
  },
  inputContainer: {
    backgroundColor: Colors.surfaceLowest,
    borderRadius: Radius.lg,
    borderWidth: 1.5,
    borderColor: 'transparent',
    overflow: 'hidden',
  },
  inputContainerError: {
    borderColor: Colors.error,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 52,
    paddingHorizontal: Spacing[4],
  },
  leftIcon: {
    marginRight: Spacing[3],
  },
  input: {
    flex: 1,
    fontFamily: FontFamily.body,
    fontSize: 15,
    lineHeight: 22,
    color: Colors.onSurface,
    paddingVertical: 14,
  },
  inputWithIcon: {
    paddingLeft: 0,
  },
  eyeToggle: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: -Spacing[2],
  },
  helper: {
    fontFamily: FontFamily.body,
    fontSize: 12,
    lineHeight: 16,
    color: Colors.onSurfaceVariant,
    marginTop: 6,
    paddingLeft: 2,
  },
  helperError: {
    color: Colors.error,
  },
});
