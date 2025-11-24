import React, { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { Platform } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { COLORS } from './src/theme/colors';

import { OnboardingNavigator } from './src/navigation/OnboardingNavigator';
import { AuthGuard } from './src/components/AuthGuard';

import { MainTabNavigator } from './src/navigation/MainTabNavigator';
import { ChatDetailScreen } from './src/screens/chat/ChatDetailScreen';
import { BuyCoinsScreen } from './src/screens/coins/BuyCoinsScreen';
import { CashoutScreen } from './src/screens/payout/CashoutScreen';
import { TelebirrPayoutScreen } from './src/screens/payout/TelebirrPayoutScreen';
import { PayoutThankYouScreen } from './src/screens/payout/PayoutThankYouScreen';
import { LeaderboardScreen } from './src/screens/payout/LeaderboardScreen';
import { AddVibeScreen } from './src/screens/explore/AddVibeScreen';
import { ExploreDetailScreen } from './src/screens/explore/ExploreDetailScreen';
import { LandingPage } from './src/screens/LandingPage';

const Stack = createStackNavigator();

export default function App() {
    useEffect(() => {
        // Inject Telegram WebApp script for Web platform
        if (Platform.OS === 'web' && typeof document !== 'undefined') {
            // Check if script already exists
            if (!document.querySelector('script[src="https://telegram.org/js/telegram-web-app.js"]')) {
                const script = document.createElement('script');
                script.src = 'https://telegram.org/js/telegram-web-app.js';
                script.async = true;
                script.onload = () => {
                    // Initialize after script loads
                    if (window.Telegram?.WebApp) {
                        window.Telegram.WebApp.ready();
                        window.Telegram.WebApp.expand();

                        // Request fullscreen mode for immersive experience
                        try {
                            if (window.Telegram.WebApp.requestFullscreen) {
                                window.Telegram.WebApp.requestFullscreen();
                                console.log('✅ Fullscreen mode requested');
                            }
                        } catch (error) {
                            console.warn('⚠️ Fullscreen not supported:', error);
                        }

                        // Hide MainButton by default (WelcomeScreen will show it if needed)
                        if (window.Telegram.WebApp.MainButton) {
                            window.Telegram.WebApp.MainButton.hide();
                        }

                        console.log('✅ Telegram WebApp initialized');
                    }
                };
                script.onerror = () => {
                    console.warn('⚠️ Failed to load Telegram WebApp script');
                };
                document.body.appendChild(script);
            } else {
                // Script already loaded, initialize immediately
                if (window.Telegram?.WebApp) {
                    window.Telegram.WebApp.ready();
                    window.Telegram.WebApp.expand();

                    // Request fullscreen mode for immersive experience
                    try {
                        if (window.Telegram.WebApp.requestFullscreen) {
                            window.Telegram.WebApp.requestFullscreen();
                            console.log('✅ Fullscreen mode requested');
                        }
                    } catch (error) {
                        console.warn('⚠️ Fullscreen not supported:', error);
                    }

                    // Hide MainButton by default (WelcomeScreen will show it if needed)
                    if (window.Telegram.WebApp.MainButton) {
                        window.Telegram.WebApp.MainButton.hide();
                    }

                    console.log('✅ Telegram WebApp initialized (script already loaded)');
                }
            }
        }

    }, []);

    return (
        <GestureHandlerRootView style={{ flex: 1 }}>
            <SafeAreaProvider>
                <AuthGuard>
                    <NavigationContainer
                        theme={{
                        dark: true,
                        colors: {
                            primary: COLORS.primary,
                            background: COLORS.background,
                            card: COLORS.surface,
                            text: COLORS.textPrimary,
                            border: COLORS.surfaceHighlight,
                            notification: COLORS.accent,
                        }
                    }}>
                        <StatusBar style="light" />
                        <Stack.Navigator
                            initialRouteName="Landing"
                            screenOptions={{
                                headerShown: false,
                                cardStyleInterpolator: ({ current, next, layouts }) => {
                                    return {
                                        cardStyle: {
                                            transform: [
                                                {
                                                    translateX: current.progress.interpolate({
                                                        inputRange: [0, 1],
                                                        outputRange: [layouts.screen.width, 0],
                                                    }),
                                                },
                                            ],
                                            opacity: current.progress.interpolate({
                                                inputRange: [0, 0.5, 0.9, 1],
                                                outputRange: [0, 0.25, 0.7, 1],
                                            }),
                                        },
                                    };
                                },
                                transitionSpec: {
                                    open: {
                                        animation: 'spring',
                                        config: {
                                            stiffness: 1000,
                                            damping: 500,
                                            mass: 3,
                                            overshootClamping: true,
                                            restDisplacementThreshold: 0.01,
                                            restSpeedThreshold: 0.01,
                                        },
                                    },
                                    close: {
                                        animation: 'spring',
                                        config: {
                                            stiffness: 1000,
                                            damping: 500,
                                            mass: 3,
                                            overshootClamping: true,
                                            restDisplacementThreshold: 0.01,
                                            restSpeedThreshold: 0.01,
                                        },
                                    },
                                },
                            }}
                        >
                            <Stack.Screen name="Landing" component={LandingPage} />
                            <Stack.Screen name="Onboarding" component={OnboardingNavigator} />
                            <Stack.Screen name="Main" component={MainTabNavigator} />
                            <Stack.Screen name="ChatDetail" component={ChatDetailScreen} />
                            <Stack.Screen name="BuyCoins" component={BuyCoinsScreen} />
                            <Stack.Screen name="Cashout" component={CashoutScreen} />
                            <Stack.Screen name="TelebirrPayout" component={TelebirrPayoutScreen} />
                            <Stack.Screen name="PayoutThankYou" component={PayoutThankYouScreen} />
                            <Stack.Screen name="Leaderboard" component={LeaderboardScreen} />
                            <Stack.Screen name="AddVibe" component={AddVibeScreen} />
                            <Stack.Screen name="ExploreDetail" component={ExploreDetailScreen} />
                        </Stack.Navigator>
                    </NavigationContainer>
                </AuthGuard>
            </SafeAreaProvider>
        </GestureHandlerRootView>
    );
}
