import { api } from './client';

export interface OnboardingStatus {
    onboarding_step: number;
    onboarding_completed: boolean;
    progress: number;
}

export const OnboardingService = {
    getStatus: async (): Promise<OnboardingStatus> => {
        const response = await api.get('/onboarding/status');
        return response.data;
    },

    updateProgress: async (step: number, completed?: boolean): Promise<OnboardingStatus> => {
        const response = await api.patch('/onboarding/progress', {
            step,
            completed,
        });
        return response.data;
    },
};

