import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    TouchableOpacity,
    Modal,
    Alert,
    ActivityIndicator,
    Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path, Circle, Polygon, Rect, G, Defs, LinearGradient as SvgLinearGradient, Stop } from 'react-native-svg';
import { COLORS, SPACING, SIZES } from '../../theme/colors';
import { GiftService } from '../../api/services';

const { width } = Dimensions.get('window');
const GIFT_CARD_WIDTH = (width - SPACING.l * 3) / 2;

interface Gift {
    type: string;
    name: string;
    coin_price: number;
    etb_value: number;
    animation_url: string;
    sound_url: string;
}

interface CoinPack {
    id: string;
    name: string;
    etb_price: number;
    coins: number;
}

const COIN_PACKS: CoinPack[] = [
    { id: 'spark', name: 'Spark', etb_price: 55, coins: 600 },
    { id: 'flame', name: 'Flame', etb_price: 110, coins: 1300 },
    { id: 'blaze', name: 'Blaze', etb_price: 275, coins: 3500 },
    { id: 'inferno', name: 'Inferno', etb_price: 550, coins: 8000 },
    { id: 'galaxy', name: 'Galaxy', etb_price: 1100, coins: 18000 },
    { id: 'universe', name: 'Universe', etb_price: 5500, coins: 100000 },
];

