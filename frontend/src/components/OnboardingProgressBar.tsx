import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { COLORS, SPACING } from '../theme/colors';

interface OnboardingProgressBarProps {
    currentStep: number;
    totalSteps?: number;
    showStepNumbers?: boolean;
}

const TOTAL_STEPS = 8;

export const OnboardingProgressBar: React.FC<OnboardingProgressBarProps> = ({
    currentStep,
    totalSteps = TOTAL_STEPS,
    showStepNumbers = true,
}) => {
    const progressAnim = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        // Animate progress bar
        Animated.spring(progressAnim, {
            toValue: currentStep / totalSteps,
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
            {showStepNumbers && (
                <View style={styles.stepInfo}>
                    <Text style={styles.stepText}>
                        Step {currentStep} of {totalSteps}
                    </Text>
                    <Text style={styles.progressText}>
                        {Math.round((currentStep / totalSteps) * 100)}%
                    </Text>
                </View>
            )}
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
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        paddingHorizontal: SPACING.l,
        paddingVertical: SPACING.m,
        backgroundColor: COLORS.background,
    },
    stepInfo: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: SPACING.xs,
    },
    stepText: {
        fontSize: 14,
        color: COLORS.textSecondary,
        fontWeight: '500',
    },
    progressText: {
        fontSize: 14,
        color: COLORS.primary,
        fontWeight: '600',
    },
    progressBarContainer: {
        width: '100%',
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
});

