import React, { useEffect } from 'react';
import { View, Text, StyleSheet, Image, Dimensions, Platform, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Button } from '../../components/ui/Button';
import { COLORS, SPACING } from '../../theme/colors';
import { getTelegramInitData, initializeTelegramWebApp, getTelegramWebApp } from '../../utils/telegram';
import { useAuthStore } from '../../store/authStore';

const { width, height } = Dimensions.get('window');

export const WelcomeScreen = ({ navigation }: any) => {
    const { login, isLoading } = useAuthStore();

    useEffect(() => {
        // Initialize Telegram WebApp
        if (Platform.OS === 'web') {
            initializeTelegramWebApp();
        }
        
        // Check if already authenticated
        const { isAuthenticated, user, loadTokens } = useAuthStore.getState();
        loadTokens().then(() => {
            const state = useAuthStore.getState();
            if (state.isAuthenticated && state.user) {
                if (state.user.has_profile) {
                    navigation.navigate('Main');
                } else {
                    navigation.navigate('ProfileSetup');
                }
            }
        });
    }, []);

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
            
            if (!inTelegram) {
                const errorMsg = `❌ App is not opened from Telegram!\n\n` +
                    `Current: Opened in ${debugInfo.userAgent.includes('Safari') ? 'Safari browser' : 'regular browser'}\n\n` +
                    `To fix:\n` +
                    `1. Open Telegram app\n` +
                    `2. Find your bot\n` +
                    `3. Click menu button (☰)\n` +
                    `4. Select Mini App from menu\n\n` +
                    `Do NOT open the URL directly in a browser!`;
                
                console.error(errorMsg);
                alert(errorMsg);
                return;
            }
            
            // Try to get initData with multiple retries
            let initData = getTelegramInitData();
            let retries = 3;
            
            while (!initData && retries > 0 && webApp) {
                console.log(`⏳ Waiting for Telegram initData... (${retries} retries left)`);
                await new Promise(resolve => setTimeout(resolve, 1000));
                initData = getTelegramInitData();
                retries--;
                
                // Update debug info
                const updatedDebug = getTelegramDebugInfo();
                console.log('🔄 Retry debug info:', updatedDebug);
            }
            
            if (!initData) {
                // We're in Telegram but initData is still missing
                const errorMsg = `❌ Telegram authentication data is missing!\n\n` +
                    `Debug Info:\n` +
                    `- WebApp exists: ${debugInfo.webAppExists}\n` +
                    `- Platform: ${debugInfo.platform}\n` +
                    `- Version: ${debugInfo.version}\n` +
                    `- Has initData: ${debugInfo.hasInitData}\n` +
                    `- User Agent: ${debugInfo.userAgent.substring(0, 50)}...\n\n` +
                    `Possible causes:\n` +
                    `1. Mini App URL in BotFather is incorrect\n` +
                    `2. App opened in external browser (not Telegram's in-app browser)\n` +
                    `3. Telegram version too old\n` +
                    `4. Bot not properly configured\n\n` +
                    `Solutions:\n` +
                    `1. Check BotFather: /myapps → Verify Web App URL is: https://lomi.social/ (trailing slash is OK)\n` +
                    `2. Make sure you open from Telegram bot menu (not browser)\n` +
                    `3. Update Telegram app\n` +
                    `4. Try closing and reopening the Mini App`;
                
                console.error('❌', errorMsg);
                console.error('Full debug info:', JSON.stringify(debugInfo, null, 2));
                alert(errorMsg);
                return;
            }
            
            console.log('✅ InitData found, attempting login...');
            await login(initData);
            
            // Check if user has completed profile
            const user = useAuthStore.getState().user;
            if (user?.has_profile) {
                navigation.navigate('Main');
            } else {
                navigation.navigate('ProfileSetup');
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

                    <Button
                        title="Continue with Telegram"
                        onPress={handleLogin}
                        style={styles.button}
                        size="large"
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
});
