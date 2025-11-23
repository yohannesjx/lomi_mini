import React, { useState, useEffect } from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { SwipeScreen } from '../screens/discovery/SwipeScreen';
import { ExploreFeedScreen } from '../screens/explore/ExploreFeedScreen';
import { ChatListScreen } from '../screens/chat/ChatListScreen';
import { ProfileScreen } from '../screens/profile/ProfileScreen';
import { LikesYouScreen } from '../screens/likesyou/LikesYouScreen';
import { COLORS, SPACING } from '../theme/colors';
import { Text, View, StyleSheet } from 'react-native';
import { LikesService } from '../api/services';

const Tab = createBottomTabNavigator();

const TabIcon = ({ focused, icon, label, badgeCount }: { focused: boolean, icon: string, label: string, badgeCount?: number }) => (
    <View style={{ alignItems: 'center', justifyContent: 'center', top: 5 }}>
        <View style={{ position: 'relative' }}>
            <Text style={{
                fontSize: 24,
                color: focused ? COLORS.primary : (badgeCount === 0 ? COLORS.textTertiary : COLORS.textSecondary),
                marginBottom: 4,
            }}>
                {icon}
            </Text>
            {badgeCount !== undefined && badgeCount > 0 && (
                <View style={styles.badge}>
                    <Text style={styles.badgeText}>
                        {badgeCount > 99 ? '99+' : badgeCount}
                    </Text>
                </View>
            )}
        </View>
        <Text style={{
            fontSize: 10,
            color: focused ? COLORS.primary : (badgeCount === 0 ? COLORS.textTertiary : COLORS.textSecondary),
            fontWeight: focused ? 'bold' : 'normal',
            opacity: badgeCount === 0 ? 0.4 : 1,
        }}>
            {label}
        </Text>
    </View>
);

export const MainTabNavigator = () => {
    const [likesBadgeCount, setLikesBadgeCount] = useState(0);

    useEffect(() => {
        loadLikesBadge();
        // Refresh badge every 30 seconds
        const interval = setInterval(loadLikesBadge, 30000);
        return () => clearInterval(interval);
    }, []);

    const loadLikesBadge = async () => {
        try {
            const response = await LikesService.getPendingLikes();
            setLikesBadgeCount(response.count || 0);
        } catch (error: any) {
            // Silently fail - badge will show 0
            // In dev mode without auth, this is expected
            if (error.response?.status === 401 && __DEV__) {
                // Expected in dev mode without authentication
            }
            setLikesBadgeCount(0);
        }
    };

    return (
        <Tab.Navigator
            screenOptions={{
                headerShown: false,
                tabBarStyle: {
                    backgroundColor: COLORS.surface,
                    borderTopColor: COLORS.surfaceHighlight,
                    height: 150, // Increased by 15px
                    paddingBottom: 80, // Increased by 15px
                    paddingTop: 10,
                    elevation: 0, // Remove shadow on Android
                    borderTopWidth: 1,
                },
                tabBarShowLabel: false,
            }}
        >
            <Tab.Screen
                name="Discover"
                component={SwipeScreen}
                options={{
                    tabBarIcon: ({ focused }) => <TabIcon focused={focused} icon="🔥" label="Discover" />
                }}
            />
            <Tab.Screen
                name="Explore"
                component={ExploreFeedScreen}
                options={{
                    tabBarIcon: ({ focused }) => <TabIcon focused={focused} icon="✨" label="Explore" />
                }}
            />
            <Tab.Screen
                name="LikesYou"
                component={LikesYouScreen}
                options={{
                    tabBarIcon: ({ focused }) => (
                        <TabIcon
                            focused={focused}
                            icon="💚"
                            label="Likes"
                            badgeCount={likesBadgeCount}
                        />
                    )
                }}
                listeners={{
                    tabPress: () => {
                        // Refresh badge when tab is pressed
                        loadLikesBadge();
                    },
                }}
            />
            <Tab.Screen
                name="Chats"
                component={ChatListScreen}
                options={{
                    tabBarIcon: ({ focused }) => <TabIcon focused={focused} icon="💬" label="Chats" />
                }}
            />
            <Tab.Screen
                name="Profile"
                component={ProfileScreen}
                options={{
                    tabBarIcon: ({ focused }) => <TabIcon focused={focused} icon="👤" label="Profile" />
                }}
            />
        </Tab.Navigator>
    );
};

const styles = StyleSheet.create({
    badge: {
        position: 'absolute',
        top: -8,
        right: -8,
        backgroundColor: '#EF4444',
        borderRadius: 10,
        minWidth: 20,
        height: 20,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 4,
        borderWidth: 2,
        borderColor: COLORS.surface,
    },
    badgeText: {
        color: '#FFFFFF',
        fontSize: 10,
        fontWeight: 'bold',
    },
});
