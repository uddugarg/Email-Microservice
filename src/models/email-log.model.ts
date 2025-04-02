export interface EmailLog {
    id: string;
    eventId: string;
    tenantId: string;
    userId: string;
    fromEmail: string;
    toEmail: string;
    subject: string;
    timestamp: Date;
    status: 'QUEUED' | 'PROCESSING' | 'SENT' | 'FAILED' | 'REJECTED' | 'REQUEUED';
    statusDetails?: string;
    providerResponse?: any;
}