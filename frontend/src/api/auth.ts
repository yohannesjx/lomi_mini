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
        const response = await api.post<AuthResponse>('/auth/telegram', {}, {
            headers: {
                'Authorization': `tma ${initData}`,
            },
        });
        return response.data;
    },

    logout: async () => {
        // TODO: Clear tokens from storage
    },
};
