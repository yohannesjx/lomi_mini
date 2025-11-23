import axios from 'axios';
import { Platform } from 'react-native';
import { storage } from '../utils/storage';
import { useAuthStore } from '../store/authStore';

// API URL configuration
// For Telegram Mini App: Must use HTTPS and publicly accessible URL
// Set EXPO_PUBLIC_API_URL environment variable to override
const getApiUrl = () => {
    // Check for environment variable (useful for local dev with ngrok)
    if (process.env.EXPO_PUBLIC_API_URL) {
        return process.env.EXPO_PUBLIC_API_URL;
    }
    
    // Check if we're running on localhost (true local dev)
    const isLocalhost = typeof window !== 'undefined' && 
        (window.location.hostname === 'localhost' || 
         window.location.hostname === '127.0.0.1' ||
         window.location.hostname === '10.0.2.2');
    
    // Development URLs (only for true localhost)
    if (__DEV__ && isLocalhost) {
        if (Platform.OS === 'android') {
            return 'http://10.0.2.2:8080/api/v1'; // Android emulator
        }
        return 'http://localhost:8080/api/v1'; // Local development
    }
    
    // Production URL (for deployed app or when opened from Telegram)
    if (typeof window !== 'undefined') {
        const hostname = window.location.hostname;
        const protocol = window.location.protocol;
        
        // If on lomi.social or IP, use relative path (Caddy handles /api/* routing)
        if (hostname === 'lomi.social' || hostname === '152.53.87.200' || hostname.includes('lomi.social')) {
            // Use relative path - Caddy will route /api/* to backend
            return '/api/v1';
        }
        
        // If on api.lomi.social, use current origin
        if (hostname === 'api.lomi.social' || hostname.includes('api.lomi.social')) {
            return `${protocol}//${hostname}/api/v1`;
        }
    }
    
    // Fallback: Try domain first, then IP
    // Check if we can use HTTPS (if DNS is configured)
    const apiDomain = 'https://api.lomi.social/api/v1';
    const apiIP = 'http://152.53.87.200/api/v1';
    
    // For now, use IP as fallback since DNS might not be configured
    return apiIP;
};

const API_BASE_URL = getApiUrl();

export const api = axios.create({
    baseURL: API_BASE_URL,
    headers: {
        'Content-Type': 'application/json',
    },
    timeout: 30000, // 30 second timeout
});

// Log API URL for debugging
if (typeof window !== 'undefined') {
    console.log('🌐 API Base URL:', API_BASE_URL);
    console.log('🌐 Current hostname:', window.location.hostname);
}

// Add interceptor to inject token
api.interceptors.request.use(
    async (config) => {
        const token = await storage.getItem('lomi_access_token');
        if (token) {
            config.headers.Authorization = `Bearer ${token}`;
        } else if (__DEV__) {
            // In dev mode, log warning but don't block requests
            // This allows testing UI without authentication
            console.warn('⚠️ No auth token found. API calls will fail with 401.');
            console.warn('💡 To test with auth, log in via WelcomeScreen first.');
        }
        return config;
    },
    (error) => Promise.reject(error)
);

// Add interceptor to handle errors and network issues
api.interceptors.response.use(
    (response) => response,
    async (error) => {
        const originalRequest = error.config;
        
        // Log network errors for debugging
        if (!error.response) {
            console.error('❌ Network Error:', {
                message: error.message,
                code: error.code,
                config: {
                    url: error.config?.url,
                    baseURL: error.config?.baseURL,
                    method: error.config?.method,
                },
            });
            
            // If it's a network error, try to provide helpful message
            if (error.message === 'Network Error' || error.code === 'ERR_NETWORK') {
                console.error('💡 Network Error - Possible causes:');
                console.error('   1. Backend server is down');
                console.error('   2. API URL is incorrect:', API_BASE_URL);
                console.error('   3. CORS issue');
                console.error('   4. DNS not resolving');
                console.error('   5. Firewall blocking request');
            }
        }
        
        if (error.response?.status === 401 && !originalRequest._retry) {
            originalRequest._retry = true;
            
            // Check if we have a refresh token
            const refreshToken = await storage.getItem('lomi_refresh_token');
            
            if (refreshToken) {
                // Try to refresh token
                try {
                    const response = await axios.post(`${api.defaults.baseURL}/auth/refresh`, {
                        refresh_token: refreshToken,
                    });
                    
                    const { access_token, refresh_token } = response.data;
                    await storage.setItem('lomi_access_token', access_token);
                    await storage.setItem('lomi_refresh_token', refresh_token);
                    
                    // Update store
                    useAuthStore.getState().setTokens({ accessToken: access_token, refreshToken: refresh_token });
                    
                    // Retry original request
                    originalRequest.headers.Authorization = `Bearer ${access_token}`;
                    return api(originalRequest);
                } catch (refreshError) {
                    // Refresh failed, clear tokens and logout
                    console.warn('Token refresh failed, logging out user');
                    await useAuthStore.getState().logout();
                    return Promise.reject(refreshError);
                }
            } else {
                // No refresh token - user needs to log in
                if (__DEV__) {
                    console.warn('⚠️ 401 Unauthorized: No authentication token found.');
                    console.warn('💡 In dev mode, you can test UI without auth, but API calls will fail.');
                    console.warn('💡 To test with real API, log in via WelcomeScreen first.');
                }
                // Don't logout if we're in dev mode and never had a token
                // This allows UI testing without breaking the app
                const hasEverLoggedIn = await storage.getItem('lomi_user');
                if (hasEverLoggedIn) {
                    await useAuthStore.getState().logout();
                }
            }
        }
        
        return Promise.reject(error);
    }
);