export const GiftShopScreen = ({ navigation }: any) => {
    const [gifts, setGifts] = useState<Gift[]>([]);
    const [coinBalance, setCoinBalance] = useState(0);
    const [loading, setLoading] = useState(true);
    const [buyCoinsModalVisible, setBuyCoinsModalVisible] = useState(false);
    const [purchasing, setPurchasing] = useState<string | null>(null);

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        try {
            const [giftsRes, balanceRes] = await Promise.all([
                GiftService.getShop(),
                GiftService.getWalletBalance(),
            ]);
            setGifts(giftsRes.gifts || []);
            setCoinBalance(balanceRes.coin_balance || 0);
        } catch (error: any) {
            console.error('Load data error:', error);
            Alert.alert('Error', 'Failed to load gift shop');
        } finally {
            setLoading(false);
        }
    };

    const handleBuyCoins = async (pack: CoinPack) => {
        setPurchasing(pack.id);
        try {
            const response = await GiftService.buyCoins(pack.id);
            // TODO: Open Telebirr payment URL
            Alert.alert(
                'Payment',
                `Redirecting to payment for ${pack.name} pack (${pack.etb_price} ETB)`,
                [
                    {
                        text: 'Cancel',
                        onPress: () => setPurchasing(null),
                    },
                    {
                        text: 'Pay',
                        onPress: () => {
                            // Open payment URL
                            if (response.payment_url) {
                                // In web: window.open(response.payment_url)
                                // In React Native: Linking.openURL(response.payment_url)
                                Alert.alert('Payment', 'Redirecting to Telebirr...');
                            }
                            setPurchasing(null);
                            setBuyCoinsModalVisible(false);
                        },
                    },
                ]
            );
        } catch (error: any) {
            Alert.alert('Error', error.message || 'Failed to initiate purchase');
            setPurchasing(null);
        }
    };

    const formatCoins = (coins: number) => {
        return new Intl.NumberFormat('en-US').format(coins);
    };

    if (loading) {
        return (
            <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={COLORS.primary} />
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <SafeAreaView style={styles.safeArea} edges={['top']}>
                {/* Header with back button */}
                <View style={styles.topHeader}>
                    <TouchableOpacity
                        style={styles.backButton}
                        onPress={() => navigation.goBack()}
                    >
                        <Text style={styles.backIcon}>←</Text>
                    </TouchableOpacity>
                    <Text style={styles.headerTitle}>Gift Shop</Text>
                    <View style={styles.placeholder} />
                </View>
                <ScrollView contentContainerStyle={styles.scrollContent}>
                    {/* Header with coin balance */}
                    <View style={styles.header}>
                        <View style={styles.balanceCard}>
                            <Text style={styles.balanceLabel}>Your Balance</Text>
                            <Text style={styles.balanceAmount}>
                                {formatCoins(coinBalance)} LC
                            </Text>
                            <Text style={styles.balanceETB}>
                                ≈ {formatCoins(coinBalance * 0.1)} ETB
                            </Text>
                        </View>
                        <TouchableOpacity
                            style={styles.buyCoinsButton}
                            onPress={() => setBuyCoinsModalVisible(true)}
                        >
                            <Text style={styles.buyCoinsButtonText}>Buy Coins</Text>
                        </TouchableOpacity>
                    </View>

                    {/* Gifts Grid */}
                    <View style={styles.giftsGrid}>
                        {gifts.map((gift) => (
                            <TouchableOpacity
                                key={gift.type}
                                style={styles.giftCard}
                                onPress={() => {
                                    // Navigate to gift detail or send gift
                                    navigation.navigate('GiftDetail', { gift });
                                }}
                            >
                                <View style={styles.giftIcon}>
                                    {getGiftIcon(gift.type)}
                                </View>
                                <Text style={styles.giftName}>{gift.name}</Text>
                                <Text style={styles.giftPrice}>
                                    {formatCoins(gift.coin_price)} LC
                                </Text>
                                <Text style={styles.giftETB}>
                                    {gift.etb_value.toFixed(1)} ETB
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </View>
                </ScrollView>
            </SafeAreaView>

            {/* Buy Coins Modal */}
            <Modal
                visible={buyCoinsModalVisible}
                transparent
                animationType="slide"
                onRequestClose={() => setBuyCoinsModalVisible(false)}
            >
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <Text style={styles.modalTitle}>Buy Coins</Text>
                        <ScrollView>
                            {COIN_PACKS.map((pack) => (
                                <TouchableOpacity
                                    key={pack.id}
                                    style={styles.packCard}
                                    onPress={() => handleBuyCoins(pack)}
                                    disabled={purchasing === pack.id}
                                >
                                    <View style={styles.packInfo}>
                                        <Text style={styles.packName}>{pack.name}</Text>
                                        <Text style={styles.packCoins}>
                                            {formatCoins(pack.coins)} LC
                                        </Text>
                                        <Text style={styles.packPrice}>
                                            {pack.etb_price} ETB
                                        </Text>
                                    </View>
                                    {purchasing === pack.id && (
                                        <ActivityIndicator
                                            size="small"
                                            color={COLORS.primary}
                                        />
                                    )}
                                </TouchableOpacity>
                            ))}
                        </ScrollView>
                        <TouchableOpacity
                            style={styles.closeButton}
                            onPress={() => setBuyCoinsModalVisible(false)}
                        >
                            <Text style={styles.closeButtonText}>Close</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>
        </View>
    );
};

// Fancy SVG Icons for Gifts
const getGiftIcon = (type: string) => {
    const size = 60;
    const iconProps = { width: size, height: size };
    
    switch (type) {
        case 'rose':
            return <RoseIcon {...iconProps} />;
        case 'heart':
            return <HeartIcon {...iconProps} />;
        case 'diamond_ring':
            return <DiamondRingIcon {...iconProps} />;
        case 'fireworks':
            return <FireworksIcon {...iconProps} />;
        case 'yacht':
            return <YachtIcon {...iconProps} />;
        case 'sports_car':
            return <SportsCarIcon {...iconProps} />;
        case 'private_jet':
            return <PrivateJetIcon {...iconProps} />;
        case 'castle':
            return <CastleIcon {...iconProps} />;
        case 'universe':
            return <UniverseIcon {...iconProps} />;
        case 'lomi_crown':
            return <CrownIcon {...iconProps} />;
        default:
            return <GiftIcon {...iconProps} />;
    }
};

// SVG Icon Components
const RoseIcon = ({ width, height }: { width: number; height: number }) => (
    <Svg width={width} height={height} viewBox="0 0 24 24" fill="none">
        <Path d="M12 2C8 6 4 8 4 12c0 4 3 6 8 6s8-2 8-6c0-4-4-6-8-10z" fill="#FF69B4" />
        <Path d="M12 2c-2 2-4 4-4 6" stroke="#FF1493" strokeWidth="1.5" />
        <Circle cx="12" cy="8" r="1.5" fill="#FFB6C1" />
    </Svg>
);

const HeartIcon = ({ width, height }: { width: number; height: number }) => (
    <Svg width={width} height={height} viewBox="0 0 24 24" fill="none">
        <Path
            d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"
            fill="#FF1744"
        />
    </Svg>
);

const DiamondRingIcon = ({ width, height }: { width: number; height: number }) => (
    <Svg width={width} height={height} viewBox="0 0 24 24" fill="none">
        <Circle cx="12" cy="12" r="8" fill="#B9F2FF" stroke="#00D4FF" strokeWidth="2" />
        <Path d="M8 12l2 2 4-4" stroke="#00D4FF" strokeWidth="2" strokeLinecap="round" />
        <Rect x="6" y="18" width="12" height="2" rx="1" fill="#FFD700" />
    </Svg>
);

const FireworksIcon = ({ width, height }: { width: number; height: number }) => (
    <Svg width={width} height={height} viewBox="0 0 24 24" fill="none">
        <Circle cx="12" cy="8" r="2" fill="#FFD700" />
        <Path d="M12 8l-3 6M12 8l3 6M12 8l-4 4M12 8l4 4" stroke="#FF6B00" strokeWidth="2" />
        <Circle cx="8" cy="14" r="1.5" fill="#FF1744" />
        <Circle cx="16" cy="14" r="1.5" fill="#00E676" />
    </Svg>
);

const YachtIcon = ({ width, height }: { width: number; height: number }) => (
    <Svg width={width} height={height} viewBox="0 0 24 24" fill="none">
        <Path d="M4 18l16-4v-2L4 16v2z" fill="#4FC3F7" />
        <Path d="M6 16l12-3" stroke="#0277BD" strokeWidth="2" />
        <Polygon points="8,14 12,12 16,14" fill="#81D4FA" />
    </Svg>
);

const SportsCarIcon = ({ width, height }: { width: number; height: number }) => (
    <Svg width={width} height={height} viewBox="0 0 24 24" fill="none">
        <Path d="M5 14h14v-2H5v2z" fill="#E91E63" />
        <Circle cx="7" cy="17" r="2" fill="#212121" />
        <Circle cx="17" cy="17" r="2" fill="#212121" />
        <Path d="M6 12h12v-2H6v2z" fill="#F44336" />
    </Svg>
);

const PrivateJetIcon = ({ width, height }: { width: number; height: number }) => (
    <Svg width={width} height={height} viewBox="0 0 24 24" fill="none">
        <Path d="M12 2L4 8l8 6 8-6-8-6z" fill="#90CAF9" />
        <Path d="M4 8l8 6v8l-8-6V8z" fill="#64B5F6" />
        <Path d="M20 8l-8 6v8l8-6V8z" fill="#64B5F6" />
        <Circle cx="12" cy="11" r="1.5" fill="#FFD700" />
    </Svg>
);

const CastleIcon = ({ width, height }: { width: number; height: number }) => (
    <Svg width={width} height={height} viewBox="0 0 24 24" fill="none">
        <Rect x="4" y="12" width="16" height="8" fill="#9E9E9E" />
        <Rect x="6" y="8" width="4" height="4" fill="#757575" />
        <Rect x="14" y="8" width="4" height="4" fill="#757575" />
        <Rect x="9" y="4" width="6" height="4" fill="#616161" />
        <Polygon points="10,4 12,2 14,4" fill="#FFD700" />
    </Svg>
);

const UniverseIcon = ({ width, height }: { width: number; height: number }) => (
    <Svg width={width} height={height} viewBox="0 0 24 24" fill="none">
        <Defs>
            <SvgLinearGradient id="universeGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <Stop offset="0%" stopColor="#1A237E" stopOpacity="1" />
                <Stop offset="50%" stopColor="#7B1FA2" stopOpacity="1" />
                <Stop offset="100%" stopColor="#E91E63" stopOpacity="1" />
            </SvgLinearGradient>
        </Defs>
        <Circle cx="12" cy="12" r="10" fill="url(#universeGrad)" />
        <Circle cx="8" cy="8" r="1" fill="#FFD700" />
        <Circle cx="16" cy="10" r="0.8" fill="#FFD700" />
        <Circle cx="10" cy="16" r="1.2" fill="#FFD700" />
        <Circle cx="15" cy="16" r="0.6" fill="#FFD700" />
    </Svg>
);

const CrownIcon = ({ width, height }: { width: number; height: number }) => (
    <Svg width={width} height={height} viewBox="0 0 24 24" fill="none">
        <Path d="M5 16l7-8 7 8H5z" fill="#FFD700" />
        <Path d="M5 16h14v2H5v-2z" fill="#FFC107" />
        <Circle cx="8" cy="12" r="1.5" fill="#FF6B00" />
        <Circle cx="12" cy="10" r="2" fill="#FF6B00" />
        <Circle cx="16" cy="12" r="1.5" fill="#FF6B00" />
    </Svg>
);

const GiftIcon = ({ width, height }: { width: number; height: number }) => (
    <Svg width={width} height={height} viewBox="0 0 24 24" fill="none">
        <Rect x="6" y="8" width="12" height="10" rx="1" fill="#E91E63" />
        <Path d="M12 8V4M8 8H6M18 8h2" stroke="#C2185B" strokeWidth="2" />
        <Path d="M12 8l-2-2M12 8l2-2" stroke="#C2185B" strokeWidth="2" />
    </Svg>
);

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: COLORS.background,
    },
    safeArea: {
        flex: 1,
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: COLORS.background,
    },
    topHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: SPACING.m,
        borderBottomWidth: 1,
        borderBottomColor: COLORS.surfaceHighlight,
    },
    backButton: {
        padding: SPACING.s,
    },
    backIcon: {
        fontSize: 24,
        color: COLORS.textPrimary,
    },
    headerTitle: {
        fontSize: 20,
        fontWeight: 'bold',
        color: COLORS.textPrimary,
        flex: 1,
        textAlign: 'center',
    },
    placeholder: {
        width: 40,
    },
    scrollContent: {
        padding: SPACING.l,
    },
    header: {
        marginBottom: SPACING.xl,
    },
    title: {
        fontSize: 32,
        fontWeight: 'bold',
        color: COLORS.textPrimary,
        marginBottom: SPACING.l,
    },
    balanceCard: {
        backgroundColor: COLORS.surface,
        borderRadius: SIZES.radiusM,
        padding: SPACING.l,
        marginBottom: SPACING.m,
        borderWidth: 1,
        borderColor: COLORS.primary,
    },
    balanceLabel: {
        fontSize: 14,
        color: COLORS.textSecondary,
        marginBottom: SPACING.xs,
    },
    balanceAmount: {
        fontSize: 36,
        fontWeight: 'bold',
        color: COLORS.primary,
        marginBottom: SPACING.xs,
    },
    balanceETB: {
        fontSize: 16,
        color: COLORS.textSecondary,
    },
    buyCoinsButton: {
        backgroundColor: COLORS.primary,
        borderRadius: SIZES.radiusM,
        padding: SPACING.m,
        alignItems: 'center',
    },
    buyCoinsButtonText: {
        fontSize: 18,
        fontWeight: 'bold',
        color: COLORS.background,
    },
    giftsGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
    },
    giftCard: {
        width: GIFT_CARD_WIDTH,
        backgroundColor: COLORS.surface,
        borderRadius: SIZES.radiusM,
        padding: SPACING.m,
        marginBottom: SPACING.m,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: COLORS.surfaceHighlight,
    },
    giftIcon: {
        width: 80,
        height: 80,
        borderRadius: 40,
        backgroundColor: COLORS.surfaceHighlight,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: SPACING.s,
        borderWidth: 2,
        borderColor: COLORS.primary,
    },
    giftName: {
        fontSize: 16,
        fontWeight: 'bold',
        color: COLORS.textPrimary,
        marginBottom: SPACING.xs,
    },
    giftPrice: {
        fontSize: 18,
        fontWeight: 'bold',
        color: COLORS.primary,
        marginBottom: SPACING.xs,
    },
    giftETB: {
        fontSize: 12,
        color: COLORS.textSecondary,
    },
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.8)',
        justifyContent: 'flex-end',
    },
    modalContent: {
        backgroundColor: COLORS.surface,
        borderTopLeftRadius: SIZES.radiusL,
        borderTopRightRadius: SIZES.radiusL,
        padding: SPACING.l,
        maxHeight: '80%',
    },
    modalTitle: {
        fontSize: 24,
        fontWeight: 'bold',
        color: COLORS.textPrimary,
        marginBottom: SPACING.l,
    },
    packCard: {
        backgroundColor: COLORS.surfaceHighlight,
        borderRadius: SIZES.radiusM,
        padding: SPACING.l,
        marginBottom: SPACING.m,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    packInfo: {
        flex: 1,
    },
    packName: {
        fontSize: 20,
        fontWeight: 'bold',
        color: COLORS.textPrimary,
        marginBottom: SPACING.xs,
    },
    packCoins: {
        fontSize: 18,
        color: COLORS.primary,
        marginBottom: SPACING.xs,
    },
    packPrice: {
        fontSize: 16,
        color: COLORS.textSecondary,
    },
    closeButton: {
        backgroundColor: COLORS.surfaceHighlight,
        borderRadius: SIZES.radiusM,
        padding: SPACING.m,
        alignItems: 'center',
        marginTop: SPACING.m,
    },
    closeButtonText: {
        fontSize: 18,
        fontWeight: 'bold',
        color: COLORS.textPrimary,
    },
});

