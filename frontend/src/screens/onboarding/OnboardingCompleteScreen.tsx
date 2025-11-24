import React, { useEffect } from 'react';
import { View, Text, StyleSheet, Animated, StatusBar } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '../../components/ui/Button';
import { COLORS, SPACING, SIZES } from '../../theme/colors';
import { useOnboardingStore } from '../../store/onboardingStore';

export const OnboardingCompleteScreen = ({ navigation }: any) => {
    const { updateStep } = useOnboardingStore();
    const confettiAnim = React.useRef(new Animated.Value(0)).current;
    const scaleAnim = React.useRef(new Animated.Value(0)).current;

    useEffect(() => {
        // Mark onboarding as completed
        updateStep(8, true);

        // Animate confetti
        Animated.parallel([
            Animated.spring(confettiAnim, {
                toValue: 1,
                useNativeDriver: true,
                tension: 50,
                friction: 7,
            }),
            Animated.spring(scaleAnim, {
                toValue: 1,
                useNativeDriver: true,
                tension: 50,
                friction: 7,
            }),
        ]).start();
    }, []);

    const handleStart = () => {
        navigation.reset({
            index: 0,
            routes: [{ name: 'Main' }],
        });
    };

    return (
        <View style={styles.container}>
            <StatusBar barStyle="dark-content" backgroundColor={COLORS.background} />
            <SafeAreaView style={styles.safeArea} edges={['bottom']}>
            <View style={styles.content}>
                <Animated.View
                    style={[
                        styles.confettiContainer,
                        {
                            opacity: confettiAnim,
                            transform: [
                                {
                                    scale: scaleAnim.interpolate({
                                        inputRange: [0, 1],
                                        outputRange: [0.5, 1],
                                    }),
                                },
                            ],
                        },
                    ]}
                >
                    <Text style={styles.confetti}>🎉</Text>
                </Animated.View>

                <View style={styles.header}>
                    <Text style={styles.title}>You're all set! 🍋</Text>
                    <Text style={styles.subtitle}>
                        Your profile is complete. Start swiping to find your Lomi!
                    </Text>
                </View>

                <View style={styles.stats}>
                    <View style={styles.statCard}>
                        <Text style={styles.statNumber}>38</Text>
                        <Text style={styles.statLabel}>People nearby</Text>
                    </View>
                    <View style={styles.statCard}>
                        <Text style={styles.statNumber}>12</Text>
                        <Text style={styles.statLabel}>New today</Text>
                    </View>
                </View>

                <View style={styles.footer}>
                    <Button
                        title="Start Swiping"
                        onPress={handleStart}
                        size="large"
                    />
                </View>
            </View>
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: COLORS.background,
    },
    content: {
        flex: 1,
        padding: SPACING.l,
        justifyContent: 'center',
        alignItems: 'center',
    },
    confettiContainer: {
        marginBottom: SPACING.xl,
    },
    confetti: {
        fontSize: 80,
    },
    header: {
        alignItems: 'center',
        marginBottom: SPACING.xl,
    },
    title: {
        fontSize: 32,
        fontWeight: 'bold',
        color: COLORS.textPrimary,
        marginBottom: SPACING.m,
        textAlign: 'center',
    },
    subtitle: {
        fontSize: 18,
        color: COLORS.textSecondary,
        textAlign: 'center',
        lineHeight: 26,
    },
    stats: {
        flexDirection: 'row',
        gap: SPACING.m,
        marginBottom: SPACING.xl,
    },
    statCard: {
        flex: 1,
        backgroundColor: COLORS.surface,
        borderRadius: SIZES.radiusM,
        padding: SPACING.l,
        alignItems: 'center',
    },
    statNumber: {
        fontSize: 32,
        fontWeight: 'bold',
        color: COLORS.primary,
        marginBottom: SPACING.xs,
    },
    statLabel: {
        fontSize: 14,
        color: COLORS.textSecondary,
    },
    footer: {
        width: '100%',
        marginTop: SPACING.xl,
    },
});

