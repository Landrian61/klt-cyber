import { View, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { Radius, GoldGradientHorizontal } from '@/constants/theme';
import { useThemeColors } from '@/hooks/use-theme-colors';

export interface ProgressBarProps {
  totalSteps: number;
  currentStep: number;
}

export function ProgressBar({ totalSteps, currentStep }: ProgressBarProps) {
  const Colors = useThemeColors();

  return (
    <View style={styles.container}>
      {Array.from({ length: totalSteps }, (_, i) => {
        const isComplete = i < currentStep;
        return (
          <View key={i} style={styles.segmentWrapper}>
            {isComplete ? (
              <LinearGradient
                colors={[...GoldGradientHorizontal.colors]}
                start={GoldGradientHorizontal.start}
                end={GoldGradientHorizontal.end}
                style={styles.segment}
              />
            ) : (
              <View style={[styles.segment, { backgroundColor: Colors.surfaceHigh }]} />
            )}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    gap: 3,
    width: '100%',
  },
  segmentWrapper: {
    flex: 1,
  },
  segment: {
    height: 3,
    borderRadius: Radius.full,
  },
});
