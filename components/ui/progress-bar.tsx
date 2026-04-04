import { View, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { Colors, Radius, GoldGradientHorizontal } from '@/constants/theme';

export interface ProgressBarProps {
  totalSteps: number;
  currentStep: number;
}

export function ProgressBar({ totalSteps, currentStep }: ProgressBarProps) {
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
              <View style={[styles.segment, styles.incomplete]} />
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
  incomplete: {
    backgroundColor: Colors.surfaceHigh,
  },
});
