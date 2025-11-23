import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, KeyboardAvoidingView, Platform, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { COLORS, SPACING, SIZES } from '../../theme/colors';
import { UserService } from '../../api/services';
import { useOnboardingStore } from '../../store/onboardingStore';
import { useAuthStore } from '../../store/authStore';

export const ProfileSetupScreen = ({ navigation }: any) => {
    const [name, setName] = useState('');
    const [age, setAge] = useState('');
    const [gender, setGender] = useState<'male' | 'female' | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const { updateStep } = useOnboardingStore();
    const { user } = useAuthStore();

    useEffect(() => {
        // Load existing data if available
        if (user) {
            if (user.name && user.name !== 'User') setName(user.name);
            if (user.age && user.age > 18) setAge(user.age.toString());
            if (user.gender) setGender(user.gender);
        }
    }, [user]);

    const handleNext = async () => {
        // Validate inputs
        if (!name || !age || !gender) return;

        const ageNum = parseInt(age, 10);
        if (isNaN(ageNum) || ageNum < 18 || ageNum > 100) {
            Alert.alert('Invalid Age', 'Please enter a valid age between 18 and 100.');
            return;
        }

        setIsSaving(true);
        try {
            // Save profile data
            await UserService.updateProfile({
                name: name.trim(),
                age: ageNum,
                gender,
            });

            // Update onboarding step to 1 (age & gender done)
            await updateStep(1);

            // Navigate to next step (city)
            navigation.navigate('City');
        } catch (error: any) {
            console.error('Save profile error:', error);
            Alert.alert('Error', 'Failed to save profile. Please try again.');
        } finally {
            setIsSaving(false);
        }
    };

    const GenderOption = ({ type, label, icon }: { type: 'male' | 'female', label: string, icon: string }) => (
        <TouchableOpacity
            style={[
                styles.genderOption,
                gender === type && styles.genderOptionSelected
            ]}
            onPress={() => setGender(type)}
        >
            <Text style={styles.genderIcon}>{icon}</Text>
            <Text style={[
                styles.genderLabel,
                gender === type && styles.genderLabelSelected
            ]}>{label}</Text>
        </TouchableOpacity>
    );

    return (
        <SafeAreaView style={styles.container}>
            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                style={{ flex: 1 }}
            >
                <ScrollView contentContainerStyle={styles.scrollContent}>
                    <View style={styles.header}>
                        <Text style={styles.stepIndicator}>Step 1 of 4</Text>
                        <Text style={styles.title}>Tell us about yourself</Text>
                        <Text style={styles.subtitle}>This info will be shown on your profile</Text>
                    </View>

                    <View style={styles.form}>
                        <Input
                            label="Full Name"
                            placeholder="e.g. Abebe Bikila"
                            value={name}
                            onChangeText={setName}
                        />

                        <Input
                            label="Age"
                            placeholder="e.g. 24"
                            keyboardType="number-pad"
                            maxLength={2}
                            value={age}
                            onChangeText={setAge}
                        />

                        <Text style={styles.label}>Gender</Text>
                        <View style={styles.genderContainer}>
                            <GenderOption type="male" label="Male" icon="👨🏾" />
                            <GenderOption type="female" label="Female" icon="👩🏾" />
                        </View>
                    </View>

                    <View style={styles.footer}>
                        <Button
                            title="Next Step"
                            onPress={handleNext}
                            disabled={!name || !age || !gender || isSaving}
                            isLoading={isSaving}
                            size="large"
                        />
                    </View>
                </ScrollView>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: COLORS.background,
    },
    scrollContent: {
        flexGrow: 1,
        padding: SPACING.l,
    },
    header: {
        marginBottom: SPACING.xl,
    },
    stepIndicator: {
        color: COLORS.primary,
        fontWeight: 'bold',
        marginBottom: SPACING.s,
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
    label: {
        color: COLORS.textSecondary,
        marginBottom: SPACING.s,
        fontSize: 14,
        fontWeight: '500',
    },
    genderContainer: {
        flexDirection: 'row',
        gap: SPACING.m,
        marginBottom: SPACING.xl,
    },
    genderOption: {
        flex: 1,
        backgroundColor: COLORS.surface,
        borderRadius: SIZES.radiusM,
        padding: SPACING.m,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: COLORS.surfaceHighlight,
    },
    genderOptionSelected: {
        borderColor: COLORS.primary,
        backgroundColor: 'rgba(167, 255, 131, 0.1)',
    },
    genderIcon: {
        fontSize: 32,
        marginBottom: SPACING.s,
    },
    genderLabel: {
        color: COLORS.textSecondary,
        fontWeight: '600',
    },
    genderLabelSelected: {
        color: COLORS.primary,
    },
    footer: {
        marginTop: SPACING.xl,
    },
});
