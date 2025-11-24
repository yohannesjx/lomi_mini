import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { COLORS, SPACING, SIZES } from '../../theme/colors';
import { GiftService } from '../../api/services';
import { useAuthStore } from '../../store/authStore';

// New luxury coin packs matching the spec
const COIN_PACKAGES = [
    { id: 'spark', name: 'Spark', coins: 600, birr: 55, popular: false },
    { id: 'flame', name: 'Flame', coins: 1300, birr: 110, popular: true },
    { id: 'blaze', name: 'Blaze', coins: 3500, birr: 275, popular: false },
    { id: 'inferno', name: 'Inferno', coins: 8000, birr: 550, popular: false },
    { id: 'galaxy', name: 'Galaxy', coins: 18000, birr: 1100, popular: false },
    { id: 'universe', name: 'Universe', coins: 100000, birr: 5500, popular: false },
];

const PAYMENT_METHODS = [
    { id: 'telebirr', name: 'Telebirr', icon: '📱', color: '#0066CC' },
    { id: 'cbe_birr', name: 'CBE Birr', icon: '🏦', color: '#00A651' },
];

export const BuyCoinsScreen = ({ navigation, route }: any) => {
    const { user } = useAuthStore();
    const preselectedCoins = route?.params?.preselectedPackage || 500;
    const customMessage = route?.params?.message;
    const initialPackage = COIN_PACKAGES.find(p => p.coins === preselectedCoins) || COIN_PACKAGES[1];
    const [selectedPackage, setSelectedPackage] = useState(initialPackage);
    const [selectedPayment, setSelectedPayment] = useState(PAYMENT_METHODS[0]);
    const [isPurchasing, setIsPurchasing] = useState(false);
    const [coinBalance, setCoinBalance] = useState(0);

    useEffect(() => {
        loadCoinBalance();
    }, []);

    const loadCoinBalance = async () => {
        try {
            const response = await GiftService.getWalletBalance();
            setCoinBalance(response.coin_balance || 0);
        } catch (error: any) {
            console.error('Load coin balance error:', error);
        }
    };

    const handlePurchase = async () => {
        if (isPurchasing) return;

        setIsPurchasing(true);
        try {
            // Use new luxury gift API
            const response = await GiftService.buyCoins(selectedPackage.id);

            // Show payment redirect alert
            Alert.alert(
                'Payment Required',
                `Redirecting to ${selectedPayment.name} to complete payment of ${selectedPackage.birr} ETB`,
                [
                    {
                        text: 'Cancel',
                        style: 'cancel',
                        onPress: () => setIsPurchasing(false),
                    },
                    {
                        text: 'Continue',
                        onPress: async () => {
                            // In production, this would open the payment URL
                            // For now, show success message
                            // The webhook will add coins when payment is confirmed
                            try {
                                Alert.alert(
                                    'Payment Initiated! 🎉',
                                    `Redirecting to payment gateway...\n\nYou will receive ${selectedPackage.coins.toLocaleString()} LC after payment confirmation.`,
                                    [
                                        {
                                            text: 'OK',
                                            onPress: async () => {
                                                // In production: Open payment URL
                                                // Linking.openURL(response.payment_url);
                                                await loadCoinBalance();
                                                navigation.goBack();
                                            },
                                        },
                                    ]
                                );
                            } catch (error) {
                                Alert.alert('Error', 'Payment processing failed');
                            } finally {
                                setIsPurchasing(false);
                            }
                        },
                    },
                ]
            );
        } catch (error: any) {
            Alert.alert('Error', error.response?.data?.error || 'Failed to initiate purchase');
            setIsPurchasing(false);
        }
    };

    return (
        <SafeAreaView style={styles.container} edges={['top']}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
                    <Text style={styles.backIcon}>←</Text>
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Buy Coins 💎</Text>
                <View style={styles.balanceBadge}>
                    <Text style={styles.balanceText}>💎 {coinBalance.toLocaleString()}</Text>
                </View>
            </View>

            {customMessage && (
                <View style={styles.customMessageBanner}>
                    <Text style={styles.customMessageText}>{customMessage}</Text>
                </View>
            )}

            <View style={styles.contentWrapper}>
                <ScrollView style={styles.content} showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
                {/* Coin Packages */}
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Choose Package</Text>
                    {COIN_PACKAGES.map((pkg, index) => (
                        <TouchableOpacity
                            key={index}
                            style={[
                                styles.packageCard,
                                selectedPackage.coins === pkg.coins && styles.packageCardSelected,
                                pkg.popular && styles.packageCardPopular,
                            ]}
                            onPress={() => setSelectedPackage(pkg)}
                        >
                            {pkg.popular && (
                                <View style={styles.popularBadge}>
                                    <Text style={styles.popularText}>MOST POPULAR</Text>
                                </View>
                            )}
                            <View style={styles.packageContent}>
                                <View style={styles.packageLeft}>
                                    <Text style={styles.packageName}>{pkg.name}</Text>
                                    <Text style={styles.coinAmount}>💎 {pkg.coins.toLocaleString()} LC</Text>
                                </View>
                                <View style={styles.packageRight}>
                                    <Text style={styles.birrAmount}>{pkg.birr} ETB</Text>
                                </View>
                            </View>
                        </TouchableOpacity>
                    ))}
                </View>

                {/* Payment Methods */}
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Payment Method</Text>
                    {PAYMENT_METHODS.map((method) => (
                        <TouchableOpacity
                            key={method.id}
                            style={[
                                styles.paymentCard,
                                selectedPayment.id === method.id && styles.paymentCardSelected,
                            ]}
                            onPress={() => setSelectedPayment(method)}
                        >
                            <View style={styles.paymentLeft}>
                                <Text style={styles.paymentIcon}>{method.icon}</Text>
                                <Text style={styles.paymentName}>{method.name}</Text>
                            </View>
                            {selectedPayment.id === method.id && (
                                <View style={styles.checkmark}>
                                    <Text style={styles.checkmarkText}>✓</Text>
                                </View>
                            )}
                        </TouchableOpacity>
                    ))}
                </View>

                {/* Summary */}
                <View style={styles.summaryCard}>
                    <View style={styles.summaryRow}>
                        <Text style={styles.summaryLabel}>Package:</Text>
                        <Text style={styles.summaryValue}>{selectedPackage.name}</Text>
                    </View>
                    <View style={styles.summaryRow}>
                        <Text style={styles.summaryLabel}>Coins:</Text>
                        <Text style={styles.summaryValue}>💎 {selectedPackage.coins.toLocaleString()} LC</Text>
                    </View>
                    <View style={styles.summaryDivider} />
                    <View style={styles.summaryRow}>
                        <Text style={styles.summaryLabel}>Amount:</Text>
                        <Text style={styles.summaryValueBold}>{selectedPackage.birr} ETB</Text>
                    </View>
                    <View style={styles.summaryRow}>
                        <Text style={styles.summaryLabel}>Value:</Text>
                        <Text style={styles.summaryValue}>≈ {(selectedPackage.coins * 0.1).toFixed(0)} ETB</Text>
                    </View>
                </View>
                </ScrollView>

                {/* Purchase Button - Sticky Footer */}
                <View style={styles.footer}>
                <TouchableOpacity
                    style={[styles.purchaseButton, isPurchasing && styles.purchaseButtonDisabled]}
                    onPress={handlePurchase}
                    disabled={isPurchasing}
                >
                    {isPurchasing ? (
                        <ActivityIndicator color={COLORS.background} />
                    ) : (
                        <Text style={styles.purchaseButtonText}>
                            Pay {selectedPackage.birr} ETB via {selectedPayment.name}
                        </Text>
                    )}
                </TouchableOpacity>
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
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: SPACING.m,
        borderBottomWidth: 1,
        borderBottomColor: COLORS.surfaceHighlight,
        backgroundColor: COLORS.surface,
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
    balanceBadge: {
        backgroundColor: 'rgba(255, 215, 0, 0.1)',
        paddingHorizontal: SPACING.m,
        paddingVertical: SPACING.xs,
        borderRadius: SIZES.radiusM,
        borderWidth: 1,
        borderColor: COLORS.gold,
    },
    balanceText: {
        color: COLORS.gold,
        fontWeight: 'bold',
        fontSize: 14,
    },
    customMessageBanner: {
        backgroundColor: 'rgba(167, 255, 131, 0.15)',
        borderBottomWidth: 1,
        borderBottomColor: COLORS.primary,
        padding: SPACING.m,
        alignItems: 'center',
    },
    customMessageText: {
        color: COLORS.primary,
        fontSize: 16,
        fontWeight: '600',
        textAlign: 'center',
    },
    contentWrapper: {
        flex: 1,
    },
    content: {
        flex: 1,
    },
    scrollContent: {
        padding: SPACING.l,
        paddingBottom: SPACING.xl,
    },
    section: {
        marginBottom: SPACING.xl,
    },
    sectionTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        color: COLORS.textPrimary,
        marginBottom: SPACING.m,
    },
    packageCard: {
        backgroundColor: COLORS.surface,
        borderRadius: SIZES.radiusM,
        padding: SPACING.m,
        marginBottom: SPACING.m,
        borderWidth: 2,
        borderColor: COLORS.surfaceHighlight,
    },
    packageCardSelected: {
        borderColor: COLORS.primary,
        backgroundColor: 'rgba(255, 87, 34, 0.1)',
    },
    packageCardPopular: {
        borderColor: COLORS.gold,
    },
    popularBadge: {
        position: 'absolute',
        top: -8,
        right: SPACING.m,
        backgroundColor: COLORS.gold,
        paddingHorizontal: SPACING.s,
        paddingVertical: 2,
        borderRadius: SIZES.radiusS,
    },
    popularText: {
        color: COLORS.background,
        fontSize: 10,
        fontWeight: 'bold',
    },
    packageContent: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    packageLeft: {
        flex: 1,
    },
    packageName: {
        fontSize: 18,
        fontWeight: 'bold',
        color: COLORS.primary,
        marginBottom: 4,
    },
    coinAmount: {
        fontSize: 24,
        fontWeight: 'bold',
        color: COLORS.textPrimary,
    },
    packageRight: {
        alignItems: 'flex-end',
    },
    birrAmount: {
        fontSize: 20,
        fontWeight: 'bold',
        color: COLORS.primary,
    },
    paymentCard: {
        backgroundColor: COLORS.surface,
        borderRadius: SIZES.radiusM,
        padding: SPACING.m,
        marginBottom: SPACING.m,
        borderWidth: 2,
        borderColor: COLORS.surfaceHighlight,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    paymentCardSelected: {
        borderColor: COLORS.primary,
        backgroundColor: 'rgba(255, 87, 34, 0.1)',
    },
    paymentLeft: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    paymentIcon: {
        fontSize: 32,
        marginRight: SPACING.m,
    },
    paymentName: {
        fontSize: 18,
        fontWeight: '600',
        color: COLORS.textPrimary,
    },
    checkmark: {
        width: 28,
        height: 28,
        borderRadius: 14,
        backgroundColor: COLORS.primary,
        alignItems: 'center',
        justifyContent: 'center',
    },
    checkmarkText: {
        color: COLORS.background,
        fontSize: 18,
        fontWeight: 'bold',
    },
    summaryCard: {
        backgroundColor: COLORS.surface,
        borderRadius: SIZES.radiusM,
        padding: SPACING.l,
        marginTop: SPACING.m,
    },
    summaryRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: SPACING.s,
    },
    summaryLabel: {
        fontSize: 16,
        color: COLORS.textSecondary,
    },
    summaryValue: {
        fontSize: 16,
        fontWeight: '600',
        color: COLORS.textPrimary,
    },
    summaryValueBold: {
        fontSize: 18,
        fontWeight: 'bold',
        color: COLORS.primary,
    },
    summaryDivider: {
        height: 1,
        backgroundColor: COLORS.surfaceHighlight,
        marginVertical: SPACING.m,
    },
    footer: {
        padding: SPACING.l,
        borderTopWidth: 1,
        borderTopColor: COLORS.surfaceHighlight,
        backgroundColor: COLORS.surface,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 5,
    },
    purchaseButton: {
        backgroundColor: COLORS.primary,
        padding: SPACING.m,
        borderRadius: SIZES.radiusM,
        alignItems: 'center',
        justifyContent: 'center',
    },
    purchaseButtonDisabled: {
        opacity: 0.6,
    },
    purchaseButtonText: {
        color: COLORS.background,
        fontSize: 18,
        fontWeight: 'bold',
    },
});

