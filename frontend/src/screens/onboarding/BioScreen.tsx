import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, KeyboardAvoidingView, Platform, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '../../components/ui/Button';
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
            // Save bio to profile
            await UserService.updateProfile({ bio: bio.trim() });

            // Update onboarding step to 7 (bio done)
            await updateStep(7);

            // Navigate to interests (part of step 7)
            navigation.navigate('Interests');
        } catch (error: any) {
            console.error('Save bio error:', error);
            Alert.alert('Error', 'Failed to save bio. Please try again.');
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <SafeAreaView style={styles.container}>
            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                style={{ flex: 1 }}
            >
                <ScrollView contentContainerStyle={styles.scrollContent}>
                    <View style={styles.header}>
                        <Text style={styles.title}>Tell us about yourself</Text>
                        <Text style={styles.subtitle}>Write a short bio that shows your personality</Text>
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

                    <View style={styles.footer}>
                        <Button
                            title="Continue"
                            onPress={handleNext}
                            loading={isSaving}
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
        marginTop: SPACING.xl,
    },
});

