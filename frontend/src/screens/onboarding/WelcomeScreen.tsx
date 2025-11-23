import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Image, Dimensions, Platform, Alert, ScrollView, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Button } from '../../components/ui/Button';
import { COLORS, SPACING } from '../../theme/colors';
import { getTelegramInitData, initializeTelegramWebApp, getTelegramWebApp, getTelegramDebugInfo, isTelegramWebApp } from '../../utils/telegram';
import { useAuthStore } from '../../store/authStore';

const { width, height } = Dimensions.get('window');

export const WelcomeScreen = ({ navigation }: any) => {
    const { login, isLoading } = useAuthStore();
    const [tgUser, setTgUser] = useState<any>(null);

    useEffect(() => {
        // Get Telegram user info immediately
        const webApp = getTelegramWebApp();
        if (webApp?.initDataUnsafe?.user) {
            setTgUser(webApp.initDataUnsafe.user);
        }
    }, []);

    const handleStart = async () => {
        try {
            const initData = getTelegramInitData();
            if (!initData) {
                Alert.alert('Error', 'Could not authenticate with Telegram. Please try again.');
                return;
            }

            await login(initData);

            // Navigation is handled by AuthGuard or we can do it here explicitly
            // But since AuthGuard wraps this, updating the store (via login) might trigger a re-render/redirect
            // However, AuthGuard only redirects on mount or if we manually check.
            // Let's manually navigate to be safe, checking the user state.

            const user = useAuthStore.getState().user;
            if (user?.onboarding_completed) {
                navigation.replace('Main');
            } else {
                navigation.replace('Onboarding');
            }

        } catch (error: any) {
            console.error('Login failed:', error);
            Alert.alert('Login Failed', 'Please try again.');
        }
    };

    return (
        <View style={styles.container}>
            {/* Background Image / Gradient */}
            <Image
                source={{ uri: 'https://images.unsplash.com/photo-1566737236500-c8ac43014a67?q=80&w=1000&auto=format&fit=crop' }}
                style={styles.backgroundImage}
                resizeMode="cover"
            />

            <LinearGradient
                colors={['transparent', 'rgba(0,0,0,0.8)', '#000000']}
                style={styles.gradient}
            />

            <SafeAreaView style={styles.content}>
                <View style={styles.header}>
                    <View style={styles.logoContainer}>
                        <Text style={styles.logoEmoji}>🍋</Text>
                    </View>
                    <Text style={styles.appName}>Lomi Social</Text>
                </View>

                <View style={styles.footer}>
                    {tgUser && (
                        <View style={styles.welcomeContainer}>
                            {tgUser.photo_url && (
                                <Image source={{ uri: tgUser.photo_url }} style={styles.userPhoto} />
                            )}
                            <Text style={styles.welcomeText}>
                                Welcome back, <Text style={styles.highlight}>{tgUser.first_name}</Text>!
                            </Text>
                        </View>
                    )}

                    <Text style={styles.tagline}>
                        Find your <Text style={styles.highlight}>Lomi</Text> in Ethiopia
                    </Text>
                    <Text style={styles.description}>
                        The most beautiful way to meet Habesha singles.
                        Serious dating, culture, and fun.
                    </Text>

                    <Button
                        title={isLoading ? "Starting..." : "Let's Get Started"}
                        onPress={handleStart}
                        isLoading={isLoading}
                        size="large"
                        style={styles.button}
                    />

                    <Text style={styles.terms}>
                        By continuing, you agree to our Terms & Privacy Policy.
                    </Text>
                </View>
            </SafeAreaView>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: COLORS.background,
    },
    backgroundImage: {
        width: width,
        height: height * 0.7,
        position: 'absolute',
        top: 0,
    },
    gradient: {
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        height: height,
    },
    content: {
        flex: 1,
        justifyContent: 'space-between',
    },
    header: {
        alignItems: 'center',
        marginTop: SPACING.xl,
    },
    logoContainer: {
        width: 80,
        height: 80,
        borderRadius: 40,
        backgroundColor: 'rgba(167, 255, 131, 0.2)',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: SPACING.m,
        borderWidth: 1,
        borderColor: COLORS.primary,
    },
    logoEmoji: {
        fontSize: 40,
    },
    appName: {
        fontSize: 24,
        fontWeight: 'bold',
        color: COLORS.textPrimary,
        letterSpacing: 1,
    },
    footer: {
        padding: SPACING.l,
        paddingBottom: SPACING.xl,
    },
    tagline: {
        fontSize: 36,
        fontWeight: 'bold',
        color: COLORS.textPrimary,
        marginBottom: SPACING.m,
        lineHeight: 44,
    },
    highlight: {
        color: COLORS.primary,
    },
    description: {
        fontSize: 16,
        color: COLORS.textSecondary,
        marginBottom: SPACING.xl,
        lineHeight: 24,
    },
    loadingContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: SPACING.m,
    },
    loadingText: {
        color: COLORS.textSecondary,
        marginLeft: SPACING.s,
        fontSize: 14,
    },
    button: {
        marginBottom: SPACING.m,
        shadowColor: COLORS.primary,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 5,
    },
    terms: {
        fontSize: 12,
        color: COLORS.textTertiary,
        textAlign: 'center',
    },
    buttonPlaceholder: {
        height: 50,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: SPACING.m,
    },
    buttonPlaceholderText: {
        fontSize: 14,
        color: COLORS.textSecondary,
        fontStyle: 'italic',
    },
    // Error/Warning screen styles
    errorContent: {
        flex: 1,
        padding: SPACING.l,
    },
    errorScroll: {
        flexGrow: 1,
        justifyContent: 'center',
    },
    errorHeader: {
        alignItems: 'center',
        marginBottom: SPACING.xl,
    },
    errorEmoji: {
        fontSize: 64,
        marginBottom: SPACING.m,
    },
    errorTitle: {
        fontSize: 28,
        fontWeight: 'bold',
        color: COLORS.textPrimary,
        textAlign: 'center',
        marginBottom: SPACING.m,
    },
    errorBox: {
        backgroundColor: 'rgba(255, 193, 7, 0.1)',
        borderColor: '#FFC107',
        borderWidth: 2,
        borderRadius: 12,
        padding: SPACING.l,
        marginBottom: SPACING.l,
    },
    errorMessage: {
        fontSize: 16,
        color: COLORS.textPrimary,
        lineHeight: 24,
        textAlign: 'center',
    },
    instructionsBox: {
        backgroundColor: 'rgba(167, 255, 131, 0.1)',
        borderColor: COLORS.primary,
        borderWidth: 1,
        borderRadius: 12,
        padding: SPACING.l,
        marginBottom: SPACING.l,
    },
    instructionsTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        color: COLORS.primary,
        marginBottom: SPACING.m,
    },
    stepContainer: {
        flexDirection: 'row',
        marginBottom: SPACING.m,
        alignItems: 'flex-start',
    },
    stepNumber: {
        fontSize: 18,
        fontWeight: 'bold',
        color: COLORS.primary,
        width: 30,
        textAlign: 'center',
        marginRight: SPACING.m,
    },
    stepText: {
        flex: 1,
        fontSize: 16,
        color: COLORS.textPrimary,
        lineHeight: 24,
    },
    bold: {
        fontWeight: 'bold',
        color: COLORS.primary,
    },
    dontBox: {
        backgroundColor: 'rgba(255, 82, 82, 0.1)',
        borderColor: '#FF5252',
        borderWidth: 1,
        borderRadius: 12,
        padding: SPACING.l,
        marginBottom: SPACING.l,
    },
    dontTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#FF5252',
        marginBottom: SPACING.m,
    },
    dontText: {
        fontSize: 16,
        color: COLORS.textPrimary,
        lineHeight: 24,
        marginBottom: SPACING.xs,
    },
    debugBox: {
        backgroundColor: 'rgba(100, 100, 100, 0.2)',
        borderColor: '#666',
        borderWidth: 1,
        borderRadius: 12,
        padding: SPACING.m,
        marginTop: SPACING.l,
    },
    debugTitle: {
        fontSize: 14,
        fontWeight: 'bold',
        color: COLORS.textSecondary,
        marginBottom: SPACING.xs,
    },
    debugText: {
        fontSize: 12,
        color: COLORS.textTertiary,
        fontFamily: 'monospace',
        marginBottom: SPACING.xs,
    },
    widgetContainer: {
        marginBottom: SPACING.m,
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: 50,
    },
    welcomeContainer: {
        alignItems: 'center',
        marginBottom: SPACING.l,
    },
    userPhoto: {
        width: 80,
        height: 80,
        borderRadius: 40,
        borderWidth: 2,
        borderColor: COLORS.primary,
        marginBottom: SPACING.m,
    },
    welcomeText: {
        fontSize: 24,
        fontWeight: 'bold',
        color: COLORS.textPrimary,
        textAlign: 'center',
    },
});
