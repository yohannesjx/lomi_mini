import React, { useEffect, useState } from 'react';
import { createStackNavigator } from '@react-navigation/stack';
import { useOnboardingStore } from '../store/onboardingStore';
import { useAuthStore } from '../store/authStore';
import { OnboardingProgressBar } from '../components/OnboardingProgressBar';
import { View, StyleSheet, ToastAndroid, Platform } from 'react-native';

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

const Stack = createStackNavigator();

// Step mapping: onboarding_step -> screen name
const STEP_TO_SCREEN: Record<number, string> = {
    0: 'ProfileSetup',      // Age & Gender
    1: 'City',              // City
    2: 'GenderPreference',  // Looking for + Goal
    3: 'Religion',          // Religion
    4: 'PhotoUpload',       // Photos (at least 3)
    5: 'Video',             // Video (optional)
    6: 'Bio',               // Bio & Interests
    7: 'OnboardingComplete', // Completion screen
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
                if (Platform.OS === 'android') {
                    ToastAndroid.show(message, ToastAndroid.SHORT);
                } else {
                    // For iOS/web, we'll use a custom toast component
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
        return null;
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
});

