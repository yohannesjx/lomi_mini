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

    logout: async () => {
        // TODO: Clear tokens from storage
    },
};
