import { create } from 'zustand';
import { storage } from '../utils/storage';
import { AuthService, AuthResponse } from '../api/auth';

interface AuthState {
    accessToken: string | null;
    refreshToken: string | null;
    user: any | null;
    isAuthenticated: boolean;
    isLoading: boolean;
    login: (initData: string) => Promise<void>;
    loginWithGoogle: (idToken: string) => Promise<void>;
    loginWithWidget: (authData: {
        id: string;
        first_name: string;
        last_name?: string;
        username?: string;
        photo_url?: string;
        auth_date: string;
        hash: string;
    }) => Promise<void>;
    logout: () => Promise<void>;
    setTokens: (tokens: { accessToken: string; refreshToken: string }) => Promise<void>;
    loadTokens: () => Promise<boolean>;
}

const TOKEN_KEY = 'lomi_access_token';
const REFRESH_TOKEN_KEY = 'lomi_refresh_token';
const USER_KEY = 'lomi_user';

export const useAuthStore = create<AuthState>((set) => ({
    accessToken: null,
    refreshToken: null,
    user: null,
    isAuthenticated: false,
    isLoading: true,

    login: async (initData: string) => {
        try {
            const response: AuthResponse = await AuthService.telegramLogin(initData);
            await storage.setItem(TOKEN_KEY, response.access_token);
            await storage.setItem(REFRESH_TOKEN_KEY, response.refresh_token);
            await storage.setItem(USER_KEY, JSON.stringify(response.user));
            
            set({
                accessToken: response.access_token,
                refreshToken: response.refresh_token,
                user: response.user,
                isAuthenticated: true,
                isLoading: false,
            });
        } catch (error) {
            set({ isLoading: false });
            throw error;
        }
    },

    loginWithGoogle: async (idToken: string) => {
        try {
            set({ isLoading: true });
            const response: AuthResponse = await AuthService.googleLogin(idToken);
            await storage.setItem(TOKEN_KEY, response.access_token);
            await storage.setItem(REFRESH_TOKEN_KEY, response.refresh_token);
            await storage.setItem(USER_KEY, JSON.stringify(response.user));

            set({
                accessToken: response.access_token,
                refreshToken: response.refresh_token,
                user: response.user,
                isAuthenticated: true,
                isLoading: false,
            });
        } catch (error) {
            set({ isLoading: false });
            throw error;
        }
    },

    loginWithWidget: async (authData) => {
        try {
            const response: AuthResponse = await AuthService.telegramWidgetLogin(authData);
            await storage.setItem(TOKEN_KEY, response.access_token);
            await storage.setItem(REFRESH_TOKEN_KEY, response.refresh_token);
            await storage.setItem(USER_KEY, JSON.stringify(response.user));
            
            set({
                accessToken: response.access_token,
                refreshToken: response.refresh_token,
                user: response.user,
                isAuthenticated: true,
                isLoading: false,
            });
        } catch (error) {
            set({ isLoading: false });
            throw error;
        }
    },

    logout: async () => {
        await storage.removeItem(TOKEN_KEY);
        await storage.removeItem(REFRESH_TOKEN_KEY);
        await storage.removeItem(USER_KEY);
        
        set({
            accessToken: null,
            refreshToken: null,
            user: null,
            isAuthenticated: false,
        });
    },

    setTokens: async (tokens: { accessToken: string; refreshToken: string }) => {
        await storage.setItem(TOKEN_KEY, tokens.accessToken);
        await storage.setItem(REFRESH_TOKEN_KEY, tokens.refreshToken);
        
        set({
            accessToken: tokens.accessToken,
            refreshToken: tokens.refreshToken,
        });
    },

    loadTokens: async () => {
        try {
            const accessToken = await storage.getItem(TOKEN_KEY);
            const refreshToken = await storage.getItem(REFRESH_TOKEN_KEY);
            const userStr = await storage.getItem(USER_KEY);
            
            if (accessToken && refreshToken && userStr) {
                const user = JSON.parse(userStr);
                set({
                    accessToken,
                    refreshToken,
                    user,
                    isAuthenticated: true,
                    isLoading: false,
                });
                console.log('✅ Loaded stored tokens and user data');
                return true;
            } else {
                set({ isLoading: false });
                console.log('ℹ️ No stored tokens found');
                return false;
            }
        } catch (error) {
            console.error('❌ Error loading tokens:', error);
            set({ isLoading: false });
            return false;
        }
    },
}));

