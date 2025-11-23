import React, { useState, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, Image, Dimensions, TouchableOpacity, Pressable } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
    useAnimatedStyle,
    useSharedValue,
    withSpring,
    withTiming,
    runOnJS,
    interpolate,
    Extrapolate,
    useAnimatedReaction,
} from 'react-native-reanimated';
import {
    Gesture,
    GestureDetector,
} from 'react-native-gesture-handler';
import { Video, ResizeMode } from 'expo-av';
import { COLORS, SPACING, SIZES } from '../../theme/colors';
import Svg, { Path, Circle } from 'react-native-svg';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const CARD_WIDTH = SCREEN_WIDTH * 0.9;
// Calculate card height to fit within screen: account for top nav (~60px), progress (~20px), and action buttons (~100px)
// Use 70% of screen height to ensure it stays within bounds
const CARD_HEIGHT = Math.min(SCREEN_HEIGHT * 0.7, SCREEN_HEIGHT - 200);
const SWIPE_THRESHOLD_X = 80; // px for like/nope
const SWIPE_THRESHOLD_Y = 100; // px for super like
const MAX_ROTATION = 15; // degrees

export interface MediaItem {
    id: string;
    url: string;
    media_type: 'photo' | 'video';
    thumbnail_url?: string;
}

export interface Profile {
    id: string;
    name: string;
    age: number;
    city: string;
    distance?: number;
    bio: string;
    photos: MediaItem[];
    video?: MediaItem;
    interests?: string[];
    isVerified: boolean;
}

interface CardProps {
    profile: Profile;
    onSwipe?: (direction: 'left' | 'right' | 'up') => void;
    onSwipeProgress?: (direction: 'left' | 'right' | 'up' | null, progress: number) => void;
    onTranslationXChange?: (translationX: number) => void;
    onTranslationYChange?: (translationY: number) => void;
    index?: number;
    isTopCard?: boolean;
}

// SVG Icons
const HeartIcon = ({ size = 60, color = COLORS.primary }: { size?: number; color?: string }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <Path
            d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"
            fill={color}
            stroke={color}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
        />
    </Svg>
);

const XIcon = ({ size = 60, color = COLORS.error }: { size?: number; color?: string }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <Path
            d="M18 6L6 18M6 6l12 12"
            stroke={color}
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
        />
    </Svg>
);

const StarIcon = ({ size = 60, color = COLORS.info }: { size?: number; color?: string }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <Path
            d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"
            fill={color}
            stroke={color}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
        />
    </Svg>
);

