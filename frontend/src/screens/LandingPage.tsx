import React, { useEffect, useMemo, useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    Animated,
    Dimensions,
    Platform,
    Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '../components/ui/Button';
import { COLORS, SPACING } from '../theme/colors';
import { useAuthStore } from '../store/authStore';
import { isTelegramWebApp } from '../utils/telegram';
import { signInWithGoogleWeb } from '../utils/firebase';

const { width } = Dimensions.get('window');

export const LandingPage = ({ navigation }: any) => {
    const { user, isAuthenticated, isLoading, loginWithGoogle } = useAuthStore();

    const [isTelegramEnv, setIsTelegramEnv] = useState<boolean>(isTelegramWebApp());
    const [googleLoading, setGoogleLoading] = useState(false);
    const [heroGlow] = useState(new Animated.Value(0));

    useEffect(() => {
        setIsTelegramEnv(isTelegramWebApp());
    }, []);

    useEffect(() => {
        Animated.loop(
            Animated.sequence([
                Animated.timing(heroGlow, {
                    toValue: 1,
                    duration: 2000,
                    useNativeDriver: true,
                }),
                Animated.timing(heroGlow, {
                    toValue: 0,
                    duration: 2000,
                    useNativeDriver: true,
                }),
            ])
        ).start();
    }, [heroGlow]);

    const handleLetsGo = () => {
        if (!isAuthenticated) {
            Alert.alert('Almost there', 'Please sign in first.');
            return;
        }

        if (user?.onboarding_completed) {
            navigation.reset({
                index: 0,
                routes: [{ name: 'Main' }],
            });
        } else {
            navigation.navigate('Onboarding');
        }
    };

    const handleGoogleLogin = async () => {
        try {
            setGoogleLoading(true);
            const result = await signInWithGoogleWeb();
            await loginWithGoogle(result.idToken);
        } catch (error: any) {
            console.error('❌ Google sign-in failed:', error);
            Alert.alert(
                'Google Sign-In Failed',
                error?.message || 'Please try again in a moment.'
            );
        } finally {
            setGoogleLoading(false);
        }
    };

    const welcomeLine = useMemo(() => {
        if (user?.name) {
            return `Welcome back, ${user.name.split(' ')[0]} ✨`;
        }
        if (isTelegramEnv) {
            return 'Telegram Verified Entry';
        }
        return 'Exclusive access for Ethiopia & diaspora';
    }, [isTelegramEnv, user?.name]);

    const showGoogleButton = Platform.OS === 'web' && !isTelegramEnv;

    return (
        <View style={styles.container}>
            <LinearGradient
                colors={['#020202', '#050505', '#000']}
                style={StyleSheet.absoluteFill}
            />
            <SafeAreaView style={styles.safeArea}>
                <View style={styles.content}>
                    <Animated.View
                        style={[
                            styles.logoOrb,
                            {
                                shadowOpacity: heroGlow.interpolate({
                                    inputRange: [0, 1],
                                    outputRange: [0.2, 0.6],
                                }) as unknown as number,
                            },
                        ]}
                    >
                        <Animated.Text
                            style={[
                                styles.logoText,
                                {
                                    textShadowRadius: heroGlow.interpolate({
                                        inputRange: [0, 1],
                                        outputRange: [8, 16],
                                    }) as unknown as number,
                                },
                            ]}
                        >
                            L
                        </Animated.Text>
                    </Animated.View>

                    <Text style={styles.tagline}>Find Your Lomi in Ethiopia</Text>
                    <Text style={styles.subline}>{welcomeLine}</Text>

                    <View style={styles.card}>
                        <Text style={styles.cardHeadline}>
                            {isAuthenticated ? 'You are in.' : 'Exclusive access'}
                        </Text>
                        <Text style={styles.cardBody}>
                            Curated matches, culture-first stories, and zero-lag moderation.
                        </Text>

                        {showGoogleButton && !isAuthenticated && (
                            <Button
                                title="Continue with Google"
                                onPress={handleGoogleLogin}
                                isLoading={googleLoading || isLoading}
                                variant="secondary"
                                style={styles.googleButton}
                            />
                        )}

                        <Button
                            title="Let’s Go!"
                            onPress={handleLetsGo}
                            isLoading={isLoading && isAuthenticated}
                            disabled={!isAuthenticated}
                            style={[
                                styles.ctaButton,
                                !isAuthenticated && styles.ctaDisabled,
                            ]}
                        />
                        {!isAuthenticated && (
                            <Text style={styles.helperText}>
                                {showGoogleButton
                                    ? 'Sign in to unlock the experience.'
                                    : 'Waiting for Telegram to confirm you...'}
                            </Text>
                        )}
                    </View>

                    <Text style={styles.footerText}>
                        Designed for Telegram Mini App + Web / PWA
                    </Text>
                </View>
            </SafeAreaView>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#000',
    },
    safeArea: {
        flex: 1,
    },
    content: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: SPACING.l,
    },
    logoOrb: {
        width: width * 0.35,
        height: width * 0.35,
        borderRadius: width,
        backgroundColor: 'rgba(167, 255, 131, 0.15)',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: SPACING.l,
        shadowColor: COLORS.primary,
        shadowOffset: { width: 0, height: 0 },
        shadowRadius: 24,
    },
    logoText: {
        fontSize: width * 0.18,
        fontWeight: '900',
        color: COLORS.primary,
        letterSpacing: 8,
    },
    tagline: {
        fontSize: 32,
        color: COLORS.textPrimary,
        fontWeight: '700',
        textAlign: 'center',
    },
    subline: {
        color: COLORS.textSecondary,
        marginTop: SPACING.s,
        marginBottom: SPACING.xl,
        textAlign: 'center',
    },
    card: {
        width: '100%',
        backgroundColor: COLORS.surface,
        borderRadius: 32,
        padding: SPACING.xl,
        borderWidth: 1,
        borderColor: 'rgba(167,255,131,0.2)',
        shadowColor: '#000',
        shadowOpacity: 0.25,
        shadowRadius: 20,
    },
    cardHeadline: {
        color: COLORS.primary,
        fontSize: 18,
        fontWeight: '600',
        marginBottom: SPACING.s,
        textTransform: 'uppercase',
        letterSpacing: 2,
    },
    cardBody: {
        color: COLORS.textSecondary,
        fontSize: 15,
        lineHeight: 22,
        marginBottom: SPACING.l,
    },
    googleButton: {
        marginBottom: SPACING.m,
        borderColor: 'rgba(167,255,131,0.4)',
        borderWidth: 1,
        backgroundColor: 'transparent',
    },
    ctaButton: {
        shadowColor: COLORS.primary,
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.35,
        shadowRadius: 20,
    },
    ctaDisabled: {
        shadowOpacity: 0,
    },
    helperText: {
        color: COLORS.textSecondary,
        fontSize: 13,
        marginTop: SPACING.s,
        textAlign: 'center',
    },
    footerText: {
        color: COLORS.textTertiary,
        fontSize: 12,
        marginTop: SPACING.xl,
        textAlign: 'center',
    },
});


