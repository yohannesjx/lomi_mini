import React, { useEffect, useState, useRef } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Platform } from 'react-native';
import { NavigationContainerRef } from '@react-navigation/native';
import { useAuthStore } from '../store/authStore';
import { getTelegramInitData, isTelegramWebApp, getTelegramWebApp } from '../utils/telegram';
import { COLORS } from '../theme/colors';
import { Button } from './ui/Button';

/**
 * AuthGuard Component
 * 
 * Handles automatic Telegram authentication on app load:
 * 1. Checks if app is opened inside Telegram
 * 2. Automatically authenticates using initData
 * 3. Routes to onboarding (new users) or main app (existing users)
 * 4. Shows "Open in Telegram" message if not in Telegram
 */
export const AuthGuard: React.FC<{
    children: React.ReactNode;
    navigationRef?: React.RefObject<NavigationContainerRef<any>>;
}> = ({ children, navigationRef }) => {
    const {
        isAuthenticated,
        isLoading,
        user,
        login,
        loadTokens
    } = useAuthStore();

    const [isCheckingAuth, setIsCheckingAuth] = useState(true);
    const [authError, setAuthError] = useState<string | null>(null);

    useEffect(() => {
        initializeAuth();
    }, []);

    const initializeAuth = async () => {
        try {
            setIsCheckingAuth(true);
            setAuthError(null);

            // Step 1: Check if we have stored tokens first (fastest)
            const hasStoredTokens = await loadTokens();
            if (hasStoredTokens) {
                console.log('✅ User already authenticated via stored tokens');
                handlePostAuthRouting();
                setIsCheckingAuth(false);
                return;
            }

            // Step 2: No stored tokens - show Welcome Screen
            // We don't auto-login here anymore. We let the WelcomeScreen handle it
            // via the "Let's Get Started" button.
            console.log('ℹ️ No stored tokens - showing Welcome Screen');
            setIsCheckingAuth(false);

        } catch (error: any) {
            console.error('❌ Auth initialization error:', error);
            setAuthError(error?.response?.data?.error || error?.message || 'Authentication failed');
            setIsCheckingAuth(false);
        }
    };

    const handlePostAuthRouting = () => {
        const currentUser = useAuthStore.getState().user;

        if (!currentUser) {
            console.warn('⚠️ No user data available after auth');
            return;
        }

        // Wait a bit for navigation to be ready
        setTimeout(() => {
            if (!navigationRef?.current) {
                console.warn('⚠️ Navigation not ready yet');
                return;
            }

            // Check onboarding status from user object
            const onboardingCompleted = currentUser.onboarding_completed === true;

            if (onboardingCompleted) {
                // User has completed onboarding, go to main app
                navigationRef.current.reset({
                    index: 0,
                    routes: [{ name: 'Main' }],
                });
            } else {
                // User hasn't completed onboarding, go to onboarding navigator
                navigationRef.current.reset({
                    index: 0,
                    routes: [{ name: 'Onboarding' }],
                });
            }
        }, 100);
    };

    const handleRetry = () => {
        initializeAuth();
    };

    // Loading Screen (Splash)
    if (isCheckingAuth || isLoading) {
        return (
            <View style={styles.container}>
                <View style={styles.loadingContent}>
                    <ActivityIndicator size="large" color={COLORS.primary} />
                    <Text style={styles.loadingText}>Lomi Social</Text>
                    <Text style={styles.loadingSubtext}>Starting up...</Text>
                </View>
            </View>
        );
    }

    // Error Screen (if not in Telegram)
    if (authError && !isAuthenticated) {
        return (
            <View style={styles.container}>
                <View style={styles.errorContent}>
                    <Text style={styles.errorIcon}>⚠️</Text>
                    <Text style={styles.errorTitle}>Authentication Failed</Text>
                    <Text style={styles.errorMessage}>{authError}</Text>
                    <Button
                        title="Retry"
                        onPress={handleRetry}
                        style={styles.button}
                    />
                </View>
            </View>
        );
    }

    // Render children (this might be the WelcomeScreen, but we skip it if auth works)
    return <>{children}</>;
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: COLORS.background,
        justifyContent: 'center',
        alignItems: 'center',
    },
    loadingContent: {
        alignItems: 'center',
        justifyContent: 'center',
    },
    loadingText: {
        fontSize: 18,
        fontWeight: '600',
        color: COLORS.textPrimary,
        marginTop: 20,
    },
    loadingSubtext: {
        fontSize: 14,
        color: COLORS.textSecondary,
        marginTop: 8,
    },
    errorContent: {
        alignItems: 'center',
        justifyContent: 'center',
        padding: 40,
        maxWidth: 400,
    },
    errorIcon: {
        fontSize: 64,
        marginBottom: 20,
    },
    errorTitle: {
        fontSize: 24,
        fontWeight: 'bold',
        color: COLORS.textPrimary,
        textAlign: 'center',
        marginBottom: 12,
    },
    errorMessage: {
        fontSize: 16,
        color: COLORS.textSecondary,
        textAlign: 'center',
        marginBottom: 24,
        lineHeight: 22,
    },
    button: {
        minWidth: 200,
    },
});

