import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, KeyboardAvoidingView, Platform, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '../../components/ui/Button';
import { BackButton } from '../../components/ui/BackButton';
import { Input } from '../../components/ui/Input';
import { COLORS, SPACING, SIZES } from '../../theme/colors';
import { UserService } from '../../api/services';
import { useOnboardingStore } from '../../store/onboardingStore';
import { useAuthStore } from '../../store/authStore';
import { TOTAL_ONBOARDING_STEPS } from '../../navigation/OnboardingNavigator';

export const CityScreen = ({ navigation }: any) => {
    const [city, setCity] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const { updateStep } = useOnboardingStore();
    const { user } = useAuthStore();

    useEffect(() => {
        // Load existing city if available
        if (user?.city && user.city !== 'Not Set') {
            setCity(user.city);
        }
    }, [user]);

    const handleNext = async () => {
        if (!city.trim()) return;

        setIsSaving(true);
        try {
            // Save city to profile
            await UserService.updateProfile({ city: city.trim() });

            // Update onboarding step to 2 (city done)
            await updateStep(2);

            // Navigate to next step
            navigation.navigate('GenderPreference');
        } catch (error: any) {
            console.error('Save city error:', error);
            Alert.alert('Error', 'Failed to save city. Please try again.');
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <SafeAreaView style={styles.container} edges={['top']}>
            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                style={styles.keyboardView}
                keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
            >
                <BackButton />
                <ScrollView
                    contentContainerStyle={styles.scrollContent}
                    keyboardShouldPersistTaps="handled"
                    showsVerticalScrollIndicator={false}
                >
                    <View style={styles.header}>
                        <Text style={styles.title}>Where are you located?</Text>
                        <Text style={styles.subtitle}>This helps us find matches near you</Text>
                    </View>

                    <View style={styles.form}>
                        <Input
                            label="City"
                            placeholder="e.g. Addis Ababa"
                            value={city}
                            onChangeText={setCity}
                            autoCapitalize="words"
                        />
                    </View>
                </ScrollView>

                <View style={styles.footer}>
                    <Button
                        title="Continue"
                        onPress={handleNext}
                        disabled={!city.trim() || isSaving}
                        isLoading={isSaving}
                        size="large"
                    />
                </View>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: COLORS.background,
    },
    keyboardView: {
        flex: 1,
    },
    scrollContent: {
        flexGrow: 1,
        padding: SPACING.l,
        paddingBottom: SPACING.xl,
    },
    header: {
        marginBottom: SPACING.xl,
    },
    title: {
        fontSize: 28,
        fontWeight: 'bold',
        color: COLORS.textPrimary,
        marginBottom: SPACING.xs,
    },
    subtitle: {
        fontSize: 16,
        color: COLORS.textSecondary,
    },
    form: {
        flex: 1,
    },
    footer: {
        padding: SPACING.l,
        paddingBottom: Platform.OS === 'ios' ? SPACING.m : SPACING.l,
        backgroundColor: COLORS.background,
        borderTopWidth: 1,
        borderTopColor: COLORS.surfaceHighlight,
    },
});

