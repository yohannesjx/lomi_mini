import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert, StatusBar } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '../../components/ui/Button';
import { COLORS, SPACING, SIZES } from '../../theme/colors';
import { UserService } from '../../api/services';
import { useAuthStore } from '../../store/authStore';
import { useOnboardingStore } from '../../store/onboardingStore';
import { TOTAL_ONBOARDING_STEPS } from '../../navigation/OnboardingNavigator';

export const GenderPreferenceScreen = ({ navigation }: any) => {
    const [lookingFor, setLookingFor] = useState<'male' | 'female' | null>(null);
    const [relationshipGoal, setRelationshipGoal] = useState<'friends' | 'dating' | 'serious' | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const { updateStep } = useOnboardingStore();
    const { user } = useAuthStore();

    useEffect(() => {
        // Load existing preferences if available
        if (user) {
            if (user.preferences?.looking_for) {
                setLookingFor(user.preferences.looking_for);
            }
            if (user.relationship_goal) {
                setRelationshipGoal(user.relationship_goal);
            }
        }
    }, [user]);

    const handleNext = async () => {
        if (!lookingFor || !relationshipGoal) {
            Alert.alert('Complete All Fields', 'Please select both who you\'re looking for and your relationship goal.');
            return;
        }

        setIsSaving(true);
        try {
            // Save preferences and relationship goal
            const currentPreferences = user?.preferences || {};
            
            await UserService.updateProfile({
                preferences: {
                    ...currentPreferences,
                    looking_for: lookingFor,
                },
                relationship_goal: relationshipGoal,
            });

            // Update onboarding step to 3 (looking for + goal done)
            await updateStep(3);

            // Navigate to next step (religion)
            navigation.navigate('Religion');
        } catch (error: any) {
            console.error('Save preference error:', error);
            Alert.alert('Error', 'Failed to save preferences. Please try again.');
        } finally {
            setIsSaving(false);
        }
    };

    const GenderOption = ({ type, label, icon }: { type: 'male' | 'female', label: string, icon: string }) => (
        <TouchableOpacity
            style={[
                styles.genderOption,
                lookingFor === type && styles.genderOptionSelected
            ]}
            onPress={() => setLookingFor(type)}
        >
            <Text style={styles.genderIcon}>{icon}</Text>
            <Text style={[
                styles.genderLabel,
                lookingFor === type && styles.genderLabelSelected
            ]}>{label}</Text>
        </TouchableOpacity>
    );

    return (
        <View style={styles.container}>
            <StatusBar barStyle="dark-content" backgroundColor={COLORS.background} />
            <SafeAreaView style={styles.safeArea} edges={['bottom']}>
                <ScrollView contentContainerStyle={styles.scrollContent}>
                <View style={styles.header}>
                    <Text style={styles.stepIndicator}>Step 3 of {TOTAL_ONBOARDING_STEPS}</Text>
                    <Text style={styles.title}>Who are you looking for?</Text>
                    <Text style={styles.subtitle}>This helps us show you the right matches</Text>
                </View>

                <View style={styles.content}>
                    <View style={styles.section}>
                        <Text style={styles.sectionTitle}>I'm looking for</Text>
                        <View style={styles.genderContainer}>
                            <GenderOption type="female" label="Female" icon="👩🏾" />
                            <GenderOption type="male" label="Male" icon="👨🏾" />
                        </View>
                    </View>

                    <View style={styles.section}>
                        <Text style={styles.sectionTitle}>Relationship goal</Text>
                        <View style={styles.goalContainer}>
                            <TouchableOpacity
                                style={[
                                    styles.goalOption,
                                    relationshipGoal === 'friends' && styles.goalOptionSelected
                                ]}
                                onPress={() => setRelationshipGoal('friends')}
                            >
                                <Text style={styles.goalIcon}>👥</Text>
                                <Text style={[
                                    styles.goalLabel,
                                    relationshipGoal === 'friends' && styles.goalLabelSelected
                                ]}>Friends</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[
                                    styles.goalOption,
                                    relationshipGoal === 'dating' && styles.goalOptionSelected
                                ]}
                                onPress={() => setRelationshipGoal('dating')}
                            >
                                <Text style={styles.goalIcon}>💕</Text>
                                <Text style={[
                                    styles.goalLabel,
                                    relationshipGoal === 'dating' && styles.goalLabelSelected
                                ]}>Dating</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[
                                    styles.goalOption,
                                    relationshipGoal === 'serious' && styles.goalOptionSelected
                                ]}
                                onPress={() => setRelationshipGoal('serious')}
                            >
                                <Text style={styles.goalIcon}>💍</Text>
                                <Text style={[
                                    styles.goalLabel,
                                    relationshipGoal === 'serious' && styles.goalLabelSelected
                                ]}>Serious</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>

                <View style={styles.footer}>
                    <Button
                        title={isSaving ? "Saving..." : "Next Step"}
                        onPress={handleNext}
                        disabled={!lookingFor || !relationshipGoal || isSaving}
                        isLoading={isSaving}
                        size="large"
                    />
                </View>
            </ScrollView>
            </SafeAreaView>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: COLORS.background,
    },
    safeArea: {
        flex: 1,
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
        fontSize: 14,
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
    content: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    genderContainer: {
        flexDirection: 'row',
        gap: SPACING.l,
        width: '100%',
        maxWidth: 400,
    },
    genderOption: {
        flex: 1,
        backgroundColor: COLORS.surface,
        borderRadius: SIZES.radiusL,
        padding: SPACING.xl,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 2,
        borderColor: COLORS.surfaceHighlight,
        minHeight: 200,
    },
    genderOptionSelected: {
        borderColor: COLORS.primary,
        backgroundColor: 'rgba(167, 255, 131, 0.1)',
        shadowColor: COLORS.primary,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 8,
    },
    genderIcon: {
        fontSize: 64,
        marginBottom: SPACING.m,
    },
    genderLabel: {
        color: COLORS.textSecondary,
        fontWeight: '600',
        fontSize: 18,
    },
    genderLabelSelected: {
        color: COLORS.primary,
        fontWeight: 'bold',
    },
    section: {
        marginBottom: SPACING.xl,
    },
    sectionTitle: {
        fontSize: 16,
        fontWeight: '600',
        color: COLORS.textPrimary,
        marginBottom: SPACING.m,
    },
    goalContainer: {
        flexDirection: 'row',
        gap: SPACING.m,
    },
    goalOption: {
        flex: 1,
        backgroundColor: COLORS.surface,
        borderRadius: SIZES.radiusM,
        padding: SPACING.m,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: COLORS.surfaceHighlight,
    },
    goalOptionSelected: {
        borderColor: COLORS.primary,
        backgroundColor: 'rgba(167, 255, 131, 0.1)',
    },
    goalIcon: {
        fontSize: 24,
        marginBottom: SPACING.xs,
    },
    goalLabel: {
        fontSize: 14,
        color: COLORS.textSecondary,
        fontWeight: '600',
    },
    goalLabelSelected: {
        color: COLORS.primary,
    },
    footer: {
        marginTop: SPACING.xl,
    },
});

