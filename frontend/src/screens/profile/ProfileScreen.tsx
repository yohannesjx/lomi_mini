import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, Image, TouchableOpacity, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { CommonActions } from '@react-navigation/native';
import { Button } from '../../components/ui/Button';
import { COLORS, SPACING, SIZES } from '../../theme/colors';
import { useAuthStore } from '../../store/authStore';
import { useOnboardingStore } from '../../store/onboardingStore';
import { GiftService } from '../../api/services';

export const ProfileScreen = ({ navigation }: any) => {
    const { user, logout } = useAuthStore();
    const { reset: resetOnboarding } = useOnboardingStore();
    const [coinBalance, setCoinBalance] = useState(0);
    const [giftBalance, setGiftBalance] = useState(0);
    const [isLoggingOut, setIsLoggingOut] = useState(false);

    useEffect(() => {
        loadBalances();
    }, []);

    const loadBalances = async () => {
        try {
            const response = await GiftService.getWalletBalance();
            setCoinBalance(response.coin_balance || 0);
            // Gift balance is now calculated from received gifts
            // For now, show 0 or calculate from total_earned
            setGiftBalance((response.total_earned || 0) * 0.1); // Convert coins to ETB
        } catch (error: any) {
            console.error('Load balances error:', error);
        }
    };

    const handleLogout = async () => {
        // Show confirmation dialog
        Alert.alert(
            'Log Out',
            'Are you sure you want to log out?',
            [
                {
                    text: 'Cancel',
                    style: 'cancel',
                },
                {
                    text: 'Log Out',
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            setIsLoggingOut(true);
                            // Reset onboarding store
                            resetOnboarding();
                            // Logout from auth store (clears tokens and user data)
                            await logout();
                            
                            // Navigate to Welcome screen using CommonActions for reliable navigation
                            navigation.dispatch(
                                CommonActions.reset({
                                    index: 0,
                                    routes: [{ name: 'Welcome' }],
                                })
                            );
                        } catch (error: any) {
                            console.error('Logout error:', error);
                            Alert.alert('Error', 'Failed to log out. Please try again.');
                        } finally {
                            setIsLoggingOut(false);
                        }
                    },
                },
            ]
        );
    };

    const MenuItem = ({ icon, label, onPress, showArrow = true }: any) => (
        <TouchableOpacity style={styles.menuItem} onPress={onPress}>
            <Text style={styles.menuIcon}>{icon}</Text>
            <Text style={styles.menuLabel}>{label}</Text>
            {showArrow && <Text style={styles.menuArrow}>›</Text>}
        </TouchableOpacity>
    );

    return (
        <SafeAreaView style={styles.container}>
            <ScrollView contentContainerStyle={styles.scrollContent}>
                {/* Header */}
                <LinearGradient
                    colors={[COLORS.primary, COLORS.primaryDark]}
                    style={styles.header}
                >
                    <View style={styles.profileHeader}>
                        <View style={styles.avatarContainer}>
                            <Image
                                source={{ uri: 'https://images.unsplash.com/photo-1531384441138-2736e62e0919?q=80&w=1000&auto=format&fit=crop' }}
                                style={styles.avatar}
                            />
                            {user?.is_verified && (
                                <View style={styles.verifiedBadge}>
                                    <Text style={styles.verifiedText}>✓</Text>
                                </View>
                            )}
                        </View>
                        <Text style={styles.name}>{user?.name || 'User'}</Text>
                        <Text style={styles.location}>📍 Addis Ababa, Ethiopia</Text>
                    </View>
                </LinearGradient>

                {/* Stats */}
                <View style={styles.statsContainer}>
                    <View style={styles.statItem}>
                        <Text style={styles.statValue}>12</Text>
                        <Text style={styles.statLabel}>Matches</Text>
                    </View>
                    <View style={styles.statDivider} />
                    <View style={styles.statItem}>
                        <Text style={styles.statValue}>💎 {coinBalance.toLocaleString()}</Text>
                        <Text style={styles.statLabel}>Coins</Text>
                    </View>
                    <View style={styles.statDivider} />
                    <View style={styles.statItem}>
                        <Text style={styles.statValue}>🎁 {(coinBalance * 0.1).toFixed(0)}</Text>
                        <Text style={styles.statLabel}>ETB Value</Text>
                    </View>
                </View>

                {/* Menu */}
                <View style={styles.menuSection}>
                    <Text style={styles.sectionTitle}>Account</Text>
                    <MenuItem
                        icon="✏️"
                        label="Edit Profile"
                        onPress={() => navigation.navigate('ProfileSetup')}
                    />
                    {/* Photo moderation removed - manual moderation only */}
                    {/* <MenuItem
                        icon="📸"
                        label="My Photos"
                        onPress={() => navigation.navigate('PhotoModerationStatus', { source: 'profile' })}
                    /> */}
                    <MenuItem
                        icon="💎"
                        label="Buy Coins"
                        onPress={() => navigation.navigate('BuyCoins')}
                    />
                    <MenuItem
                        icon="🎁"
                        label="Gift Shop"
                        onPress={() => {
                            // Navigate to gift shop if registered, or show gift shop in modal
                            Alert.alert('Gift Shop', 'Gift shop coming soon! Use the gift icon in chat to send gifts.');
                        }}
                    />
                    <MenuItem
                        icon="💰"
                        label="Cashout"
                        onPress={() => navigation.navigate('Cashout')}
                    />
                    <MenuItem
                        icon="🏆"
                        label="Top Gifted Leaderboard"
                        onPress={() => navigation.navigate('Leaderboard')}
                    />
                </View>

                <View style={styles.menuSection}>
                    <Text style={styles.sectionTitle}>Settings</Text>
                    <MenuItem
                        icon="🔔"
                        label="Notifications"
                        onPress={() => {}}
                    />
                    <MenuItem
                        icon="🔒"
                        label="Privacy"
                        onPress={() => {}}
                    />
                    <MenuItem
                        icon="👤"
                        label="Discovery Settings"
                        onPress={() => {}}
                    />
                    <MenuItem
                        icon="ℹ️"
                        label="Help & Support"
                        onPress={() => {}}
                    />
                </View>

                <View style={styles.menuSection}>
                    <Text style={styles.sectionTitle}>About</Text>
                    <MenuItem
                        icon="📄"
                        label="Terms of Service"
                        onPress={() => {}}
                    />
                    <MenuItem
                        icon="🔐"
                        label="Privacy Policy"
                        onPress={() => {}}
                    />
                    <MenuItem
                        icon="ℹ️"
                        label="About Lomi"
                        onPress={() => {}}
                    />
                </View>

                <View style={styles.logoutSection}>
                    <Button
                        title={isLoggingOut ? "Logging Out..." : "Log Out"}
                        onPress={handleLogout}
                        variant="outline"
                        size="large"
                        disabled={isLoggingOut}
                        isLoading={isLoggingOut}
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
        paddingBottom: SPACING.xl,
    },
    header: {
        paddingTop: SPACING.xl,
        paddingBottom: SPACING.xxl,
        paddingHorizontal: SPACING.l,
    },
    profileHeader: {
        alignItems: 'center',
    },
    avatarContainer: {
        position: 'relative',
        marginBottom: SPACING.m,
    },
    avatar: {
        width: 100,
        height: 100,
        borderRadius: 50,
        borderWidth: 4,
        borderColor: COLORS.background,
    },
    verifiedBadge: {
        position: 'absolute',
        bottom: 0,
        right: 0,
        backgroundColor: COLORS.info,
        width: 32,
        height: 32,
        borderRadius: 16,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 3,
        borderColor: COLORS.background,
    },
    verifiedText: {
        color: COLORS.textPrimary,
        fontSize: 16,
        fontWeight: 'bold',
    },
    name: {
        fontSize: 28,
        fontWeight: 'bold',
        color: COLORS.background,
        marginBottom: SPACING.xs,
    },
    location: {
        fontSize: 16,
        color: COLORS.background,
        opacity: 0.9,
    },
    statsContainer: {
        flexDirection: 'row',
        backgroundColor: COLORS.surface,
        marginHorizontal: SPACING.l,
        marginTop: -SPACING.l,
        borderRadius: SIZES.radiusM,
        paddingVertical: SPACING.l,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 3,
    },
    statItem: {
        flex: 1,
        alignItems: 'center',
    },
    statValue: {
        fontSize: 24,
        fontWeight: 'bold',
        color: COLORS.textPrimary,
        marginBottom: SPACING.xs,
    },
    statLabel: {
        fontSize: 12,
        color: COLORS.textSecondary,
    },
    statDivider: {
        width: 1,
        backgroundColor: COLORS.surfaceHighlight,
    },
    menuSection: {
        marginTop: SPACING.xl,
        paddingHorizontal: SPACING.l,
    },
    sectionTitle: {
        fontSize: 14,
        fontWeight: 'bold',
        color: COLORS.textSecondary,
        marginBottom: SPACING.m,
        textTransform: 'uppercase',
        letterSpacing: 1,
    },
    menuItem: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: COLORS.surface,
        padding: SPACING.m,
        borderRadius: SIZES.radiusM,
        marginBottom: SPACING.s,
    },
    menuIcon: {
        fontSize: 24,
        marginRight: SPACING.m,
    },
    menuLabel: {
        flex: 1,
        fontSize: 16,
        color: COLORS.textPrimary,
        fontWeight: '500',
    },
    menuArrow: {
        fontSize: 24,
        color: COLORS.textSecondary,
    },
    logoutSection: {
        marginTop: SPACING.xl,
        paddingHorizontal: SPACING.l,
    },
});

