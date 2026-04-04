import { StyleSheet, Text, type TextProps } from 'react-native';

import { FontFamily } from '@/constants/theme';
import { useThemeColors } from '@/hooks/use-theme-colors';

export type ThemedTextProps = TextProps & {
  type?: 'default' | 'title' | 'defaultSemiBold' | 'subtitle' | 'link';
};

export function ThemedText({
  style,
  type = 'default',
  ...rest
}: ThemedTextProps) {
  const Colors = useThemeColors();

  return (
    <Text
      style={[
        { color: Colors.onSurface },
        type === 'default' ? styles.default : undefined,
        type === 'title' ? styles.title : undefined,
        type === 'defaultSemiBold' ? styles.defaultSemiBold : undefined,
        type === 'subtitle' ? styles.subtitle : undefined,
        type === 'link' ? [styles.link, { color: Colors.primary }] : undefined,
        style,
      ]}
      {...rest}
    />
  );
}

const styles = StyleSheet.create({
  default: {
    fontFamily: FontFamily.body,
    fontSize: 14,
    lineHeight: 22.4,
  },
  defaultSemiBold: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 14,
    lineHeight: 22.4,
  },
  title: {
    fontFamily: FontFamily.display,
    fontSize: 24,
    lineHeight: 28.8,
  },
  subtitle: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 20,
    lineHeight: 26,
  },
  link: {
    fontFamily: FontFamily.body,
    fontSize: 14,
    lineHeight: 22.4,
    textDecorationLine: 'underline',
  },
});
