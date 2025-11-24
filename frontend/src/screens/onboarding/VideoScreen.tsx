import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, StatusBar } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '../../components/ui/Button';
import { COLORS, SPACING, SIZES } from '../../theme/colors';
import { useOnboardingStore } from '../../store/onboardingStore';
import * as ImagePicker from 'expo-image-picker';

export const VideoScreen = ({ navigation }: any) => {
    const [hasVideo, setHasVideo] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const { updateStep } = useOnboardingStore();

    const handleRecordVideo = async () => {
        // Request permissions
        const { status } = await ImagePicker.requestCameraPermissionsAsync();
        if (status !== 'granted') {
            Alert.alert('Permission Required', 'We need camera permissions to record videos.');
            return;
        }

        try {
            const result = await ImagePicker.launchCameraAsync({
                mediaTypes: ImagePicker.MediaTypeOptions.Videos,
                allowsEditing: true,
                quality: 0.8,
                videoMaxDuration: 30, // 30 seconds max
            });

            if (!result.canceled && result.assets[0]) {
                // TODO: Upload video to backend
                // For now, just mark as having video
                setHasVideo(true);
            }
        } catch (error) {
            console.error('Video recording error:', error);
            Alert.alert('Error', 'Failed to record video. Please try again.');
        }
    };

    const handleSkip = async () => {
        // Video is optional, so we can skip
        setIsSaving(true);
        try {
            // Update onboarding step to 6 (video done, even if skipped)
            await updateStep(6);
            navigation.navigate('Bio');
        } catch (error) {
            console.error('Update step error:', error);
        } finally {
            setIsSaving(false);
        }
    };

    const handleNext = async () => {
        if (!hasVideo) {
            Alert.alert('No Video', 'Please record a video or skip this step.');
            return;
        }

        setIsSaving(true);
        try {
            // Update onboarding step to 6 (video done)
            await updateStep(6);
            navigation.navigate('Bio');
        } catch (error) {
            console.error('Update step error:', error);
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.content}>
                <View style={styles.header}>
                    <Text style={styles.title}>Add a video (Optional)</Text>
                    <Text style={styles.subtitle}>
                        Show your personality with a short video. This helps you get more matches!
                    </Text>
                </View>

                <View style={styles.videoContainer}>
                    {hasVideo ? (
                        <View style={styles.videoPlaceholder}>
                            <Text style={styles.videoIcon}>✅</Text>
                            <Text style={styles.videoText}>Video recorded!</Text>
                        </View>
                    ) : (
                        <TouchableOpacity
                            style={styles.recordButton}
                            onPress={handleRecordVideo}
                        >
                            <Text style={styles.recordIcon}>🎥</Text>
                            <Text style={styles.recordText}>Record Video</Text>
                            <Text style={styles.recordSubtext}>Up to 30 seconds</Text>
                        </TouchableOpacity>
                    )}
                </View>

                <View style={styles.footer}>
                    <Button
                        title={hasVideo ? "Continue" : "Skip for now"}
                        onPress={hasVideo ? handleNext : handleSkip}
                        loading={isSaving}
                        size="large"
                        variant={hasVideo ? "primary" : "secondary"}
                    />
                </View>
            </View>
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
    content: {
        flex: 1,
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
        lineHeight: 24,
    },
    videoContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    recordButton: {
        backgroundColor: COLORS.surface,
        borderRadius: SIZES.radiusL,
        padding: SPACING.xl,
        alignItems: 'center',
        borderWidth: 2,
        borderColor: COLORS.primary,
        borderStyle: 'dashed',
        minWidth: 200,
    },
    recordIcon: {
        fontSize: 48,
        marginBottom: SPACING.m,
    },
    recordText: {
        fontSize: 18,
        fontWeight: 'bold',
        color: COLORS.primary,
        marginBottom: SPACING.xs,
    },
    recordSubtext: {
        fontSize: 14,
        color: COLORS.textSecondary,
    },
    videoPlaceholder: {
        backgroundColor: COLORS.surface,
        borderRadius: SIZES.radiusL,
        padding: SPACING.xl,
        alignItems: 'center',
    },
    videoIcon: {
        fontSize: 48,
        marginBottom: SPACING.m,
    },
    videoText: {
        fontSize: 18,
        fontWeight: 'bold',
        color: COLORS.primary,
    },
    footer: {
        marginTop: SPACING.xl,
    },
});

