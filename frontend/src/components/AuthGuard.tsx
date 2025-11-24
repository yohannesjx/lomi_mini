import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { useAuthStore } from '../store/authStore';
import { getTelegramInitData, isTelegramWebApp } from '../utils/telegram';
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
}> = ({ children }) => {
    const { isAuthenticated, isLoading, login, loadTokens } = useAuthStore();

    const [isCheckingAuth, setIsCheckingAuth] = useState(true);
    const [authError, setAuthError] = useState<string | null>(null);
    const [isTelegramEnv, setIsTelegramEnv] = useState<boolean>(isTelegramWebApp());

    useEffect(() => {
        setIsTelegramEnv(isTelegramWebApp());
    }, []);

    useEffect(() => {
        initializeAuth();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isTelegramEnv]);

    const initializeAuth = async () => {
        try {
            setIsCheckingAuth(true);
            setAuthError(null);

            // Step 1: Check if we have stored tokens first (fastest)
            const hasStoredTokens = await loadTokens();
            if (hasStoredTokens) {
                console.log('✅ User already authenticated via stored tokens');
                setIsCheckingAuth(false);
                return;
            }

            // Step 2: Auto-authenticate using Telegram Mini App initData
            // Telegram automatically injects initDataUnsafe.user when Mini App opens
            if (isTelegramEnv) {
                const initData = getTelegramInitData();
                if (initData) {
                    console.log('🔐 Auto-authenticating with Telegram initData...');
                    try {
                        await login(initData);
                        console.log('✅ Auto-authentication successful');
                        setIsCheckingAuth(false);
                        return;
                    } catch (loginError: any) {
                        console.error('❌ Auto-authentication failed:', loginError);
                        setAuthError(loginError?.response?.data?.error || loginError?.message || 'Authentication failed');
                        setIsCheckingAuth(false);
                        return;
                    }
                } else {
                    console.warn('⚠️ In Telegram but no initData available');
                    setAuthError('Telegram authentication data not available. Please restart the app.');
                    setIsCheckingAuth(false);
                    return;
                }
            }

            // Step 3: Not in Telegram - allow UI to handle web login
            console.log('🌐 Running outside Telegram - awaiting manual login');
            setIsCheckingAuth(false);

        } catch (error: any) {
            console.error('❌ Auth initialization error:', error);
            setAuthError(error?.response?.data?.error || error?.message || 'Authentication failed');
            setIsCheckingAuth(false);
        }
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
    if (authError && isTelegramEnv && !isAuthenticated) {
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

