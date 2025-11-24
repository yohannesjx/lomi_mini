import React, { useEffect, useState } from 'react';
import { createStackNavigator } from '@react-navigation/stack';
import { useOnboardingStore } from '../store/onboardingStore';
import { useAuthStore } from '../store/authStore';
import { OnboardingProgressBar } from '../components/OnboardingProgressBar';
import { View, StyleSheet, Platform, ActivityIndicator } from 'react-native';
import { COLORS } from '../theme/colors';

// ToastAndroid is only available on Android
let ToastAndroid: any = null;
if (Platform.OS === 'android') {
    try {
        ToastAndroid = require('react-native').ToastAndroid;
    } catch (e) {
        // Not available
    }
}

// Onboarding Screens
import { ProfileSetupScreen } from '../screens/onboarding/ProfileSetupScreen';
import { GenderPreferenceScreen } from '../screens/onboarding/GenderPreferenceScreen';
import { PhotoUploadScreen } from '../screens/onboarding/PhotoUploadScreen';
import { InterestsScreen } from '../screens/onboarding/InterestsScreen';

// Additional screens we'll need to create
import { CityScreen } from '../screens/onboarding/CityScreen';
import { ReligionScreen } from '../screens/onboarding/ReligionScreen';
import { VideoScreen } from '../screens/onboarding/VideoScreen';
import { BioScreen } from '../screens/onboarding/BioScreen';
import { OnboardingCompleteScreen } from '../screens/onboarding/OnboardingCompleteScreen';
import { PhotoModerationStatusScreen } from '../screens/moderation/PhotoModerationStatusScreen';

const Stack = createStackNavigator();

// Total number of onboarding steps (including completion screen)
export const TOTAL_ONBOARDING_STEPS = 8;

// Step mapping: onboarding_step -> screen name
const STEP_TO_SCREEN: Record<number, string> = {
    0: 'ProfileSetup',      // Age & Gender - Step 1
    1: 'City',              // City - Step 2
    2: 'GenderPreference',  // Looking for + Goal - Step 3
    3: 'Religion',          // Religion - Step 4
    4: 'PhotoUpload',       // Photos (at least 3) - Step 5
    5: 'Video',             // Video (optional) - Step 6
    6: 'Bio',               // Bio & Interests - Step 7
    7: 'OnboardingComplete', // Completion screen - Step 8
};

// Screen order for navigation
const SCREEN_ORDER = [
    'ProfileSetup',
    'City',
    'GenderPreference',
    'Religion',
    'PhotoUpload',
    'Video',
    'Bio',
    'OnboardingComplete',
];

export const OnboardingNavigator: React.FC<{ navigation: any }> = ({ navigation }) => {
    const { onboardingStep, onboardingCompleted, fetchStatus, isLoading } = useOnboardingStore();
    const { isAuthenticated, user } = useAuthStore();
    const [initialRoute, setInitialRoute] = useState<string | null>(null);
    const [hasShownWelcomeBack, setHasShownWelcomeBack] = useState(false);

    useEffect(() => {
        // Fetch onboarding status when component mounts
        if (isAuthenticated) {
            fetchStatus();
        }
    }, [isAuthenticated, fetchStatus]);

    useEffect(() => {
        // Determine initial route based on onboarding step
        if (!isLoading && onboardingStep !== undefined) {
            const targetScreen = STEP_TO_SCREEN[onboardingStep] || 'ProfileSetup';
            setInitialRoute(targetScreen);

            // Show welcome back toast if resuming (step > 0)
            if (onboardingStep > 0 && !onboardingCompleted && !hasShownWelcomeBack) {
                setHasShownWelcomeBack(true);
                const message = 'Welcome back! Continuing where you left off...';
                if (Platform.OS === 'android' && ToastAndroid) {
                    ToastAndroid.show(message, ToastAndroid.SHORT);
                } else {
                    // For iOS/web, use console or alert
                    console.log('👋', message);
                }
            }
        }
    }, [onboardingStep, onboardingCompleted, isLoading, hasShownWelcomeBack]);

    // If onboarding is completed, navigate to Main
    useEffect(() => {
        if (onboardingCompleted && navigation) {
            navigation.reset({
                index: 0,
                routes: [{ name: 'Main' }],
            });
        }
    }, [onboardingCompleted, navigation]);

    // Don't render until we know the initial route
    if (!initialRoute || isLoading) {
        return (
            <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={COLORS.primary} />
            </View>
        );
    }

    const currentStep = user?.onboarding_step ?? onboardingStep ?? 0;

    return (
        <View style={styles.container}>
            <OnboardingProgressBar currentStep={currentStep} />
            <Stack.Navigator
                initialRouteName={initialRoute}
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
                            },
                        };
                    },
                }}
            >
                <Stack.Screen name="ProfileSetup" component={ProfileSetupScreen} />
                <Stack.Screen name="City" component={CityScreen} />
                <Stack.Screen name="GenderPreference" component={GenderPreferenceScreen} />
                <Stack.Screen name="Religion" component={ReligionScreen} />
                <Stack.Screen name="PhotoUpload" component={PhotoUploadScreen} />
                <Stack.Screen name="PhotoStatus" component={PhotoModerationStatusScreen} />
                <Stack.Screen name="Video" component={VideoScreen} />
                <Stack.Screen name="Bio" component={BioScreen} />
                <Stack.Screen name="OnboardingComplete" component={OnboardingCompleteScreen} />
            </Stack.Navigator>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: COLORS.background,
    },
});

