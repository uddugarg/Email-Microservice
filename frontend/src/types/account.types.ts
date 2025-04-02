export interface EmailAccount {
    id: string;
    tenantId: string;
    userId: string;
    provider: 'GMAIL' | 'OUTLOOK' | 'SMTP';
    email: string;
    status: 'ACTIVE' | 'INACTIVE' | 'WARMING_UP';
    quotaSettings: {
        dailyLimit: number;
        warmupStep: number;
        maxLimit: number;
        currentStage: number;
    };
}