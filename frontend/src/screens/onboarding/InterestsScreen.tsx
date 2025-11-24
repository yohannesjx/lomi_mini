import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert, StatusBar } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '../../components/ui/Button';
import { COLORS, SPACING, SIZES } from '../../theme/colors';
import { UserService } from '../../api/services';
import { useOnboardingStore } from '../../store/onboardingStore';
import { useAuthStore } from '../../store/authStore';
import { TOTAL_ONBOARDING_STEPS } from '../../navigation/OnboardingNavigator';

const INTERESTS = [
    { id: 'buna', label: '☕ Buna Lover', category: 'Culture' },
    { id: 'music', label: '🎵 Music', category: 'Art' },
    { id: 'travel', label: '✈️ Travel', category: 'Lifestyle' },
    { id: 'movies', label: '🎬 Movies', category: 'Art' },
    { id: 'fitness', label: '💪 Fitness', category: 'Lifestyle' },
    { id: 'foodie', label: '🍲 Foodie', category: 'Lifestyle' },
    { id: 'tech', label: '💻 Tech', category: 'Work' },
    { id: 'art', label: '🎨 Art', category: 'Art' },
    { id: 'faith', label: '🙏 Faith', category: 'Values' },
    { id: 'reading', label: '📚 Reading', category: 'Hobbies' },
    { id: 'dancing', label: '💃 Dancing', category: 'Hobbies' },
    { id: 'football', label: '⚽ Football', category: 'Sports' },
    { id: 'photography', label: '📸 Photography', category: 'Art' },
    { id: 'fashion', label: '👗 Fashion', category: 'Lifestyle' },
    { id: 'nature', label: '🌿 Nature', category: 'Lifestyle' },
];

export const InterestsScreen = ({ navigation }: any) => {
    const [selectedInterests, setSelectedInterests] = useState<string[]>([]);
    const [isSaving, setIsSaving] = useState(false);
    const { updateStep } = useOnboardingStore();
    const { user } = useAuthStore();

    useEffect(() => {
        // Load existing interests if available
        if (user?.interests && Array.isArray(user.interests)) {
            setSelectedInterests(user.interests);
        }
    }, [user]);

    const toggleInterest = (id: string) => {
        if (selectedInterests.includes(id)) {
            setSelectedInterests(selectedInterests.filter(i => i !== id));
        } else {
            if (selectedInterests.length >= 5) {
                Alert.alert('Limit Reached', 'You can only select up to 5 interests');
                return;
            }
            setSelectedInterests([...selectedInterests, id]);
        }
    };

    const handleFinish = async () => {
        if (selectedInterests.length < 3) {
            Alert.alert('Select More Interests', 'Please select at least 3 interests to continue.');
            return;
        }

        setIsSaving(true);
        try {
            // Save interests to profile
            await UserService.updateProfile({
                interests: selectedInterests,
            });

            // Update onboarding step to 7 (bio & interests done)
            await updateStep(7);

            // Navigate to completion screen
            navigation.navigate('OnboardingComplete');
        } catch (error: any) {
            console.error('Save interests error:', error);
            Alert.alert('Error', 'Failed to save interests. Please try again.');
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <View style={styles.container}>
            <StatusBar barStyle="dark-content" backgroundColor={COLORS.background} />
            <SafeAreaView style={styles.safeArea} edges={['bottom']}>
            <View style={styles.content}>
                <View style={styles.header}>
                    <Text style={styles.stepIndicator}>Step 7 of {TOTAL_ONBOARDING_STEPS}</Text>
                    <Text style={styles.title}>What are you into?</Text>
                    <Text style={styles.subtitle}>Pick up to 5 interests to find better matches</Text>
                </View>

                <ScrollView contentContainerStyle={styles.tagsContainer}>
                    {INTERESTS.map((interest) => {
                        const isSelected = selectedInterests.includes(interest.id);
                        return (
                            <TouchableOpacity
                                key={interest.id}
                                style={[
                                    styles.tag,
                                    isSelected && styles.tagSelected
                                ]}
                                onPress={() => toggleInterest(interest.id)}
                            >
                                <Text style={[
                                    styles.tagLabel,
                                    isSelected && styles.tagLabelSelected
                                ]}>
                                    {interest.label}
                                </Text>
                            </TouchableOpacity>
                        );
                    })}
                </ScrollView>

                <View style={styles.footer}>
                    <Text style={styles.counter}>
                        {selectedInterests.length}/5 selected
                    </Text>
                    <Button
                        title="Finish Profile"
                        onPress={handleFinish}
                        disabled={selectedInterests.length < 3 || isSaving}
                        isLoading={isSaving}
                        size="large"
                    />
                </View>
            </View>
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: COLORS.background,
    },
    content: {
        flex: 1,
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
    tagsContainer: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: SPACING.s,
        paddingBottom: SPACING.xl,
    },
    tag: {
        paddingHorizontal: SPACING.m,
        paddingVertical: SPACING.s,
        borderRadius: SIZES.radiusXL,
        borderWidth: 1,
        borderColor: COLORS.surfaceHighlight,
        backgroundColor: COLORS.surface,
    },
    tagSelected: {
        borderColor: COLORS.primary,
        backgroundColor: COLORS.primary,
    },
    tagLabel: {
        color: COLORS.textSecondary,
        fontSize: 16,
        fontWeight: '500',
    },
    tagLabelSelected: {
        color: COLORS.background,
        fontWeight: 'bold',
    },
    footer: {
        marginTop: 'auto',
        paddingTop: SPACING.m,
    },
    counter: {
        color: COLORS.textSecondary,
        textAlign: 'center',
        marginBottom: SPACING.m,
    },
});
