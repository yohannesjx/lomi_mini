import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, ScrollView, ActivityIndicator, Alert, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';
import { Button } from '../../components/ui/Button';
import { COLORS, SPACING, SIZES } from '../../theme/colors';
import { UserService } from '../../api/services';
import { useAuthStore } from '../../store/authStore';
import { useOnboardingStore } from '../../store/onboardingStore';
import axios from 'axios';

interface PhotoData {
    uri: string | null;
    fileKey: string | null;
    isUploading: boolean;
}

export const PhotoUploadScreen = ({ navigation }: any) => {
    const [photos, setPhotos] = useState<PhotoData[]>([
        { uri: null, fileKey: null, isUploading: false },
        { uri: null, fileKey: null, isUploading: false },
        { uri: null, fileKey: null, isUploading: false },
        { uri: null, fileKey: null, isUploading: false },
        { uri: null, fileKey: null, isUploading: false },
        { uri: null, fileKey: null, isUploading: false },
    ]);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const { updateStep } = useOnboardingStore();

    const pickImage = async (index: number) => {
        // Request permissions
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') {
            Alert.alert('Permission Required', 'We need camera roll permissions to upload photos.');
            return;
        }

        let result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            allowsEditing: true,
            aspect: [4, 5],
            quality: 0.8,
        });

        if (!result.canceled && result.assets[0]) {
            const newPhotos = [...photos];
            newPhotos[index] = { uri: result.assets[0].uri, fileKey: null, isUploading: true };
            setPhotos(newPhotos);

            // Upload to backend
            await uploadPhoto(result.assets[0].uri, index);
        }
    };

    const uploadPhoto = async (localUri: string, index: number) => {
        try {
            // In dev mode, skip actual upload if not authenticated
            if (__DEV__) {
                const { isAuthenticated } = useAuthStore.getState();
                if (!isAuthenticated) {
                    console.warn('⚠️ Dev mode: Skipping upload (not authenticated)');
                    console.log('ℹ️  Photo will be stored locally for UI testing');
                    const newPhotos = [...photos];
                    newPhotos[index] = {
                        uri: localUri,
                        fileKey: `dev_${Date.now()}_${index}`, // Mock file key
                        isUploading: false,
                    };
                    setPhotos(newPhotos);
                    return;
                }
            }
            
            // 1. Get pre-signed upload URL
            const { upload_url, file_key } = await UserService.getPresignedUploadURL('photo');

            // 2. Upload based on platform
            if (Platform.OS === 'web') {
                // Web: Handle different URI types safely
                try {
                    let blob: Blob;
                    
                    if (localUri.startsWith('data:')) {
                        // Data URL - convert to blob
                        const base64Data = localUri.split(',')[1];
                        const byteCharacters = atob(base64Data);
                        const byteNumbers = new Array(byteCharacters.length);
                        for (let i = 0; i < byteCharacters.length; i++) {
                            byteNumbers[i] = byteCharacters.charCodeAt(i);
                        }
                        const byteArray = new Uint8Array(byteNumbers);
                        blob = new Blob([byteArray], { type: 'image/jpeg' });
                    } else if (localUri.startsWith('blob:')) {
                        // Blob URL - fetch it
                        const response = await fetch(localUri);
                        if (!response.ok) {
                            throw new Error('Failed to fetch blob URL');
                        }
                        blob = await response.blob();
                    } else {
                        // Try to fetch as-is (file:// or http://)
                        const response = await fetch(localUri);
                        if (!response.ok) {
                            throw new Error('Failed to fetch image');
                        }
                        blob = await response.blob();
                    }
                    
                    console.log('📤 Uploading to R2...', {
                        url: upload_url.substring(0, 100) + '...',
                        blobSize: blob.size,
                        contentType: blob.type,
                    });

                    const uploadResponse = await fetch(upload_url, {
                        method: 'PUT',
                        body: blob,
                        headers: {
                            'Content-Type': blob.type || 'image/jpeg',
                        },
                    });

                    console.log('📤 Upload response:', {
                        status: uploadResponse.status,
                        statusText: uploadResponse.statusText,
                        ok: uploadResponse.ok,
                        headers: Object.fromEntries(uploadResponse.headers.entries()),
                    });

                    if (!uploadResponse.ok) {
                        const errorText = await uploadResponse.text().catch(() => 'Unknown error');
                        console.error('❌ Upload failed:', {
                            status: uploadResponse.status,
                            statusText: uploadResponse.statusText,
                            errorText,
                            url: upload_url.substring(0, 100),
                        });
                        throw new Error(`Upload failed: ${uploadResponse.status} - ${errorText}`);
                    }

                    console.log('✅ Upload to R2 successful');
                } catch (error: any) {
                    console.error('Web upload error:', error);
                    throw new Error(`Upload failed: ${error.message || 'Unknown error'}`);
                }
            } else {
                // React Native: Use FileSystem.uploadAsync (recommended)
                console.log('📤 Uploading to R2 (React Native)...', {
                    url: upload_url.substring(0, 100) + '...',
                    localUri,
                });

                const uploadResult = await FileSystem.uploadAsync(upload_url, localUri, {
                    httpMethod: 'PUT',
                    headers: {
                        'Content-Type': 'image/jpeg',
                    },
                });

                console.log('📤 Upload response (RN):', {
                    status: uploadResult.status,
                    body: uploadResult.body?.substring(0, 200),
                });

                if (uploadResult.status !== 200 && uploadResult.status !== 204) {
                    console.error('❌ Upload failed (RN):', {
                        status: uploadResult.status,
                        body: uploadResult.body,
                        url: upload_url.substring(0, 100),
                    });
                    throw new Error(`Upload failed with status ${uploadResult.status}: ${uploadResult.body || 'Unknown error'}`);
                }

                console.log('✅ Upload to R2 successful (RN)');
            }

            // 3. Update photo data with file key (success)
            console.log('✅ Upload completed successfully, setting fileKey:', file_key);
            const newPhotos = [...photos];
            newPhotos[index] = {
                uri: localUri,
                fileKey: file_key,
                isUploading: false,
            };
            setPhotos(newPhotos);
            console.log('✅ Photo state updated, ready for media record creation');
        } catch (error: any) {
            console.error('Upload error details:', {
                error,
                message: error?.message,
                response: error?.response?.data,
                status: error?.response?.status,
            });
            
            const errorMessage = error?.response?.data?.error || error?.message || 'Failed to upload photo';
            Alert.alert(
                'Upload Failed', 
                `${errorMessage}\n\nTroubleshooting:\n• Check your internet connection\n• Verify backend is running\n• Check R2 credentials\n• Try again in a moment`
            );
            
            // Reset photo state
            const newPhotos = [...photos];
            newPhotos[index] = { uri: null, fileKey: null, isUploading: false };
            setPhotos(newPhotos);
        }
    };

    const handleNext = async () => {
        // Require at least 3 photos (as per requirements)
        const uploadedPhotos = photos.filter(p => p.fileKey !== null);
        const localPhotos = photos.filter(p => p.uri !== null && p.fileKey === null);
        
        // In dev mode, allow proceeding with local photos (not uploaded)
        if (__DEV__ && uploadedPhotos.length === 0 && localPhotos.length >= 3) {
            console.warn('⚠️ Dev mode: Proceeding without uploading to R2');
            console.log('ℹ️  In production, photos will be uploaded to R2');
            await updateStep(5);
            navigation.navigate('Video');
            return;
        }
        
        if (uploadedPhotos.length < 3) {
            Alert.alert('More Photos Needed', 'Please upload at least 3 photos to continue.');
            return;
        }

        // Check if any photos are still uploading
        const stillUploading = photos.some(p => p.isUploading);
        if (stillUploading) {
            Alert.alert('Please Wait', 'Some photos are still uploading. Please wait.');
            return;
        }

        setIsSubmitting(true);
        try {
            // Register all uploaded photos with backend
            for (let i = 0; i < photos.length; i++) {
                const photo = photos[i];
                if (photo.fileKey) {
                    console.log(`📸 Creating media record ${i + 1}/${uploadedPhotos.length} - FileKey: ${photo.fileKey}`);
                    try {
                        const result = await UserService.uploadMedia({
                            media_type: 'photo',
                            file_key: photo.fileKey,
                            display_order: i,
                        });
                        console.log(`✅ Media record created: ${result.id}`);
                    } catch (error: any) {
                        console.error(`❌ Failed to create media record for photo ${i + 1}:`, {
                            error,
                            message: error?.message,
                            response: error?.response?.data,
                            status: error?.response?.status,
                            fileKey: photo.fileKey,
                        });
                        throw error; // Re-throw to show error to user
                    }
                }
            }
            navigation.navigate('Interests');
        } catch (error: any) {
            console.error('Submit error:', error);
            // In dev mode, allow proceeding even if backend fails
            if (__DEV__) {
                console.warn('⚠️ Dev mode: Backend registration failed, but continuing...');
                navigation.navigate('Interests');
            } else {
                Alert.alert('Error', 'Failed to save photos. Please try again.');
            }
        } finally {
            setIsSubmitting(false);
        }
    };

    const PhotoBox = ({ index, photo }: { index: number, photo: PhotoData }) => (
        <TouchableOpacity
            style={[styles.photoBox, photo.uri ? styles.photoBoxFilled : null]}
            onPress={() => !photo.isUploading && pickImage(index)}
            disabled={photo.isUploading}
        >
            {photo.uri ? (
                <>
                    <Image source={{ uri: photo.uri }} style={styles.photo} />
                    {photo.isUploading && (
                        <View style={styles.uploadingOverlay}>
                            <ActivityIndicator size="large" color={COLORS.primary} />
                            <Text style={styles.uploadingText}>Uploading...</Text>
                        </View>
                    )}
                </>
            ) : (
                <View style={styles.placeholder}>
                    <Text style={styles.plusIcon}>+</Text>
                </View>
            )}
            {index === 0 && photo.fileKey && (
                <View style={styles.mainBadge}>
                    <Text style={styles.mainBadgeText}>Main</Text>
                </View>
            )}
        </TouchableOpacity>
    );

    return (
        <SafeAreaView style={styles.container}>
            <ScrollView contentContainerStyle={styles.scrollContent}>
                <View style={styles.header}>
                    <Text style={styles.stepIndicator}>Step 2 of 4</Text>
                    <Text style={styles.title}>Add your best photos</Text>
                    <Text style={styles.subtitle}>Upload at least 2 photos to start matching</Text>
                </View>

                <View style={styles.grid}>
                    {photos.map((photo, index) => (
                        <PhotoBox key={index} index={index} photo={photo} />
                    ))}
                </View>

                <View style={styles.footer}>
                    <Button
                        title={isSubmitting ? "Saving..." : "Next Step"}
                        onPress={handleNext}
                        disabled={photos.filter(p => p.fileKey !== null).length < 2 || isSubmitting}
                        isLoading={isSubmitting}
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
    grid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: SPACING.m,
        justifyContent: 'space-between',
    },
    photoBox: {
        width: '30%',
        aspectRatio: 0.8,
        backgroundColor: COLORS.surface,
        borderRadius: SIZES.radiusM,
        borderWidth: 1,
        borderColor: COLORS.surfaceHighlight,
        borderStyle: 'dashed',
        overflow: 'hidden',
    },
    photoBoxFilled: {
        borderStyle: 'solid',
        borderColor: 'transparent',
    },
    photo: {
        width: '100%',
        height: '100%',
    },
    placeholder: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    plusIcon: {
        fontSize: 32,
        color: COLORS.primary,
    },
    mainBadge: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        backgroundColor: 'rgba(0,0,0,0.6)',
        paddingVertical: 4,
        alignItems: 'center',
    },
    mainBadgeText: {
        color: COLORS.textPrimary,
        fontSize: 10,
        fontWeight: 'bold',
    },
    footer: {
        marginTop: SPACING.xl,
    },
    uploadingOverlay: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0,0,0,0.7)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    uploadingText: {
        color: COLORS.textPrimary,
        marginTop: SPACING.s,
        fontSize: 12,
    },
});
