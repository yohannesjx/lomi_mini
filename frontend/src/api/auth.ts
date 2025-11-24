import { api } from './client';

export interface User {
    id: string;
    name: string;
    is_verified: boolean;
    has_profile: boolean;
}

export interface AuthResponse {
    access_token: string;
    refresh_token: string;
    user: User;
}

export const AuthService = {
    telegramLogin: async (initData: string): Promise<AuthResponse> => {
        // Use Telegram Mini Apps SDK approach: send initData in Authorization header
        const fullUrl = `${api.defaults.baseURL}/auth/telegram`;
        console.log('🔐 Attempting Telegram login...');
        console.log('📤 Request URL:', fullUrl);
        console.log('📤 Request method: POST');
        console.log('📤 InitData length:', initData.length);
        console.log('📤 Authorization header:', `tma ${initData.substring(0, 50)}...`);
        
        try {
            const response = await api.post<AuthResponse>('/auth/telegram', {}, {
                headers: {
                    'Authorization': `tma ${initData}`,
                },
            });
            console.log('✅ Login successful!');
            return response.data;
        } catch (error: any) {
            console.error('❌ Login request failed:', {
                message: error?.message,
                status: error?.response?.status,
                statusText: error?.response?.statusText,
                data: error?.response?.data,
                config: {
                    url: error?.config?.url,
                    baseURL: error?.config?.baseURL,
                    method: error?.config?.method,
                    headers: error?.config?.headers,
                },
            });
            throw error;
        }
    },

    googleLogin: async (idToken: string): Promise<AuthResponse> => {
        try {
            // Debug: Decode token to check audience
            try {
                const payload = JSON.parse(atob(idToken.split('.')[1]));
                console.log('🔍 Token payload:', {
                    aud: payload.aud,
                    email: payload.email,
                    email_verified: payload.email_verified,
                    iss: payload.iss,
                });
            } catch (e) {
                console.warn('⚠️ Could not decode token for debugging:', e);
            }

            console.log('📤 Sending Google login request with id_token (length:', idToken.length, ')');
            const response = await api.post<AuthResponse>('/auth/google', {
                id_token: idToken,
            });
            console.log('✅ Google login successful!');
            return response.data;
        } catch (error: any) {
            console.error('❌ Google login failed:', {
                message: error?.message,
                status: error?.response?.status,
                statusText: error?.response?.statusText,
                data: error?.response?.data,
                errorDetails: error?.response?.data?.details,
            });
            throw error;
        }
    },

    telegramWidgetLogin: async (authData: {
        id: string;
        first_name: string;
        last_name?: string;
        username?: string;
        photo_url?: string;
        auth_date: string;
        hash: string;
    }): Promise<AuthResponse> => {
        // Telegram Login Widget sends data via query params or POST body
        // We'll send it as query params to match backend expectation
        const params = new URLSearchParams();
        params.append('id', authData.id);
        params.append('first_name', authData.first_name);
        if (authData.last_name) params.append('last_name', authData.last_name);
        if (authData.username) params.append('username', authData.username);
        if (authData.photo_url) params.append('photo_url', authData.photo_url);
        params.append('auth_date', authData.auth_date);
        params.append('hash', authData.hash);

        const response = await api.get<AuthResponse>(`/auth/telegram/widget?${params.toString()}`);
        return response.data;
    },

    logout: async () => {
        // TODO: Clear tokens from storage
    },
};
