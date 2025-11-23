import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '../../components/ui/Button';
import { COLORS, SPACING, SIZES } from '../../theme/colors';
import { UserService } from '../../api/services';
import { useOnboardingStore } from '../../store/onboardingStore';
import { useAuthStore } from '../../store/authStore';

const RELIGIONS = [
    { value: 'orthodox', label: 'Orthodox', icon: '⛪' },
    { value: 'muslim', label: 'Muslim', icon: '🕌' },
    { value: 'protestant', label: 'Protestant', icon: '✝️' },
    { value: 'catholic', label: 'Catholic', icon: '⛪' },
    { value: 'other', label: 'Other', icon: '🙏' },
    { value: 'none', label: 'Prefer not to say', icon: '—' },
];

export const ReligionScreen = ({ navigation }: any) => {
    const [religion, setReligion] = useState<string | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const { updateStep } = useOnboardingStore();
    const { user } = useAuthStore();

    useEffect(() => {
        // Load existing religion if available
        if (user?.religion && user.religion !== 'none') {
            setReligion(user.religion);
        }
    }, [user]);

    const handleNext = async () => {
        if (!religion) return;

        setIsSaving(true);
        try {
            // Save religion to profile
            await UserService.updateProfile({ religion });

            // Update onboarding step to 4 (religion done)
            await updateStep(4);

            // Navigate to next step (photos)
            navigation.navigate('PhotoUpload');
        } catch (error: any) {
            console.error('Save religion error:', error);
            Alert.alert('Error', 'Failed to save religion. Please try again.');
        } finally {
            setIsSaving(false);
        }
    };

    const ReligionOption = ({ value, label, icon }: { value: string; label: string; icon: string }) => (
        <TouchableOpacity
            style={[
                styles.religionOption,
                religion === value && styles.religionOptionSelected
            ]}
            onPress={() => setReligion(value)}
        >
            <Text style={styles.religionIcon}>{icon}</Text>
            <Text style={[
                styles.religionLabel,
                religion === value && styles.religionLabelSelected
            ]}>{label}</Text>
        </TouchableOpacity>
    );

    return (
        <SafeAreaView style={styles.container}>
            <ScrollView contentContainerStyle={styles.scrollContent}>
                <View style={styles.header}>
                    <Text style={styles.title}>What's your religion?</Text>
                    <Text style={styles.subtitle}>This helps us find compatible matches</Text>
                </View>

                <View style={styles.optionsContainer}>
                    {RELIGIONS.map((rel) => (
                        <ReligionOption
                            key={rel.value}
                            value={rel.value}
                            label={rel.label}
                            icon={rel.icon}
                        />
                    ))}
                </View>

                <View style={styles.footer}>
                    <Button
                        title="Continue"
                        onPress={handleNext}
                        disabled={!religion || isSaving}
                        loading={isSaving}
                        size="large"
                    />
                </View>
            </ScrollView>
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
    optionsContainer: {
        flex: 1,
        gap: SPACING.m,
    },
    religionOption: {
        backgroundColor: COLORS.surface,
        borderRadius: SIZES.radiusM,
        padding: SPACING.l,
        flexDirection: 'row',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: COLORS.surfaceHighlight,
    },
    religionOptionSelected: {
        borderColor: COLORS.primary,
        backgroundColor: 'rgba(167, 255, 131, 0.1)',
    },
    religionIcon: {
        fontSize: 24,
        marginRight: SPACING.m,
    },
    religionLabel: {
        fontSize: 16,
        color: COLORS.textSecondary,
        fontWeight: '600',
    },
    religionLabelSelected: {
        color: COLORS.primary,
    },
    footer: {
        marginTop: SPACING.xl,
    },
});

