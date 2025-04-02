export interface EmailAccount {
    id: string;
    tenantId: string;
    userId: string;
    provider: 'GMAIL' | 'OUTLOOK' | 'SMTP';
    email: string;
    credentials: {
        accessToken: string;
        refreshToken: string;
        expiresAt: number;
    };
    quotaSettings: {
        dailyLimit: number;
        warmupStep: number;
        maxLimit: number;
        currentStage: number;
    };
    status: 'ACTIVE' | 'INACTIVE' | 'WARMING_UP';
}