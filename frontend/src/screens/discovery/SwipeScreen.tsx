import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { View, StyleSheet, Dimensions, TouchableOpacity, Text, ActivityIndicator, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withSpring,
    withTiming,
    runOnJS,
    interpolate,
    Extrapolate,
} from 'react-native-reanimated';
import { triggerHaptic } from '../../utils/haptics';
import { SwipeCard, Profile, MediaItem } from '../../components/discovery/SwipeCard';
import { MatchModal } from '../../components/discovery/MatchModal';
import { COLORS, SPACING, SIZES } from '../../theme/colors';
import { DiscoveryService } from '../../api/services';
import { EmptyState } from '../../components/ui/EmptyState';
import Svg, { Path, Circle } from 'react-native-svg';

const { width, height } = Dimensions.get('window');
const CARD_OFFSET = 8;
const CARD_SCALE_DIFF = 0.05;
const MAX_CARDS_VISIBLE = 3;
const SWIPE_THRESHOLD_X = 80; // px for like/nope
const SWIPE_THRESHOLD_Y = 100; // px for super like

// Action Button Icons
const HeartIcon = ({ size = 28, color = COLORS.primary }: { size?: number; color?: string }) => (
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

const XIcon = ({ size = 28, color = COLORS.error }: { size?: number; color?: string }) => (
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

const StarIcon = ({ size = 28, color = COLORS.info }: { size?: number; color?: string }) => (
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

const RewindIcon = ({ size = 24, color = '#FF6B35' }: { size?: number; color?: string }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <Path
            d="M11 19l-7-7 7-7M18 19l-7-7 7-7"
            stroke={color}
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
        />
    </Svg>
);

const BoostIcon = ({ size = 24, color = '#87CEEB' }: { size?: number; color?: string }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <Path
            d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"
            stroke={color}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
        />
    </Svg>
);

interface SwipeCardData {
    user: {
        id: string;
        name: string;
        age: number;
        city: string;
        bio: string;
        is_verified?: boolean;
    };
    photos: Array<{
        id: string;
        url: string;
        media_type: 'photo' | 'video';
        thumbnail_url?: string;
        display_order?: number;
    }>;
    video?: {
        id: string;
        url: string;
        media_type: 'video';
        thumbnail_url?: string;
    };
    distance: number;
}

export const SwipeScreen = () => {
    const [cards, setCards] = useState<Profile[]>([]);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [matchModalVisible, setMatchModalVisible] = useState(false);
    const [matchedUser, setMatchedUser] = useState<{ id: string; name: string; photos?: Array<{ url: string }> } | null>(null);
    const [coinBalance, setCoinBalance] = useState(120);
    const [activeTab, setActiveTab] = useState<'forYou' | 'doubleDate'>('forYou');
    const [swipeDirection, setSwipeDirection] = useState<'left' | 'right' | 'up' | null>(null);
    const [swipeProgress, setSwipeProgress] = useState(0);

    // Shared values for button animations (Reanimated 3 worklets for 60fps)
    const cardTranslationX = useSharedValue(0);
    const cardTranslationY = useSharedValue(0);
    const isSwipeComplete = useSharedValue(false);
    const hapticTriggered = useSharedValue(false);

    // Preload images for next cards
    useEffect(() => {
        if (cards.length > 0) {
            const nextCards = cards.slice(currentIndex, currentIndex + 5);
            nextCards.forEach((card) => {
                card.photos.forEach((photo) => {
                    Image.prefetch(photo.url).catch(() => { });
                });
            });
        }
    }, [cards, currentIndex]);

    // Mock data for development
    const getMockProfiles = (): Profile[] => {
        return [
            {
                id: 'mock-1',
                name: 'Selam',
                age: 23,
                city: 'Addis Ababa, Bole',
                distance: 2.5,
                bio: 'Coffee lover ☕️ & Art enthusiast. Looking for someone to explore new galleries with. Love Ethiopian jazz and traditional music!',
                photos: [
                    {
                        id: 'photo-1-1',
                        url: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=800&h=1200&fit=crop',
                        media_type: 'photo',
                    },
                    {
                        id: 'photo-1-2',
                        url: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=800&h=1200&fit=crop',
                        media_type: 'photo',
                    },
                    {
                        id: 'photo-1-3',
                        url: 'https://images.unsplash.com/photo-1529626455594-4ff0802cfb7e?w=800&h=1200&fit=crop',
                        media_type: 'photo',
                    },
                    {
                        id: 'photo-1-4',
                        url: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=800&h=1200&fit=crop',
                        media_type: 'photo',
                    },
                    {
                        id: 'photo-1-5',
                        url: 'https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?w=800&h=1200&fit=crop',
                        media_type: 'photo',
                    },
                ],
                isVerified: true,
            },
            {
                id: 'mock-2',
                name: 'Dawit',
                age: 26,
                city: 'Addis Ababa, Piassa',
                distance: 5.2,
                bio: 'Software engineer by day, musician by night 🎸. Let\'s make some noise! Always up for a good conversation over buna.',
                photos: [
                    {
                        id: 'photo-2-1',
                        url: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=800&h=1200&fit=crop',
                        media_type: 'photo',
                    },
                    {
                        id: 'photo-2-2',
                        url: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=800&h=1200&fit=crop',
                        media_type: 'photo',
                    },
                    {
                        id: 'photo-2-3',
                        url: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=800&h=1200&fit=crop',
                        media_type: 'photo',
                    },
                    {
                        id: 'photo-2-4',
                        url: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=800&h=1200&fit=crop',
                        media_type: 'photo',
                    },
                ],
                isVerified: false,
            },
            {
                id: 'mock-3',
                name: 'Tigist',
                age: 25,
                city: 'Addis Ababa, Bole',
                distance: 1.8,
                bio: 'Fashion designer & foodie 🍲. Always up for trying new restaurants! Love exploring Addis and finding hidden gems.',
                photos: [
                    {
                        id: 'photo-3-1',
                        url: 'https://images.unsplash.com/photo-1531123897727-8f129e1688ce?w=800&h=1200&fit=crop',
                        media_type: 'photo',
                    },
                    {
                        id: 'photo-3-2',
                        url: 'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?w=800&h=1200&fit=crop',
                        media_type: 'photo',
                    },
                    {
                        id: 'photo-3-3',
                        url: 'https://images.unsplash.com/photo-1488426862026-3ee34a7d66df?w=800&h=1200&fit=crop',
                        media_type: 'photo',
                    },
                    {
                        id: 'photo-3-4',
                        url: 'https://images.unsplash.com/photo-1508214751196-bcfd4ca60f91?w=800&h=1200&fit=crop',
                        media_type: 'photo',
                    },
                    {
                        id: 'photo-3-5',
                        url: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=800&h=1200&fit=crop',
                        media_type: 'photo',
                    },
                    {
                        id: 'photo-3-6',
                        url: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=800&h=1200&fit=crop',
                        media_type: 'photo',
                    },
                ],
                isVerified: true,
            },
            {
                id: 'mock-4',
                name: 'Yonas',
                age: 28,
                city: 'Addis Ababa, CMC',
                distance: 7.3,
                bio: 'Photographer capturing the beauty of Ethiopia 📸. Love hiking, nature, and good vibes. Let\'s explore together!',
                photos: [
                    {
                        id: 'photo-4-1',
                        url: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=800&h=1200&fit=crop',
                        media_type: 'photo',
                    },
                    {
                        id: 'photo-4-2',
                        url: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=800&h=1200&fit=crop',
                        media_type: 'photo',
                    },
                    {
                        id: 'photo-4-3',
                        url: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=800&h=1200&fit=crop',
                        media_type: 'photo',
                    },
                    {
                        id: 'photo-4-4',
                        url: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=800&h=1200&fit=crop',
                        media_type: 'photo',
                    },
                ],
                isVerified: false,
            },
            {
                id: 'mock-5',
                name: 'Meron',
                age: 24,
                city: 'Addis Ababa, Bole',
                distance: 3.1,
                bio: 'Medical student with a passion for travel ✈️. Love reading, dancing, and meeting new people. Always down for an adventure!',
                photos: [
                    {
                        id: 'photo-5-1',
                        url: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=800&h=1200&fit=crop',
                        media_type: 'photo',
                    },
                    {
                        id: 'photo-5-2',
                        url: 'https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?w=800&h=1200&fit=crop',
                        media_type: 'photo',
                    },
                    {
                        id: 'photo-5-3',
                        url: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=800&h=1200&fit=crop',
                        media_type: 'photo',
                    },
                    {
                        id: 'photo-5-4',
                        url: 'https://images.unsplash.com/photo-1529626455594-4ff0802cfb7e?w=800&h=1200&fit=crop',
                        media_type: 'photo',
                    },
                    {
                        id: 'photo-5-5',
                        url: 'https://images.unsplash.com/photo-1531123897727-8f129e1688ce?w=800&h=1200&fit=crop',
                        media_type: 'photo',
                    },
                ],
                isVerified: true,
            },
            {
                id: 'mock-6',
                name: 'Bereket',
                age: 27,
                city: 'Addis Ababa, Kazanchis',
                distance: 4.5,
                bio: 'Entrepreneur building the future 🚀. Love tech, startups, and good conversations. Coffee enthusiast and bookworm.',
                photos: [
                    {
                        id: 'photo-6-1',
                        url: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=800&h=1200&fit=crop',
                        media_type: 'photo',
                    },
                    {
                        id: 'photo-6-2',
                        url: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=800&h=1200&fit=crop',
                        media_type: 'photo',
                    },
                    {
                        id: 'photo-6-3',
                        url: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=800&h=1200&fit=crop',
                        media_type: 'photo',
                    },
                    {
                        id: 'photo-6-4',
                        url: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=800&h=1200&fit=crop',
                        media_type: 'photo',
                    },
                ],
                isVerified: false,
            },
        ];
    };

    // Load profiles
    const loadProfiles = useCallback(async () => {
        try {
            setIsLoading(true);
            setError(null);
            const response = await DiscoveryService.getSwipeCards();
            const cardData: SwipeCardData[] = response.cards || [];

            // If no cards from API, use mock data
            if (cardData.length === 0) {
                console.log('No cards from API, using mock data');
                const mockProfiles = getMockProfiles();
                setCards(mockProfiles);
                setCurrentIndex(0);
                setIsLoading(false);
                return;
            }

            // Transform API response to Profile format
            const profiles: Profile[] = cardData.map((card) => {
                // Sort photos by display_order if available
                const sortedPhotos = [...card.photos].sort((a, b) => {
                    const orderA = a.display_order || 0;
                    const orderB = b.display_order || 0;
                    return orderA - orderB;
                });

                const photos: MediaItem[] = sortedPhotos.map((p) => ({
                    id: p.id,
                    url: p.url,
                    media_type: p.media_type,
                    thumbnail_url: p.thumbnail_url,
                }));

                if (card.video) {
                    return {
                        id: card.user.id,
                        name: card.user.name,
                        age: card.user.age,
                        city: card.user.city,
                        distance: card.distance,
                        bio: card.user.bio || '',
                        photos,
                        video: {
                            id: card.video.id,
                            url: card.video.url,
                            media_type: 'video',
                            thumbnail_url: card.video.thumbnail_url,
                        },
                        isVerified: card.user.is_verified || false,
                    };
                }

                return {
                    id: card.user.id,
                    name: card.user.name,
                    age: card.user.age,
                    city: card.user.city,
                    distance: card.distance,
                    bio: card.user.bio || '',
                    photos,
                    isVerified: card.user.is_verified || false,
                };
            });

            setCards(profiles);
            setCurrentIndex(0);
        } catch (err: any) {
            // On error (404, network error, etc.), use mock data
            console.warn('API error, using mock data:', err.message);
            const mockProfiles = getMockProfiles();
            setCards(mockProfiles);
            setCurrentIndex(0);
            setError(null); // Don't show error, just use mock data
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        loadProfiles();
    }, [loadProfiles]);

    // Handle swipe action
    const handleSwipe = useCallback(async (direction: 'left' | 'right' | 'up') => {
        const currentProfile = cards[currentIndex];
        if (!currentProfile) return;

        // Mark swipe as complete for button animation
        isSwipeComplete.value = true;

        // After 300ms, reset and move to next card
        setTimeout(() => {
            isSwipeComplete.value = false;
            cardTranslationX.value = 0;
        }, 300);

        // Haptic feedback
        if (direction === 'right') {
            triggerHaptic.impact();
        } else if (direction === 'left') {
            triggerHaptic.impact();
        } else {
            triggerHaptic.notification();
        }

        // Check if this is mock data
        const isMockData = currentProfile.id.startsWith('mock-');

        if (!isMockData) {
            try {
                // Map direction to action
                const action = direction === 'left' ? 'pass' : direction === 'right' ? 'like' : 'super_like';

                // Send swipe to backend
                const response = await DiscoveryService.swipeAction(currentProfile.id, action);

                // Check for match
                if (response.match && response.user) {
                    setMatchedUser({
                        id: response.user.id || currentProfile.id,
                        name: response.user.name || currentProfile.name,
                        photos: response.user.photos || currentProfile.photos.map(p => ({ url: p.url })),
                    });
                    setMatchModalVisible(true);
                    triggerHaptic.notification();
                }
            } catch (err: any) {
                console.error('Swipe error:', err);
                // Continue to next card even if API fails
            }
        } else {
            // For mock data, simulate occasional matches (20% chance on like)
            if (direction === 'right' && Math.random() < 0.2) {
                setMatchedUser({
                    id: currentProfile.id,
                    name: currentProfile.name,
                    photos: currentProfile.photos.map(p => ({ url: p.url })),
                });
                setMatchModalVisible(true);
                triggerHaptic.notification();
            }
        }

        // Reset swipe state
        setSwipeDirection(null);
        setSwipeProgress(0);

        // Move to next card
        if (currentIndex < cards.length - 1) {
            setCurrentIndex(currentIndex + 1);
        } else {
            // Load more profiles (will use mock data if API fails)
            await loadProfiles();
        }
    }, [cards, currentIndex, loadProfiles]);

    // Action button handlers
    const handleLike = useCallback(() => {
        handleSwipe('right');
    }, [handleSwipe]);

    const handleNope = useCallback(() => {
        handleSwipe('left');
    }, [handleSwipe]);

    const handleSuperLike = useCallback(() => {
        handleSwipe('up');
    }, [handleSwipe]);

    // Match modal handlers
    const handleSendMessage = useCallback(() => {
        setMatchModalVisible(false);
        // Navigate to chat - TODO: implement navigation
    }, []);

    const handleKeepSwiping = useCallback(() => {
        setMatchModalVisible(false);
    }, []);

    // Get visible cards (up to 3)
    const visibleCards = useMemo(() => {
        return cards.slice(currentIndex, currentIndex + MAX_CARDS_VISIBLE);
    }, [cards, currentIndex]);

    // Handle swipe progress from card
    const handleSwipeProgress = useCallback((direction: 'left' | 'right' | 'up' | null, progress: number) => {
        setSwipeDirection(direction);
        setSwipeProgress(progress);
    }, []);

    // Handle card translation changes for button animations
    const handleTranslationXChange = useCallback((translationX: number) => {
        cardTranslationX.value = translationX;

        // Trigger haptic feedback the moment drag starts
        if (!hapticTriggered.value) {
            if (translationX <= -1 || translationX >= 1) {
                hapticTriggered.value = true;
                triggerHaptic.impact();
            }
        }

        // Reset haptic trigger when back to center
        if (translationX === 0) {
            hapticTriggered.value = false;
        }
    }, []);

    const handleTranslationYChange = useCallback((translationY: number) => {
        cardTranslationY.value = translationY;

        // Trigger haptic feedback for swipe up
        if (!hapticTriggered.value) {
            if (translationY <= -1) {
                hapticTriggered.value = true;
                triggerHaptic.impact();
            }
        }

        // Reset haptic trigger when back to center
        if (translationY === 0) {
            hapticTriggered.value = false;
        }
    }, []);

    // Action Button Component - Simple hide/show and scale animation
    const ActionButton = React.memo(({
        type,
        onPress,
        icon,
        color,
        size = 60,
    }: {
        type: 'like' | 'nope' | 'superlike' | 'rewind';
        onPress: () => void;
        icon: React.ReactNode;
        color: string;
        size?: number;
    }) => {
        // Shared values for button animation
        const buttonScale = useSharedValue(1);
        const buttonOpacity = useSharedValue(1);

        // Animated style using Reanimated 3 worklets (60fps)
        const animatedStyle = useAnimatedStyle(() => {
            const cardXValue = cardTranslationX.value;
            const cardYValue = cardTranslationY.value;

            // Determine swipe direction
            const isLeftSwipe = cardXValue <= -1;
            const isRightSwipe = cardXValue >= 1;
            const isUpSwipe = cardYValue <= -1;

            // Calculate progress (0 to 1)
            let progress = 0;
            if (type === 'nope' && isLeftSwipe) {
                progress = Math.min(Math.abs(cardXValue) / SWIPE_THRESHOLD_X, 1);
            } else if (type === 'like' && isRightSwipe) {
                progress = Math.min(cardXValue / SWIPE_THRESHOLD_X, 1);
            } else if (type === 'superlike' && isUpSwipe) {
                progress = Math.min(Math.abs(cardYValue) / SWIPE_THRESHOLD_Y, 1);
            }

            // Hide other buttons when swiping
            if (type === 'nope' && (isRightSwipe || isUpSwipe)) {
                // Hide X when swiping right or up
                buttonOpacity.value = withTiming(0, { duration: 200 });
                buttonScale.value = withSpring(1, { damping: 15, stiffness: 200 });
            } else if (type === 'like' && (isLeftSwipe || isUpSwipe)) {
                // Hide Heart when swiping left or up
                buttonOpacity.value = withTiming(0, { duration: 200 });
                buttonScale.value = withSpring(1, { damping: 15, stiffness: 200 });
            } else if (type === 'superlike' && (isLeftSwipe || isRightSwipe)) {
                // Hide Super Like when swiping left or right
                buttonOpacity.value = withTiming(0, { duration: 200 });
                buttonScale.value = withSpring(1, { damping: 15, stiffness: 200 });
            } else if (type === 'rewind' && (isLeftSwipe || isRightSwipe || isUpSwipe)) {
                // Hide Rewind when swiping in any direction
                buttonOpacity.value = withTiming(0, { duration: 200 });
                buttonScale.value = withSpring(1, { damping: 15, stiffness: 200 });
            } else if ((type === 'nope' && isLeftSwipe) || (type === 'like' && isRightSwipe) || (type === 'superlike' && isUpSwipe)) {
                // Active button: keep visible and scale up smoothly
                buttonOpacity.value = withTiming(1, { duration: 200 });
                // Scale from 1 to 1.3 based on progress
                buttonScale.value = withSpring(1 + progress * 0.3, { damping: 15, stiffness: 200 });
            } else {
                // No swipe: return to normal
                buttonOpacity.value = withTiming(1, { duration: 200 });
                buttonScale.value = withSpring(1, { damping: 15, stiffness: 200 });
            }

            return {
                transform: [{ scale: buttonScale.value }],
                opacity: buttonOpacity.value,
            };
        }, [type]);

        const handlePressIn = () => {
            buttonScale.value = withSpring(0.9, { damping: 10 });
            triggerHaptic.impact();
        };

        const handlePressOut = () => {
            buttonScale.value = withSpring(1, { damping: 10 });
        };

        return (
            <TouchableOpacity
                onPress={onPress}
                onPressIn={handlePressIn}
                onPressOut={handlePressOut}
                activeOpacity={0.9}
                disabled={cardTranslationX.value !== 0}
            >
                <Animated.View
                    style={[
                        styles.actionButton,
                        {
                            width: size,
                            height: size,
                            borderRadius: size / 2,
                        },
                        animatedStyle,
                    ]}
                >
                    {icon}
                </Animated.View>
            </TouchableOpacity>
        );
    });

    ActionButton.displayName = 'ActionButton';

    // Calculate progress (how many cards swiped through)
    const progressLines = 10; // Total progress lines
    const filledLines = Math.min(Math.floor((currentIndex / Math.max(cards.length, 1)) * progressLines), progressLines);

    return (
        <SafeAreaView style={styles.container} edges={['top']}>
            {/* Top Navigation */}
            <View style={styles.topNav}>
                {/* Filter/Sort Icons */}
                <View style={styles.filterIcons}>
                    <TouchableOpacity style={styles.filterButton}>
                        <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
                            <Path
                                d="M3 6h18M7 12h10M11 18h2"
                                stroke={COLORS.textSecondary}
                                strokeWidth="2"
                                strokeLinecap="round"
                            />
                        </Svg>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.filterButton}>
                        <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
                            <Path
                                d="M3 6h6M7 12h10M11 18h6"
                                stroke={COLORS.textSecondary}
                                strokeWidth="2"
                                strokeLinecap="round"
                            />
                        </Svg>
                    </TouchableOpacity>
                </View>

                {/* Tabs */}
                <View style={styles.tabsContainer}>
                    <TouchableOpacity
                        style={[styles.tab, activeTab === 'forYou' && styles.tabActive]}
                        onPress={() => setActiveTab('forYou')}
                    >
                        <Text style={[styles.tabText, activeTab === 'forYou' && styles.tabTextActive]}>
                            For You
                        </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[styles.tab, activeTab === 'doubleDate' && styles.tabActive]}
                        onPress={() => setActiveTab('doubleDate')}
                    >
                        <Text style={[styles.tabText, activeTab === 'doubleDate' && styles.tabTextActive]}>
                            Double Date
                        </Text>
                    </TouchableOpacity>
                </View>
            </View>

            {/* Progress Indicator */}
            {cards.length > 0 && (
                <View style={styles.progressContainer}>
                    {Array.from({ length: progressLines }).map((_, index) => (
                        <View
                            key={index}
                            style={[
                                styles.progressLine,
                                index < filledLines && styles.progressLineFilled,
                            ]}
                        />
                    ))}
                </View>
            )}

            {/* Card Container */}
            <View style={styles.cardContainer}>
                {isLoading ? (
                    <View style={styles.loadingContainer}>
                        <ActivityIndicator size="large" color={COLORS.primary} />
                    </View>
                ) : error ? (
                    <EmptyState
                        icon="😕"
                        title="Oops!"
                        message={error}
                        actionLabel="Try Again"
                        onAction={loadProfiles}
                    />
                ) : cards.length === 0 ? (
                    <EmptyState
                        icon="🔍"
                        title="No more lijoch around you"
                        message="Check back soon for new matches!"
                        actionLabel="Refresh"
                        onAction={loadProfiles}
                    />
                ) : (
                    visibleCards.map((profile, index) => {
                        const cardIndex = currentIndex + index;
                        const isTopCard = index === 0;
                        const zIndex = MAX_CARDS_VISIBLE - index;
                        const scale = 1 - (index * CARD_SCALE_DIFF);
                        const translateY = index * CARD_OFFSET;
                        const opacity = 1 - (index * 0.15);

                        return (
                            <Animated.View
                                key={profile.id}
                                style={[
                                    styles.cardWrapper,
                                    {
                                        zIndex,
                                        transform: [
                                            { scale },
                                            { translateY },
                                        ],
                                        opacity,
                                    },
                                ]}
                            >
                                <SwipeCard
                                    profile={profile}
                                    index={cardIndex}
                                    isTopCard={isTopCard}
                                    onSwipe={isTopCard ? handleSwipe : undefined}
                                    onSwipeProgress={isTopCard ? handleSwipeProgress : undefined}
                                    onTranslationXChange={isTopCard ? handleTranslationXChange : undefined}
                                    onTranslationYChange={isTopCard ? handleTranslationYChange : undefined}
                                />
                            </Animated.View>
                        );
                    })
                )}
            </View>

            {/* Action Buttons - 4 buttons */}
            {!isLoading && cards.length > 0 && (
                <View style={styles.actionsContainer}>
                    {/* Nope */}
                    <ActionButton
                        type="nope"
                        icon={<XIcon size={32} color="#FF6B9D" />}
                        color="#FF6B9D"
                        size={64}
                        onPress={handleNope}
                    />

                    {/* Super Like */}
                    <ActionButton
                        type="superlike"
                        icon={<StarIcon size={28} color={COLORS.info} />}
                        color={COLORS.info}
                        size={64}
                        onPress={handleSuperLike}
                    />

                    {/* Like */}
                    <ActionButton
                        type="like"
                        icon={<HeartIcon size={32} color={COLORS.primary} />}
                        color={COLORS.primary}
                        size={64}
                        onPress={handleLike}
                    />

                    {/* Rewind */}
                    <ActionButton
                        type="rewind"
                        icon={<RewindIcon size={20} color="#FF6B35" />}
                        color="#FF6B35"
                        size={50}
                        onPress={() => {
                            if (currentIndex > 0) {
                                setCurrentIndex(currentIndex - 1);
                                triggerHaptic.impact();
                            }
                        }}
                    />
                </View>
            )}

            {/* Match Modal */}
            <MatchModal
                visible={matchModalVisible}
                matchedUser={matchedUser || { id: '', name: '' }}
                onClose={() => setMatchModalVisible(false)}
                onSendMessage={handleSendMessage}
                onKeepSwiping={handleKeepSwiping}
            />
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: COLORS.background,
    },
    topNav: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: SPACING.m,
        paddingVertical: 0,
        gap: SPACING.m,
        height: 50,
    },
    filterIcons: {
        flexDirection: 'row',
        gap: SPACING.s,
    },
    filterButton: {
        width: 36,
        height: 36,
        alignItems: 'center',
        justifyContent: 'center',
    },
    tabsContainer: {
        flex: 1,
        flexDirection: 'row',
        gap: SPACING.s,
    },
    tab: {
        paddingHorizontal: SPACING.m,
        paddingVertical: SPACING.xs,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.2)',
    },
    tabActive: {
        borderColor: COLORS.background,
        backgroundColor: COLORS.background,
    },
    tabText: {
        color: 'rgba(255,255,255,0.6)',
        fontSize: 14,
        fontWeight: '600',
    },
    tabTextActive: {
        color: COLORS.textPrimary,
    },
    progressContainer: {
        flexDirection: 'row',
        paddingHorizontal: SPACING.l,
        paddingVertical: SPACING.s,
        gap: 4,
    },
    progressLine: {
        flex: 1,
        height: 2,
        backgroundColor: 'rgba(255,255,255,0.1)',
        borderRadius: 1,
    },
    progressLineFilled: {
        backgroundColor: 'rgba(255,255,255,0.4)',
    },
    cardContainer: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
    },
    loadingContainer: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    cardWrapper: {
        position: 'absolute',
        width: '100%',
        height: '100%',
        alignItems: 'center',
        justifyContent: 'center',
    },
    actionsContainer: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingBottom: 10,
        paddingTop: 0,
        paddingHorizontal: SPACING.l,
    },
    actionButton: {
        backgroundColor: COLORS.textPrimary,
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.2,
        shadowRadius: 4,
        elevation: 4,
    },
    actionButtonLarge: {
        shadowColor: COLORS.primary,
        shadowOpacity: 0.5,
        shadowRadius: 12,
        elevation: 12,
    },
});
