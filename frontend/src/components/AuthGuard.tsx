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
    const [isInTelegram, setIsInTelegram] = useState<boolean | null>(null);

    useEffect(() => {
        initializeAuth();
    }, []);

    const initializeAuth = async () => {
        try {
            setIsCheckingAuth(true);
            setAuthError(null);

            // Step 1: Check if we're in Telegram
            const inTelegram = isTelegramWebApp();
            setIsInTelegram(inTelegram);

            // Step 1.5: Check if we're handling a Telegram Widget OAuth callback
            if (Platform.OS === 'web' && typeof window !== 'undefined') {
                // Check for tokens in hash (redirect from backend after widget auth)
                const hash = window.location.hash;
                if (hash.includes('access_token=')) {
                    console.log('🔐 Detected widget redirect with tokens');
                    // Handle widget callback - will be handled by WelcomeScreen
                    setIsCheckingAuth(false);
                    return;
                }

                // Check for widget auth data in query params
                const urlParams = new URLSearchParams(window.location.search);
                if (urlParams.has('id') && urlParams.has('hash') && urlParams.has('auth_date')) {
                    console.log('🔐 Detected Telegram Widget OAuth callback');
                    // Handle widget callback - will be handled by WelcomeScreen
                    setIsCheckingAuth(false);
                    return;
                }
            }

            // Step 2: Load existing tokens (if any) - don't auto-authenticate
            await loadTokens();

            // Step 3: If already authenticated, check if onboarding is needed
            const currentAuthState = useAuthStore.getState();
            if (currentAuthState.isAuthenticated && currentAuthState.user) {
                console.log('✅ User already authenticated');
                handlePostAuthRouting();
                setIsCheckingAuth(false);
                return;
            }

            // Don't auto-authenticate - let user click the button
            // This allows the landing page to show first
            console.log('ℹ️ Landing page mode - waiting for user to click login button');
            setIsCheckingAuth(false);
        } catch (error: any) {
            console.error('❌ Auth initialization error:', error);
            setAuthError(error?.response?.data?.error || error?.message || 'Authentication failed');
            setIsCheckingAuth(false);
        }
    };

    const waitForInitData = async (maxRetries = 10, delay = 500): Promise<string | null> => {
        for (let i = 0; i < maxRetries; i++) {
            const initData = getTelegramInitData();
            if (initData && initData.length > 0) {
                console.log(`✅ Found initData (attempt ${i + 1}/${maxRetries})`);
                return initData;
            }
            
            if (i < maxRetries - 1) {
                console.log(`⏳ Waiting for initData... (${i + 1}/${maxRetries})`);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
        
        console.warn('⚠️ initData not found after retries');
        return null;
    };

    const handlePostAuthRouting = () => {
        const currentUser = useAuthStore.getState().user;
        
        if (!currentUser) {
            console.warn('⚠️ No user data available');
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
            const onboardingStep = currentUser.onboarding_step || 0;

            console.log('📊 User onboarding status:', {
                onboarding_step: onboardingStep,
                onboarding_completed: onboardingCompleted,
                has_profile: currentUser.has_profile,
            });

            if (onboardingCompleted) {
                // User has completed onboarding, go to main app
                console.log('✅ User has completed onboarding, navigating to Main');
                navigationRef.current.reset({
                    index: 0,
                    routes: [{ name: 'Main' }],
                });
            } else {
                // User hasn't completed onboarding, go to onboarding navigator
                // The OnboardingNavigator will determine which step to show
                console.log(`🆕 User onboarding in progress (step ${onboardingStep}), navigating to Onboarding`);
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

    const handleOpenInTelegram = () => {
        // Get bot username from environment or config
        const botUsername = 'lomi_social_bot'; // TODO: Move to config
        const appName = 'lomi'; // TODO: Move to config
        const telegramUrl = `https://t.me/${botUsername}/${appName}`;
        
        if (Platform.OS === 'web') {
            window.open(telegramUrl, '_blank');
        } else {
            // For mobile, you might want to use Linking
            console.log('Open in Telegram:', telegramUrl);
        }
    };

    // Show loading screen only if we're checking existing auth (not blocking)
    // Only show if we're actually loading tokens, not if we're just waiting for user action
    if (isCheckingAuth && isLoading) {
        return (
            <View style={styles.container}>
                <View style={styles.loadingContent}>
                    <ActivityIndicator size="large" color={COLORS.primary} />
                    <Text style={styles.loadingText}>Loading...</Text>
                    <Text style={styles.loadingSubtext}>Please wait</Text>
                </View>
            </View>
        );
    }

    // Don't block - always show children (landing page)
    // WelcomeScreen will handle authentication when button is clicked

    // Show error if authentication failed
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

    // User is authenticated, render children
    // Also render children if we're still checking but want to show the app
    if (isAuthenticated || (isInTelegram === null && !authError)) {
        return <>{children}</>;
    }

    // Fallback: render children anyway to prevent blank screen
    // The WelcomeScreen will handle showing the login UI
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

