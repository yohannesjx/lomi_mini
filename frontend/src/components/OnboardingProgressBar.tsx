import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { COLORS, SPACING } from '../theme/colors';
import { TOTAL_ONBOARDING_STEPS } from '../navigation/OnboardingNavigator';

interface OnboardingProgressBarProps {
    currentStep: number;
    totalSteps?: number;
}

export const OnboardingProgressBar: React.FC<OnboardingProgressBarProps> = ({
    currentStep,
    totalSteps = TOTAL_ONBOARDING_STEPS,
}) => {
    const progressAnim = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        // Calculate progress: currentStep is 0-indexed, so we add 1 for display
        // Progress should be (currentStep + 1) / totalSteps
        const progress = (currentStep + 1) / totalSteps;
        
        // Animate progress bar
        Animated.spring(progressAnim, {
            toValue: progress,
            useNativeDriver: false,
            tension: 50,
            friction: 7,
        }).start();
    }, [currentStep, totalSteps]);

    const progressWidth = progressAnim.interpolate({
        inputRange: [0, 1],
        outputRange: ['0%', '100%'],
    });

    return (
        <View style={styles.container}>
            <View style={styles.progressBarContainer}>
                <View style={styles.progressBarBackground}>
                    <Animated.View
                        style={[
                            styles.progressBarFill,
                            {
                                width: progressWidth,
                            },
                        ]}
                    />
                </View>
            </View>
            <Text style={styles.stepText}>
                Step {currentStep + 1} of {totalSteps}
            </Text>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        paddingHorizontal: SPACING.l,
        paddingVertical: SPACING.m,
        backgroundColor: COLORS.background,
    },
    progressBarContainer: {
        width: '100%',
        marginBottom: SPACING.xs,
    },
    progressBarBackground: {
        height: 4,
        backgroundColor: COLORS.surfaceHighlight,
        borderRadius: 2,
        overflow: 'hidden',
    },
    progressBarFill: {
        height: '100%',
        backgroundColor: COLORS.primary,
        borderRadius: 2,
    },
    stepText: {
        fontSize: 12,
        color: COLORS.textSecondary,
        textAlign: 'center',
        fontWeight: '500',
    },
});

