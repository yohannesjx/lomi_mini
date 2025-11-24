import React, { useState, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, ScrollView, ActivityIndicator, Alert, Platform, StatusBar } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';
import { Button } from '../../components/ui/Button';
import { BackButton } from '../../components/ui/BackButton';
import { COLORS, SPACING, SIZES } from '../../theme/colors';
import { UserService } from '../../api/services';
import { useAuthStore } from '../../store/authStore';
import { useOnboardingStore } from '../../store/onboardingStore';
import { TOTAL_ONBOARDING_STEPS } from '../../navigation/OnboardingNavigator';
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
    const [uploadInProgress, setUploadInProgress] = useState<Set<number>>(new Set()); // Track which indices are uploading
    const [hasCalledUploadComplete, setHasCalledUploadComplete] = useState(false); // Prevent duplicate calls
    const uploadInProgressRef = useRef<Set<number>>(new Set()); // Ref for synchronous checking
    const { updateStep } = useOnboardingStore();

    const compressImage = async (uri: string): Promise<string> => {
        try {
            // Web: Use canvas to compress images
            if (Platform.OS === 'web' && typeof document !== 'undefined') {
                return await compressImageWeb(uri);
            }
            
            // Mobile: Try to use expo-image-manipulator if available
            try {
                const { manipulateAsync, SaveFormat } = require('expo-image-manipulator');
                const manipulatedImage = await manipulateAsync(
                    uri,
                    [
                        { resize: { width: 1080 } }, // Resize to max 1080px width (maintains aspect ratio)
                    ],
                    {
                        compress: 0.7, // 70% quality (good balance)
                        format: SaveFormat.JPEG, // Always use JPEG for smaller file size
                    }
                );
                
                console.log('✅ Image compressed (mobile):', {
                    original: uri.substring(0, 50),
                    compressed: manipulatedImage.uri.substring(0, 50),
                });
                
                return manipulatedImage.uri;
            } catch (mobileError) {
                console.warn('⚠️ Mobile compression not available, using original:', mobileError);
                return uri;
            }
        } catch (error) {
            console.warn('⚠️ Image compression failed, using original:', error);
            return uri; // Fallback to original if compression fails
        }
    };

    const compressImageWeb = async (uri: string): Promise<string> => {
        return new Promise((resolve, reject) => {
            try {
                const img = document.createElement('img') as HTMLImageElement;
                img.crossOrigin = 'anonymous';
                
                img.onload = () => {
                    try {
                        // Calculate new dimensions (max 1080px width)
                        const maxWidth = 1080;
                        let width = img.width;
                        let height = img.height;
                        
                        if (width > maxWidth) {
                            height = (height * maxWidth) / width;
                            width = maxWidth;
                        }
                        
                        // Create canvas
                        const canvas = document.createElement('canvas');
                        canvas.width = width;
                        canvas.height = height;
                        const ctx = canvas.getContext('2d');
                        
                        if (!ctx) {
                            reject(new Error('Could not get canvas context'));
                            return;
                        }
                        
                        // Draw and compress
                        ctx.drawImage(img, 0, 0, width, height);
                        const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.7);
                        
                        console.log('✅ Image compressed (web):', {
                            original: `${img.width}x${img.height}`,
                            compressed: `${width}x${height}`,
                        });
                        
                        resolve(compressedDataUrl);
                    } catch (error) {
                        reject(error);
                    }
                };
                
                img.onerror = () => {
                    reject(new Error('Failed to load image'));
                };
                
                img.src = uri;
            } catch (error) {
                reject(error);
            }
        });
    };

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
            quality: 1.0, // Get full quality first, we'll compress it ourselves
        });

        if (!result.canceled && result.assets[0]) {
            // Prevent uploading if this index is already uploading (use ref for synchronous check)
            if (uploadInProgressRef.current.has(index)) {
                console.warn(`⚠️ Upload already in progress for index ${index}`);
                return;
            }

            // Mark as in progress using ref (synchronous)
            uploadInProgressRef.current.add(index);
            setUploadInProgress(prev => new Set(prev).add(index));

            const originalUri = result.assets[0].uri;
            
            // Use functional update to avoid race conditions
            setPhotos(prevPhotos => {
                const newPhotos = [...prevPhotos];
                newPhotos[index] = { uri: originalUri, fileKey: null, isUploading: true };
                return newPhotos;
            });
            
            // Mark this index as uploading
            setUploadInProgress(prev => new Set(prev).add(index));

            // Compress image before uploading
            let compressedUri: string;
            try {
                compressedUri = await compressImage(originalUri);
                // Update with compressed URI for display using functional update
                setPhotos(prevPhotos => {
                    const newPhotos = [...prevPhotos];
                    newPhotos[index] = { uri: compressedUri, fileKey: null, isUploading: true };
                    return newPhotos;
                });
            } catch (error: any) {
                console.error('Image compression error:', error);
                Alert.alert('Error', 'Failed to compress image. Please try again.');
                // Use functional update to reset state
                setPhotos(prevPhotos => {
                    const newPhotos = [...prevPhotos];
                    newPhotos[index] = { uri: null, fileKey: null, isUploading: false };
                    return newPhotos;
                });
                uploadInProgressRef.current.delete(index);
                setUploadInProgress(prev => {
                    const next = new Set(prev);
                    next.delete(index);
                    return next;
                });
                return;
            }
            
            // Upload compressed image (don't await here to allow concurrent uploads)
            uploadPhoto(compressedUri, index).catch((error: any) => {
                // Error is already handled in uploadPhoto, but ensure state is reset
                console.error('Upload promise rejected:', error);
            });
        }
    };

    const uploadPhoto = async (localUri: string, index: number) => {
        // Add timeout to prevent infinite uploading states (60 seconds)
        const timeoutId = setTimeout(() => {
            console.error(`⏱️ Upload timeout for index ${index} after 60 seconds`);
            setPhotos(prevPhotos => {
                const newPhotos = [...prevPhotos];
                // Only reset if still uploading (not already completed)
                if (newPhotos[index]?.isUploading) {
                    newPhotos[index] = { 
                        uri: newPhotos[index].uri, 
                        fileKey: null, 
                        isUploading: false 
                    };
                }
                return newPhotos;
            });
            uploadInProgressRef.current.delete(index);
            setUploadInProgress(prev => {
                const next = new Set(prev);
                next.delete(index);
                return next;
            });
            Alert.alert('Upload Timeout', 'The upload took too long. Please try again.');
        }, 60000); // 60 second timeout

        try {
            // In dev mode, skip actual upload if not authenticated
            if (__DEV__) {
                const { isAuthenticated } = useAuthStore.getState();
                if (!isAuthenticated) {
                    console.warn('⚠️ Dev mode: Skipping upload (not authenticated)');
                    console.log('ℹ️  Photo will be stored locally for UI testing');
                    clearTimeout(timeoutId);
                    setPhotos(prevPhotos => {
                        const newPhotos = [...prevPhotos];
                        newPhotos[index] = {
                            uri: localUri,
                            fileKey: `dev_${Date.now()}_${index}`, // Mock file key
                            isUploading: false,
                        };
                        return newPhotos;
                    });
                    uploadInProgressRef.current.delete(index);
                    setUploadInProgress(prev => {
                        const next = new Set(prev);
                        next.delete(index);
                        return next;
                    });
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

            // Clear timeout on success
            clearTimeout(timeoutId);

            // 3. Update photo data with file key (success)
            console.log('✅ Upload completed successfully, setting fileKey:', file_key);
            setPhotos(prevPhotos => {
                const newPhotos = [...prevPhotos];
                newPhotos[index] = {
                    uri: localUri,
                    fileKey: file_key,
                    isUploading: false,
                };
                return newPhotos;
            });
            
            // Remove from upload in progress
            uploadInProgressRef.current.delete(index);
            setUploadInProgress(prev => {
                const next = new Set(prev);
                next.delete(index);
                return next;
            });
            
            console.log('✅ Photo state updated, ready for media record creation');
        } catch (error: any) {
            // Clear timeout on error
            clearTimeout(timeoutId);
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
            setPhotos(prevPhotos => {
                const newPhotos = [...prevPhotos];
                newPhotos[index] = { uri: null, fileKey: null, isUploading: false };
                return newPhotos;
            });
            
            // Remove from upload in progress
            uploadInProgressRef.current.delete(index);
            setUploadInProgress(prev => {
                const next = new Set(prev);
                next.delete(index);
                return next;
            });
        }
    };

    const handleNext = async () => {
        // Prevent multiple simultaneous calls
        if (isSubmitting || hasCalledUploadComplete) {
            console.warn('⚠️ Already submitting or upload-complete already called');
            return;
        }

        // Count photos that are selected (either uploaded or uploading)
        const selectedPhotos = photos.filter(p => p.uri !== null);

        if (selectedPhotos.length < 1) {
            Alert.alert('Photo Needed', 'Please select at least 1 photo to continue.');
            return;
        }

        // Check if any photos are still uploading
        const stillUploading = photos.filter(p => p.uri !== null && p.isUploading);
        if (stillUploading.length > 0) {
            Alert.alert(
                'Photos Still Uploading',
                `Please wait for ${stillUploading.length} photo(s) to finish uploading before continuing.`
            );
            return;
        }

        setIsSubmitting(true);
        try {
            // Collect all uploaded photos (with file keys)
            const uploadedPhotos = photos
                .map((photo, index) => ({
                    photo,
                    index,
                }))
                .filter(({ photo }) => photo.fileKey !== null);

            if (uploadedPhotos.length === 0) {
                Alert.alert('No Photos', 'Please wait for photos to finish uploading.');
                setIsSubmitting(false);
                return;
            }

            console.log(`📸 Registering ${uploadedPhotos.length} uploaded photos with backend (batch moderation)...`);

            // NEW: Use batch upload-complete endpoint (triggers moderation)
            const photosBatch = uploadedPhotos.map(({ photo }) => ({
                file_key: photo.fileKey!,
                media_type: 'photo' as const,
            }));

            // Mark as called to prevent duplicates
            setHasCalledUploadComplete(true);

            console.log('📤 Calling upload-complete endpoint with batch:', photosBatch);
            let uploadCompleteResult: any = null;
            try {
                uploadCompleteResult = await UserService.uploadComplete(photosBatch);
                console.log('✅ Upload-complete response:', uploadCompleteResult);
                
                // Update onboarding step to 5 (photos done)
                try {
                    await updateStep(5);
                    console.log('✅ Onboarding step updated to 5');
                } catch (stepError: any) {
                    console.warn('⚠️ Failed to update onboarding step, but continuing:', stepError);
                    // Don't block navigation if step update fails
                }
                
                // Navigate to next step (Video) or status screen
                if (navigation && navigation.navigate) {
                    console.log('🧭 Navigating to Video screen...');
                    navigation.navigate('Video');
                } else {
                    console.error('❌ Navigation not available, trying fallback...');
                    navigateToStatusScreen(uploadCompleteResult);
                }
            } catch (error: any) {
                // Handle 429 rate limit error - photos are already uploaded, so allow continuation
                if (error?.response?.status === 429) {
                    console.warn('⚠️ Rate limit exceeded, but photos are uploaded. Continuing...');
                    const errorMessage = error?.response?.data?.message || 'Maximum 30 photos per 24 hours.';
                    
                    // Update onboarding step even on rate limit (photos are uploaded)
                    try {
                        await updateStep(5);
                        console.log('✅ Onboarding step updated to 5 (despite rate limit)');
                    } catch (stepError: any) {
                        console.warn('⚠️ Failed to update onboarding step:', stepError);
                    }
                    
                    // Navigate to next step anyway (photos are already uploaded to R2)
                    if (navigation && navigation.navigate) {
                        console.log('🧭 Navigating to Video screen (rate limited but continuing)...');
                        navigation.navigate('Video');
                        // Show non-blocking message
                        setTimeout(() => {
                            Alert.alert(
                                'Photo Limit Reached',
                                errorMessage + '\n\nYour photos are uploaded and will be reviewed. You can continue with onboarding.',
                                [{ text: 'OK' }]
                            );
                        }, 500);
                    } else {
                        console.error('❌ Navigation not available');
                        Alert.alert(
                            'Photo Limit Reached',
                            errorMessage + '\n\nYour photos are uploaded. Please continue manually.',
                            [{ text: 'OK' }]
                        );
                    }
                    setIsSubmitting(false);
                    return;
                }
                throw error; // Re-throw other errors
            }
        } catch (error: any) {
            console.error('Submit error:', error);
            setHasCalledUploadComplete(false); // Allow retry on error
            Alert.alert(
                'Error',
                'Failed to save photos. Please try again.\n\n' + (error?.message || 'Unknown error')
            );
        } finally {
            setIsSubmitting(false);
        }
    };

    const navigateToStatusScreen = (uploadCompleteResult: any) => {
        // Extract batch_id from response (axios wraps in .data)
        const batchId = uploadCompleteResult?.batch_id || uploadCompleteResult?.data?.batch_id;
        
        if (!batchId) {
            console.warn('⚠️ No batch_id in response, but continuing...');
        }
        
        // Navigate to status screen - use navigation from props or get it from navigation context
        const navParams = {
            batchId: batchId,
            source: 'onboarding',
        };
        
        console.log('🧭 Navigating to PhotoStatus with params:', navParams);
        
        // Use a small delay to ensure state updates are complete
        setTimeout(() => {
            try {
                // Try to get navigation from parent navigator if available
                const nav = navigation || (navigation as any)?.parent || (navigation as any)?.navigation;
                
                if (nav?.navigate) {
                    console.log('✅ Using navigation.navigate...');
                    nav.navigate('PhotoStatus', navParams);
                } else if (nav?.replace) {
                    console.log('✅ Using navigation.replace...');
                    nav.replace('PhotoStatus', navParams);
                } else if (nav?.push) {
                    console.log('✅ Using navigation.push...');
                    nav.push('PhotoStatus', navParams);
                } else {
                    console.error('❌ No navigation method available');
                    // Fallback: show alert and let user manually navigate
                    Alert.alert(
                        'Photos Uploaded',
                        'Your photos are being reviewed. You can check their status in your profile.',
                        [
                            {
                                text: 'OK',
                                onPress: () => {
                                    // Try to navigate to profile or back
                                    if (nav?.goBack) {
                                        nav.goBack();
                                    }
                                }
                            }
                        ]
                    );
                }
            } catch (navError) {
                console.error('❌ Navigation error:', navError);
                Alert.alert(
                    'Photos Uploaded',
                    'Your photos are being reviewed. Please check your profile to see their status.',
                    [{ text: 'OK' }]
                );
            }
        }, 100);
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
        <View style={styles.container}>
            <StatusBar barStyle="dark-content" backgroundColor={COLORS.background} />
            <SafeAreaView style={styles.safeArea} edges={['bottom']}>
                <ScrollView contentContainerStyle={styles.scrollContent}>
                <BackButton />
                <View style={styles.header}>
                    <Text style={styles.stepIndicator}>Step 5 of {TOTAL_ONBOARDING_STEPS}</Text>
                    <Text style={styles.title}>Add your best photos</Text>
                    <Text style={styles.subtitle}>Upload at least 1 photo to start matching</Text>
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
                        disabled={photos.filter(p => p.fileKey !== null).length < 1 || isSubmitting}
                        isLoading={isSubmitting}
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