export const SwipeCard: React.FC<CardProps> = React.memo(({ profile, onSwipe, onSwipeProgress, onTranslationXChange, onTranslationYChange, index = 0, isTopCard = false }) => {
    const translateX = useSharedValue(0);
    const translateY = useSharedValue(0);
    const scale = useSharedValue(1);
    const opacity = useSharedValue(1);

    // Expose translateX to parent for button animations
    useAnimatedReaction(
        () => translateX.value,
        (current) => {
            if (onTranslationXChange && isTopCard) {
                runOnJS(onTranslationXChange)(current);
            }
        }
    );

    // Expose translateY to parent for button animations
    useAnimatedReaction(
        () => translateY.value,
        (current) => {
            if (onTranslationYChange && isTopCard) {
                runOnJS(onTranslationYChange)(current);
            }
        }
    );
    const [currentPhotoIndex, setCurrentPhotoIndex] = useState(0);
    const [isVideoPlaying, setIsVideoPlaying] = useState(false);
    const videoRef = React.useRef<Video>(null);

    // Combine photos and video into media array
    const mediaItems = useMemo(() => {
        const items: MediaItem[] = [...profile.photos];
        if (profile.video) {
            items.push(profile.video);
        }
        return items;
    }, [profile.photos, profile.video]);

    const currentMedia = mediaItems[currentPhotoIndex];
    const isVideo = currentMedia?.media_type === 'video';

    // Photo navigation gesture (horizontal swipe on image)
    const photoSwipeGesture = Gesture.Pan()
        .enabled(isTopCard && mediaItems.length > 1)
        .onEnd((event) => {
            if (Math.abs(event.translationX) > 50) {
                if (event.translationX > 0 && currentPhotoIndex > 0) {
                    runOnJS(setCurrentPhotoIndex)(currentPhotoIndex - 1);
                } else if (event.translationX < 0 && currentPhotoIndex < mediaItems.length - 1) {
                    runOnJS(setCurrentPhotoIndex)(currentPhotoIndex + 1);
                }
            }
        });

    // Main swipe gesture
    const panGesture = Gesture.Pan()
        .enabled(isTopCard)
        .onStart(() => {
            // Pause video if playing
            if (isVideo && isVideoPlaying) {
                videoRef.current?.pauseAsync();
            }
        })
        .onUpdate((event) => {
            translateX.value = event.translationX;
            translateY.value = event.translationY;

            // Scale down slightly when dragging
            const distance = Math.sqrt(event.translationX ** 2 + event.translationY ** 2);
            scale.value = 1 - Math.min(distance / 1000, 0.05);
        })
        .onEnd((event) => {
            // Reset swipe progress
            if (onSwipeProgress && isTopCard) {
                runOnJS(onSwipeProgress)(null, 0);
            }

            const absX = Math.abs(translateX.value);
            const absY = Math.abs(translateY.value);
            const velocityX = Math.abs(event.velocityX);
            const velocityY = Math.abs(event.velocityY);

            // Check for super like (swipe up)
            if (absY > absX && translateY.value < -SWIPE_THRESHOLD_Y || velocityY > 500) {
                translateY.value = withSpring(-SCREEN_HEIGHT * 2, {
                    damping: 20,
                    stiffness: 90,
                });
                opacity.value = withSpring(0);
                if (onSwipe) runOnJS(onSwipe)('up');
                return;
            }

            // Check for like (swipe right)
            if (translateX.value > SWIPE_THRESHOLD_X || (translateX.value > 0 && velocityX > 500)) {
                translateX.value = withSpring(SCREEN_WIDTH * 2, {
                    damping: 20,
                    stiffness: 90,
                });
                opacity.value = withSpring(0);
                if (onSwipe) runOnJS(onSwipe)('right');
                return;
            }

            // Check for nope (swipe left)
            if (translateX.value < -SWIPE_THRESHOLD_X || (translateX.value < 0 && velocityX > 500)) {
                translateX.value = withSpring(-SCREEN_WIDTH * 2, {
                    damping: 20,
                    stiffness: 90,
                });
                opacity.value = withSpring(0);
                if (onSwipe) runOnJS(onSwipe)('left');
                return;
            }

            // Spring back to center
            translateX.value = withSpring(0, {
                damping: 15,
                stiffness: 150,
            });
            translateY.value = withSpring(0, {
                damping: 15,
                stiffness: 150,
            });
            scale.value = withSpring(1, {
                damping: 15,
                stiffness: 150,
            });
        });

    const composedGesture = Gesture.Simultaneous(photoSwipeGesture, panGesture);

    // Animated styles
    const cardStyle = useAnimatedStyle(() => {
        const rotation = interpolate(
            translateX.value,
            [-SCREEN_WIDTH, 0, SCREEN_WIDTH],
            [-MAX_ROTATION, 0, MAX_ROTATION],
            Extrapolate.CLAMP
        );

        return {
            transform: [
                { translateX: translateX.value },
                { translateY: translateY.value },
                { scale: scale.value },
                { rotateZ: `${rotation}deg` },
            ],
            opacity: opacity.value,
        };
    });

    // Overlay styles
    const likeOverlayStyle = useAnimatedStyle(() => {
        const progress = interpolate(
            translateX.value,
            [0, SWIPE_THRESHOLD_X],
            [0, 1],
            Extrapolate.CLAMP
        );
        return {
            opacity: progress * 0.8,
            transform: [{ scale: 0.8 + progress * 0.2 }],
        };
    });

    const nopeOverlayStyle = useAnimatedStyle(() => {
        const progress = interpolate(
            translateX.value,
            [-SWIPE_THRESHOLD_X, 0],
            [1, 0],
            Extrapolate.CLAMP
        );
        return {
            opacity: progress * 0.8,
            transform: [{ scale: 0.8 + progress * 0.2 }],
        };
    });

    const superLikeOverlayStyle = useAnimatedStyle(() => {
        const progress = interpolate(
            translateY.value,
            [-SWIPE_THRESHOLD_Y, 0],
            [1, 0],
            Extrapolate.CLAMP
        );
        return {
            opacity: progress * 0.8,
            transform: [{ scale: 0.8 + progress * 0.2 }],
        };
    });

    // Handle photo tap navigation - cycle through photos
    const handlePhotoTap = useCallback(() => {
        if (!isTopCard || mediaItems.length <= 1) return;

        // Cycle to next photo, wrap around to first if at the end
        setCurrentPhotoIndex((prev) => (prev + 1) % mediaItems.length);
    }, [mediaItems.length, isTopCard]);

    // Handle video playback
    React.useEffect(() => {
        if (isVideo && isTopCard && currentPhotoIndex === mediaItems.length - 1) {
            videoRef.current?.playAsync();
            setIsVideoPlaying(true);
        } else {
            videoRef.current?.pauseAsync();
            setIsVideoPlaying(false);
        }
    }, [isVideo, isTopCard, currentPhotoIndex, mediaItems.length]);

    // Format distance
    const distanceText = profile.distance
        ? `${Math.round(profile.distance)}km away`
        : profile.city;

    return (
        <GestureDetector gesture={composedGesture}>
            <Animated.View style={[styles.container, cardStyle]}>
                <Pressable onPress={handlePhotoTap} style={styles.mediaContainer}>
                    {isVideo ? (
                        <Video
                            ref={videoRef}
                            source={{ uri: currentMedia.url }}
                            style={styles.media}
                            resizeMode={ResizeMode.COVER}
                            isLooping
                            isMuted
                            shouldPlay={isVideoPlaying && isTopCard}
                        />
                    ) : (
                        <Image
                            source={{ uri: currentMedia?.url || currentMedia?.thumbnail_url }}
                            style={styles.media}
                            resizeMode="cover"
                        />
                    )}

                    {/* Photo dots indicator */}
                    {mediaItems.length > 1 && (
                        <View style={styles.dotsContainer}>
                            {mediaItems.map((_, idx) => (
                                <View
                                    key={idx}
                                    style={[
                                        styles.dot,
                                        idx === currentPhotoIndex && styles.dotActive,
                                    ]}
                                />
                            ))}
                        </View>
                    )}

                    {/* Video mute indicator */}
                    {isVideo && (
                        <View style={styles.videoIndicator}>
                            <Text style={styles.videoText}>VIDEO</Text>
                        </View>
                    )}
                </Pressable>

                {/* Bottom gradient overlay */}
                <LinearGradient
                    colors={['transparent', 'rgba(0,0,0,0.4)', 'rgba(0,0,0,0.95)']}
                    style={styles.gradient}
                />

                {/* LIKE Overlay */}
                <Animated.View style={[styles.overlay, styles.likeOverlay, likeOverlayStyle]}>
                    <View style={styles.stampContainer}>
                        <HeartIcon size={80} color={COLORS.primary} />
                        <Text style={[styles.stampText, { color: COLORS.primary }]}>LIKE</Text>
                    </View>
                </Animated.View>

                {/* NOPE Overlay */}
                <Animated.View style={[styles.overlay, styles.nopeOverlay, nopeOverlayStyle]}>
                    <View style={styles.stampContainer}>
                        <XIcon size={80} color={COLORS.error} />
                        <Text style={[styles.stampText, { color: COLORS.error }]}>NOPE</Text>
                    </View>
                </Animated.View>

                {/* SUPER LIKE Overlay */}
                <Animated.View style={[styles.overlay, styles.superLikeOverlay, superLikeOverlayStyle]}>
                    <View style={styles.stampContainer}>
                        <StarIcon size={80} color={COLORS.info} />
                        <Text style={[styles.stampText, { color: COLORS.primary }]}>SUPER LIKE</Text>
                    </View>
                </Animated.View>

                {/* Info Container */}
                <View style={styles.infoContainer}>
                    {/* Nearby Badge - Bottom Left */}
                    <View style={styles.nearbyBadge}>
                        <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
                            <Path
                                d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"
                                fill={COLORS.primary}
                            />
                            <Circle cx="12" cy="10" r="3" fill={COLORS.background} />
                        </Svg>
                        <Text style={styles.nearbyText}>Nearby</Text>
                    </View>

                    {/* Scroll Indicator - Bottom Right */}
                    <TouchableOpacity style={styles.scrollIndicator} activeOpacity={0.7}>
                        <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
                            <Path
                                d="M7 14l5-5 5 5"
                                stroke={COLORS.background}
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                            />
                        </Svg>
                    </TouchableOpacity>

                    {/* Name and Age */}
                    <Text style={styles.name}>
                        {profile.name} {profile.age}
                    </Text>

                    {/* Location */}
                    <View style={styles.locationRow}>
                        <Svg width={14} height={14} viewBox="0 0 24 24" fill="none">
                            <Path
                                d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"
                                fill="#A0A0A0"
                            />
                            <Circle cx="12" cy="10" r="3" fill={COLORS.background} />
                        </Svg>
                        <Text style={styles.location}>{Math.round(profile.distance || 0)} km away</Text>
                    </View>
                </View>
            </Animated.View>
        </GestureDetector>
    );
});

