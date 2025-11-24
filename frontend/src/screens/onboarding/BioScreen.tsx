import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, KeyboardAvoidingView, Platform, Alert, StatusBar } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '../../components/ui/Button';
import { BackButton } from '../../components/ui/BackButton';
import { Input } from '../../components/ui/Input';
import { COLORS, SPACING, SIZES } from '../../theme/colors';
import { UserService } from '../../api/services';
import { useOnboardingStore } from '../../store/onboardingStore';
import { useAuthStore } from '../../store/authStore';

export const BioScreen = ({ navigation }: any) => {
    const [bio, setBio] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const { updateStep } = useOnboardingStore();
    const { user } = useAuthStore();

    useEffect(() => {
        // Load existing bio if available
        if (user?.bio) {
            setBio(user.bio);
        }
    }, [user]);

    const handleNext = async () => {
        setIsSaving(true);
        try {
            // Save bio to profile (optional, can be empty)
            if (bio.trim()) {
                await UserService.updateProfile({ bio: bio.trim() });
            }

            // Update onboarding step to 7 (bio done)
            await updateStep(7);

            // Navigate to completion screen
            navigation.navigate('OnboardingComplete');
        } catch (error: any) {
            console.error('Save bio error:', error);
            Alert.alert('Error', 'Failed to save bio. Please try again.');
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <View style={styles.container}>
            <StatusBar barStyle="dark-content" backgroundColor={COLORS.background} />
            <SafeAreaView style={styles.safeArea} edges={['bottom']}>
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
                        <Text style={styles.title}>Tell us about yourself</Text>
                        <Text style={styles.subtitle}>Write a short bio (optional)</Text>
                    </View>

                    <View style={styles.form}>
                        <Input
                            label="Bio"
                            placeholder="e.g. Love buna, music, and exploring Addis..."
                            value={bio}
                            onChangeText={setBio}
                            multiline
                            numberOfLines={6}
                            maxLength={500}
                            style={styles.bioInput}
                        />
                        <Text style={styles.charCount}>{bio.length}/500</Text>
                    </View>
                </ScrollView>

                <View style={styles.footer}>
                    <Button
                        title={bio.trim() ? "Continue" : "Skip"}
                        onPress={handleNext}
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
    safeArea: {
        flex: 1,
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
    bioInput: {
        minHeight: 120,
        textAlignVertical: 'top',
    },
    charCount: {
        fontSize: 12,
        color: COLORS.textTertiary,
        textAlign: 'right',
        marginTop: SPACING.xs,
    },
    footer: {
        padding: SPACING.l,
        paddingBottom: Platform.OS === 'ios' ? SPACING.m : SPACING.l,
        backgroundColor: COLORS.background,
        borderTopWidth: 1,
        borderTopColor: COLORS.surfaceHighlight,
    },
});

