export interface QuotaUsage {
    accountId: string;
    date: string;
    sent: number;
    failed: number;
    remaining: number;
}