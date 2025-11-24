import { api } from './client';

// User Service
export const UserService = {
    getMe: async () => {
        const response = await api.get('/users/me');
        return response.data;
    },

    updateProfile: async (data: any) => {
        const response = await api.put('/users/me', data);
        return response.data;
    },

    uploadMedia: async (data: {
        media_type: 'photo' | 'video';
        file_key: string;
        thumbnail_key?: string;
        duration_seconds?: number;
        display_order: number;
    }) => {
        const response = await api.post('/users/media', data);
        return response.data;
    },

    getUserMedia: async (userId: string) => {
        const response = await api.get(`/users/${userId}/media`);
        return response.data;
    },

    deleteMedia: async (mediaId: string) => {
        const response = await api.delete(`/users/media/${mediaId}`);
        return response.data;
    },

    getPresignedUploadURL: async (mediaType: 'photo' | 'video') => {
        const response = await api.get('/users/media/upload-url', {
            params: { media_type: mediaType },
        });
        return response.data;
    },

    // Batch upload completion - triggers photo moderation
    uploadComplete: async (photos: Array<{ file_key: string; media_type: 'photo' | 'video' }>) => {
        const response = await api.post('/users/media/upload-complete', {
            photos,
        });
        return response.data;
    },
};

// Discovery Service
export const DiscoveryService = {
    getSwipeCards: async () => {
        const response = await api.get('/discover/swipe');
        return response.data;
    },

    swipeAction: async (swipedId: string, action: 'like' | 'pass' | 'super_like') => {
        const response = await api.post('/discover/swipe', {
            swiped_id: swipedId,
            action,
        });
        return response.data;
    },

    getExploreFeed: async (page: number = 1, limit: number = 20) => {
        const response = await api.get('/discover/feed', {
            params: { page, limit },
        });
        return response.data;
    },
};

// Match Service
export const MatchService = {
    getMatches: async () => {
        const response = await api.get('/matches');
        return response.data;
    },

    getMatchDetails: async (matchId: string) => {
        const response = await api.get(`/matches/${matchId}`);
        return response.data;
    },

    unmatch: async (matchId: string) => {
        const response = await api.delete(`/matches/${matchId}`);
        return response.data;
    },
};

// Chat Service
export const ChatService = {
    getChats: async () => {
        const response = await api.get('/chats');
        return response.data;
    },

    getMessages: async (matchId: string, page: number = 1, limit: number = 50) => {
        const response = await api.get(`/chats/${matchId}/messages`, {
            params: { page, limit },
        });
        return response.data;
    },

    sendMessage: async (data: {
        match_id: string;
        message_type: 'text' | 'photo' | 'video' | 'voice' | 'sticker' | 'gift' | 'buna_invite';
        content?: string;
        media_url?: string;
        gift_id?: string;
        metadata?: Record<string, any>;
    }) => {
        const response = await api.post(`/chats/${data.match_id}/messages`, data);
        return response.data;
    },

    markAsRead: async (matchId: string) => {
        const response = await api.put(`/chats/${matchId}/read`);
        return response.data;
    },
};

// Gift Service
export const GiftService = {
    getGifts: async () => {
        const response = await api.get('/gifts');
        return response.data;
    },

    sendGift: async (data: {
        receiver_id: string;
        gift_id: string;
        match_id?: string;
    }) => {
        const response = await api.post('/gifts/send', data);
        return response.data;
    },
};

// Coin Service
export const CoinService = {
    getBalance: async () => {
        const response = await api.get('/coins/balance');
        return response.data;
    },

    purchaseCoins: async (data: {
        coin_amount: number;
        payment_method: 'telebirr' | 'cbe_birr' | 'hellocash' | 'amole';
    }) => {
        const response = await api.post('/coins/purchase', data);
        return response.data;
    },

    getTransactions: async (page: number = 1, limit: number = 50) => {
        const response = await api.get('/coins/transactions', {
            params: { page, limit },
        });
        return response.data;
    },

    getRewardChannels: async () => {
        const response = await api.get('/coins/earn/channels');
        return response.data;
    },

    claimChannelReward: async (channelId: string) => {
        const response = await api.post('/coins/earn/claim', {
            channel_id: channelId,
        });
        return response.data;
    },
};

// Payout Service
export const PayoutService = {
    getBalance: async () => {
        const response = await api.get('/payouts/balance');
        return response.data;
    },

    requestPayout: async (data: {
        amount: number;
        payment_method: 'telebirr' | 'cbe_birr' | 'hellocash' | 'amole';
        payment_account: string;
        payment_account_name?: string;
    }) => {
        const response = await api.post('/payouts/request', data);
        return response.data;
    },

    getHistory: async (page: number = 1, limit: number = 50) => {
        const response = await api.get('/payouts/history', {
            params: { page, limit },
        });
        return response.data;
    },
};

// Leaderboard Service
export const LeaderboardService = {
    getTopGifted: async (timeframe: 'week' | 'month' | 'all' = 'week', limit: number = 20) => {
        const response = await api.get('/leaderboard/top-gifted', {
            params: { timeframe, limit },
        });
        return response.data;
    },
};

// Verification Service
export const VerificationService = {
    submitVerification: async (data: {
        selfie_url: string;
        id_document_url: string;
    }) => {
        const response = await api.post('/verification/submit', data);
        return response.data;
    },

    getStatus: async () => {
        const response = await api.get('/verification/status');
        return response.data;
    },
};

// Report & Block Service
export const ReportService = {
    reportUser: async (data: {
        reported_user_id: string;
        reason: 'inappropriate_content' | 'fake_profile' | 'harassment' | 'scam' | 'other';
        description?: string;
        screenshot_urls?: string[];
    }) => {
        const response = await api.post('/reports', data);
        return response.data;
    },

    reportPhoto: async (data: {
        media_id: string;
        reason: 'inappropriate_content' | 'fake_profile' | 'harassment' | 'scam' | 'other';
        description?: string;
        screenshot_urls?: string[];
    }) => {
        const response = await api.post('/reports/photo', data);
        return response.data;
    },

    blockUser: async (userId: string) => {
        const response = await api.post('/blocks', {
            blocked_user_id: userId,
        });
        return response.data;
    },

    unblockUser: async (userId: string) => {
        const response = await api.delete(`/blocks/${userId}`);
        return response.data;
    },

    getBlockedUsers: async () => {
        const response = await api.get('/blocks');
        return response.data;
    },
};

// Likes Service (Who Likes You)
export const LikesService = {
    getPendingLikes: async () => {
        const response = await api.get('/likes/pending');
        return response.data;
    },

    revealLike: async (data: {
        reveal_all: boolean;
        target_id?: string;
    }) => {
        const response = await api.post('/likes/reveal', data);
        return response.data;
    },
};

