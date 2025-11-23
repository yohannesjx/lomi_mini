import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Image, Dimensions, Platform, Alert, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Button } from '../../components/ui/Button';
import { COLORS, SPACING } from '../../theme/colors';
import { getTelegramInitData, initializeTelegramWebApp, getTelegramWebApp, getTelegramDebugInfo, isTelegramWebApp } from '../../utils/telegram';
import { useAuthStore } from '../../store/authStore';

const { width, height } = Dimensions.get('window');

export const WelcomeScreen = ({ navigation }: any) => {
    const { login, loginWithWidget, isLoading } = useAuthStore();
    const [isInTelegram, setIsInTelegram] = useState<boolean | null>(null);
    const [isWebBrowser, setIsWebBrowser] = useState(false);

    useEffect(() => {
        // Handle Telegram Widget OAuth callback (for web browsers)
        if (Platform.OS === 'web' && typeof window !== 'undefined') {
            // Check for tokens in hash (redirect from backend)
            const hash = window.location.hash;
            if (hash.includes('access_token=')) {
                console.log('🔐 Handling widget redirect with tokens');
                handleWidgetCallback(new URLSearchParams());
                return;
            }

            // Check for widget auth data in query params
            const urlParams = new URLSearchParams(window.location.search);
            if (urlParams.has('id') && urlParams.has('hash') && urlParams.has('auth_date')) {
                console.log('🔐 Handling Telegram Widget OAuth callback');
                handleWidgetCallback(urlParams);
                return;
            }

            // Load Telegram Widget script for web browsers
            if (isWebBrowser) {
                const script = document.createElement('script');
                script.src = 'https://telegram.org/js/telegram-widget.js?22';
                script.async = true;
                script.setAttribute('data-telegram-login', 'lomi_social_bot');
                script.setAttribute('data-size', 'large');
                script.setAttribute('data-auth-url', `${window.location.origin}/api/v1/auth/telegram/widget`);
                script.setAttribute('data-request-access', 'write');
                script.setAttribute('data-userpic', 'true');
                script.setAttribute('data-radius', '12');
                
                const widgetContainer = document.getElementById('telegram-login-widget');
                if (widgetContainer) {
                    widgetContainer.innerHTML = '';
                    widgetContainer.appendChild(script);
                }

                return () => {
                    if (widgetContainer) {
                        widgetContainer.innerHTML = '';
                    }
                };
            }
        }
        // Early detection: Check if we're in Telegram BEFORE doing anything else
        if (Platform.OS === 'web') {
            const debugInfo = getTelegramDebugInfo();
            const inTelegram = isTelegramWebApp();
            
            // Check if platform is unknown (indicates Safari/external browser)
            const isActuallyInTelegram = (
                debugInfo.platform !== 'unknown' && 
                (debugInfo.platform === 'ios' || 
                 debugInfo.platform === 'android' || 
                 debugInfo.platform === 'tdesktop' ||
                 debugInfo.platform === 'web' ||
                 debugInfo.platform === 'macos')
            ) || (
                // Even if platform is unknown, check other indicators
                debugInfo.webAppExists && 
                (debugInfo.url.includes('tgWebApp') || 
                 debugInfo.search.includes('tgWebApp') ||
                 debugInfo.hash.includes('tgWebApp') ||
                 debugInfo.userAgent.includes('Telegram'))
            );
            
            setIsInTelegram(isActuallyInTelegram);
            setIsWebBrowser(!isActuallyInTelegram); // Show widget button for web browsers
            
            if (!isActuallyInTelegram) {
                console.log('🌐 App opened in web browser - will show Telegram Login Widget');
                // Don't initialize Telegram WebApp if not in Telegram
                // But continue to load widget script below
            }
            
            // Only initialize if we're actually in Telegram
            initializeTelegramWebApp({ enableFullscreen: false });
        }
        
        // Setup Telegram MainButton for native login (only if in Telegram)
        const webApp = getTelegramWebApp();
        if (webApp && Platform.OS === 'web' && isInTelegram) {
            // Use Telegram's native MainButton
            webApp.MainButton.setText('Continue with Telegram');
            webApp.MainButton.show();
            webApp.MainButton.onClick(handleLogin);
            
            // Cleanup on unmount
            return () => {
                webApp.MainButton.offClick(handleLogin);
                webApp.MainButton.hide();
            };
        }
        
        // Check if already authenticated
        const { isAuthenticated, user, loadTokens } = useAuthStore.getState();
        loadTokens().then(() => {
            const state = useAuthStore.getState();
            if (state.isAuthenticated && state.user) {
                if (state.user.onboarding_completed) {
                    navigation.navigate('Main');
                } else {
                    navigation.navigate('Onboarding');
                }
            }
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isInTelegram]); // Include isInTelegram in deps

    const handleWidgetCallback = async (urlParams: URLSearchParams) => {
        try {
            // Check if this is a redirect from backend with tokens in hash
            if (typeof window !== 'undefined') {
                const hash = window.location.hash;
                if (hash.includes('access_token=')) {
                    // Extract tokens from hash
                    const hashParams = new URLSearchParams(hash.substring(1));
                    const accessToken = hashParams.get('access_token');
                    const refreshToken = hashParams.get('refresh_token');
                    const userId = hashParams.get('user_id');

                    if (accessToken && refreshToken) {
                        console.log('🔐 Found tokens in URL hash from widget redirect');
                        
                        // Store tokens
                        await useAuthStore.getState().setTokens({
                            accessToken,
                            refreshToken,
                        });

                        // Fetch user data
                        const { api } = require('../../api/client');
                        const userResponse = await api.get('/users/me');
                        const user = userResponse.data;

                        // Store user
                        const { storage } = require('../../utils/storage');
                        await storage.setItem('lomi_user', JSON.stringify(user));

                        // Update store
                        useAuthStore.setState({
                            accessToken,
                            refreshToken,
                            user,
                            isAuthenticated: true,
                            isLoading: false,
                        });

                        // Clear URL hash
                        window.history.replaceState({}, document.title, window.location.pathname);

                        // Navigate based on onboarding status
                        if (user?.onboarding_completed) {
                            navigation.navigate('Main');
                        } else {
                            navigation.navigate('Onboarding');
                        }
                        return;
                    }
                }
            }

            // Otherwise, this is the initial widget callback with auth data
            const authData = {
                id: urlParams.get('id') || '',
                first_name: urlParams.get('first_name') || '',
                last_name: urlParams.get('last_name') || undefined,
                username: urlParams.get('username') || undefined,
                photo_url: urlParams.get('photo_url') || undefined,
                auth_date: urlParams.get('auth_date') || '',
                hash: urlParams.get('hash') || '',
            };

            if (!authData.id || !authData.hash || !authData.auth_date) {
                throw new Error('Missing required authentication data');
            }

            console.log('🔐 Processing Telegram Widget authentication...');
            await loginWithWidget(authData);

            // Clear URL params
            if (typeof window !== 'undefined') {
                window.history.replaceState({}, document.title, window.location.pathname);
            }

            // Navigate based on user profile
            const user = useAuthStore.getState().user;
            if (user?.has_profile) {
                navigation.navigate('Main');
            } else {
                navigation.navigate('ProfileSetup');
            }
        } catch (error: any) {
            console.error('❌ Widget login error:', error);
            Alert.alert(
                'Login Failed',
                error?.response?.data?.error || error?.message || 'Failed to authenticate with Telegram'
            );
        }
    };

    const handleLogin = async () => {
        try {
            // Import debug function
            const { getTelegramDebugInfo, isTelegramWebApp } = require('../../utils/telegram');
            
            // Wait a bit for Telegram WebApp to fully initialize
            const webApp = getTelegramWebApp();
            
            // Get comprehensive debug info
            const debugInfo = getTelegramDebugInfo();
            console.log('🔍 Telegram WebApp Debug Info:', debugInfo);
            
            // Check if we're actually in Telegram
            const inTelegram = isTelegramWebApp();
            console.log('📍 In Telegram WebApp:', inTelegram);
            
            // Check if we're in Telegram browser
            // Note: platform can be 'unknown' in some cases even when in Telegram
            // So we check multiple indicators
            const isInTelegramBrowser = (
                debugInfo.platform !== 'unknown' && 
                (debugInfo.platform === 'ios' || 
                 debugInfo.platform === 'android' || 
                 debugInfo.platform === 'tdesktop' ||
                 debugInfo.platform === 'web' ||
                 debugInfo.platform === 'macos')
            ) || (
                // Even if platform is unknown, check other indicators
                debugInfo.webAppExists && 
                (debugInfo.url.includes('tgWebApp') || 
                 debugInfo.search.includes('tgWebApp') ||
                 debugInfo.hash.includes('tgWebApp') ||
                 debugInfo.userAgent.includes('Telegram'))
            );
            
            console.log('🔍 Platform check:', {
                platform: debugInfo.platform,
                isInTelegramBrowser,
                userAgent: debugInfo.userAgent.substring(0, 100),
                url: debugInfo.url,
                hasTgWebAppInUrl: debugInfo.url.includes('tgWebApp'),
            });
            
            // Only show error if we're definitely NOT in Telegram
            // If platform is unknown but WebApp exists, we might still be in Telegram
            if (!isInTelegramBrowser && debugInfo.platform === 'unknown' && !debugInfo.webAppExists) {
                const errorMsg = `❌ App is NOT opened from Telegram's in-app browser!\n\n` +
                    `Current Status:\n` +
                    `- Platform: ${debugInfo.platform}\n` +
                    `- Browser: ${debugInfo.userAgent.includes('Safari') && !debugInfo.userAgent.includes('Telegram') ? 'Safari (WRONG!)' : 'Unknown'}\n` +
                    `- WebApp exists: ${debugInfo.webAppExists}\n\n` +
                    `✅ CORRECT Way to Open:\n` +
                    `1. Open TELEGRAM APP (not Safari)\n` +
                    `2. Search for your bot\n` +
                    `3. Open the bot\n` +
                    `4. Tap menu button (☰) at bottom\n` +
                    `5. Tap Mini App from menu\n\n` +
                    `The app MUST be opened from Telegram's in-app browser!`;
                
                console.error('❌', errorMsg);
                alert(errorMsg);
                return;
            }
            
            // Try to get initData with multiple retries and longer wait times
            let initData = getTelegramInitData();
            let retries = 5; // More retries
            let waitTime = 500; // Start with 500ms
            
            while (!initData && retries > 0 && webApp) {
                console.log(`⏳ Waiting for Telegram initData... (${retries} retries left, waiting ${waitTime}ms)`);
                await new Promise(resolve => setTimeout(resolve, waitTime));
                
                // Try to access initData directly from window (Telegram might inject it asynchronously)
                if (typeof window !== 'undefined' && (window as any).Telegram?.WebApp) {
                    const tgWebApp = (window as any).Telegram.WebApp;
                    console.log('🔍 Checking window.Telegram.WebApp.initData:', {
                        exists: !!tgWebApp.initData,
                        length: tgWebApp.initData?.length || 0,
                        value: tgWebApp.initData?.substring(0, 50) || 'empty',
                    });
                }
                
                initData = getTelegramInitData();
                retries--;
                waitTime += 500; // Increase wait time with each retry
                
                // Update debug info
                const updatedDebug = getTelegramDebugInfo();
                console.log('🔄 Retry debug info:', updatedDebug);
            }
            
            // Final check: Try to manually construct initData from initDataUnsafe if available
            if (!initData && webApp?.initDataUnsafe) {
                console.log('🔧 Attempting to construct initData from initDataUnsafe...');
                const unsafe = webApp.initDataUnsafe;
                
                // Telegram WebApp 6.0+ might not provide initData string, but we can try to work with initDataUnsafe
                // However, for authentication, we NEED the actual initData string with hash
                console.warn('⚠️ initDataUnsafe available but initData string is missing');
                console.warn('⚠️ Authentication requires the initData string with hash - cannot proceed without it');
            }
            
            if (!initData) {
                // We're in Telegram but initData is still missing
                const errorMsg = `❌ Telegram authentication data is missing!\n\n` +
                    `Debug Info:\n` +
                    `- WebApp exists: ${debugInfo.webAppExists}\n` +
                    `- Platform: ${debugInfo.platform}\n` +
                    `- Version: ${debugInfo.version}\n` +
                    `- Has initData: ${debugInfo.hasInitData}\n` +
                    `- User Agent: ${debugInfo.userAgent.substring(0, 50)}...\n` +
                    `- Is in Telegram Browser: ${isInTelegramBrowser}\n\n` +
                    `Possible causes:\n` +
                    `1. App opened in Safari/external browser (NOT Telegram's in-app browser)\n` +
                    `2. Mini App URL in BotFather is incorrect\n` +
                    `3. Telegram version too old\n` +
                    `4. Bot not properly configured\n\n` +
                    `✅ SOLUTIONS:\n` +
                    `1. Open TELEGRAM APP (not Safari)\n` +
                    `2. Find your bot in Telegram\n` +
                    `3. Tap the bot menu (☰) at bottom\n` +
                    `4. Tap "Mini App" from the menu\n` +
                    `5. Check BotFather: /myapps → Verify URL is: https://lomi.social/\n\n` +
                    `The app MUST be opened from Telegram's in-app browser!`;
                
                console.error('❌', errorMsg);
                console.error('Full debug info:', JSON.stringify(debugInfo, null, 2));
                alert(errorMsg);
                
                // Hide MainButton to prevent retry
                const webApp = getTelegramWebApp();
                if (webApp?.MainButton.isVisible) {
                    webApp.MainButton.hide();
                }
                
                return; // CRITICAL: Return early to prevent API call
            }
            
            console.log('✅ InitData found, attempting login...');
            console.log('📤 Sending login request with initData length:', initData.length);
            
            try {
                await login(initData);
                
                // Check if user has completed profile
                const user = useAuthStore.getState().user;
                if (user?.has_profile) {
                    navigation.navigate('Main');
                } else {
                    navigation.navigate('ProfileSetup');
                }
            } catch (loginError: any) {
                console.error('❌ Login API error:', loginError);
                console.error('Error details:', {
                    message: loginError?.message,
                    response: loginError?.response?.data,
                    status: loginError?.response?.status,
                    statusText: loginError?.response?.statusText,
                });
                
                // Show detailed error
                const errorMsg = loginError?.response?.data?.error || 
                                loginError?.response?.data?.message ||
                                loginError?.message || 
                                'Login failed. Please try again.';
                
                const fullErrorMsg = `❌ Login Failed\n\n` +
                    `Error: ${errorMsg}\n\n` +
                    `Status: ${loginError?.response?.status || 'Unknown'}\n\n` +
                    `If this persists:\n` +
                    `1. Check your internet connection\n` +
                    `2. Verify backend is running\n` +
                    `3. Try again in a moment`;
                
                alert(fullErrorMsg);
                throw loginError; // Re-throw to be caught by outer catch
            }
        } catch (error: any) {
            console.error('Login error:', error);
            
            // Show error message (use alert for maximum compatibility)
            const webApp = getTelegramWebApp();
            const errorMsg = error?.message || 'Login failed. Please try again.';
            
            // Use alert for now - showConfirm/showAlert have compatibility issues in some versions
            alert(errorMsg);
            
            // Optional: Try to use Telegram's native alert if available and working
            // if (webApp && typeof webApp.showAlert === 'function') {
            //     try {
            //         webApp.showAlert(errorMsg);
            //     } catch (e) {
            //         alert(errorMsg);
            //     }
            // } else {
            //     alert(errorMsg);
            // }
        }
    };

    // Don't show error screen for web browsers - show welcome screen with widget button instead
    // The widget button will be shown in the main render below

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
                    <Text style={styles.tagline}>
                        Find your <Text style={styles.highlight}>Lomi</Text> in Ethiopia
                    </Text>
                    <Text style={styles.description}>
                        The most beautiful way to meet Habesha singles.
                        Serious dating, culture, and fun.
                    </Text>

                    {/* Show Telegram Login Widget for web browsers */}
                    {Platform.OS === 'web' && isWebBrowser && (
                        <View style={styles.widgetContainer}>
                            <div id="telegram-login-widget" style={{ minHeight: 50 }} />
                        </View>
                    )}

                    {/* Show custom button for Telegram Mini App or mobile */}
                    {(Platform.OS !== 'web' || !isWebBrowser) && (
                        Platform.OS !== 'web' || !getTelegramWebApp() ? (
                            <Button
                                title="Continue with Telegram"
                                onPress={handleLogin}
                                style={styles.button}
                                size="large"
                            />
                        ) : (
                            <View style={styles.buttonPlaceholder}>
                                <Text style={styles.buttonPlaceholderText}>
                                    Use the button at the bottom
                                </Text>
                            </View>
                        )
                    )}

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
});