SwipeCard.displayName = 'SwipeCard';

const styles = StyleSheet.create({
    container: {
        width: '100%',
        height: '100%',
        borderRadius: 16,
        backgroundColor: COLORS.surface,
        overflow: 'hidden',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.3,
        shadowRadius: 12,
        elevation: 12,
    },
    mediaContainer: {
        width: '100%',
        height: '100%',
        position: 'relative',
    },
    media: {
        width: '100%',
        height: '100%',
    },
    dotsContainer: {
        position: 'absolute',
        top: SPACING.m,
        left: 0,
        right: 0,
        flexDirection: 'row',
        justifyContent: 'center',
        gap: SPACING.xs,
        zIndex: 5,
    },
    dot: {
        width: 6,
        height: 6,
        borderRadius: 3,
        backgroundColor: 'rgba(255,255,255,0.4)',
    },
    dotActive: {
        backgroundColor: COLORS.textPrimary,
        width: 24,
    },
    videoIndicator: {
        position: 'absolute',
        top: SPACING.m,
        right: SPACING.m,
        backgroundColor: 'rgba(0,0,0,0.6)',
        paddingHorizontal: SPACING.s,
        paddingVertical: SPACING.xs,
        borderRadius: SIZES.radiusS,
        zIndex: 5,
    },
    videoText: {
        color: COLORS.textPrimary,
        fontSize: 10,
        fontWeight: 'bold',
        letterSpacing: 1,
    },
    gradient: {
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        height: '50%',
    },
    overlay: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 10,
        pointerEvents: 'none',
    },
    likeOverlay: {
        borderWidth: 4,
        borderColor: COLORS.primary,
    },
    nopeOverlay: {
        borderWidth: 4,
        borderColor: COLORS.error,
    },
    superLikeOverlay: {
        borderWidth: 4,
        borderColor: COLORS.info,
    },
    stampContainer: {
        alignItems: 'center',
        gap: SPACING.s,
    },
    stampText: {
        fontSize: 32,
        fontWeight: '900',
        letterSpacing: 2,
        textShadowColor: 'rgba(0,0,0,0.8)',
        textShadowOffset: { width: 0, height: 2 },
        textShadowRadius: 8,
    },
    infoContainer: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        paddingBottom: 150, // Moved up to clear action buttons
        paddingHorizontal: SPACING.l,
        zIndex: 5,
    },
    nearbyBadge: {
        position: 'absolute',
        bottom: 220,
        left: SPACING.l,
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(0,0,0,0.6)',
        paddingHorizontal: SPACING.s,
        paddingVertical: SPACING.xs,
        borderRadius: 12,
        gap: 4,
    },
    nearbyText: {
        color: COLORS.textPrimary,
        fontSize: 12,
        fontWeight: '600',
    },
    scrollIndicator: {
        position: 'absolute',
        bottom: 220,
        right: SPACING.l,
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: COLORS.textPrimary,
        alignItems: 'center',
        justifyContent: 'center',
    },
    name: {
        fontSize: 36,
        fontWeight: '900',
        color: COLORS.textPrimary,
        marginBottom: SPACING.xs,
        textShadowColor: 'rgba(0,0,0,0.5)',
        textShadowOffset: { width: 0, height: 1 },
        textShadowRadius: 3,
    },
    locationRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
    },
    location: {
        fontSize: 14,
        color: COLORS.textSecondary,
    },
});
