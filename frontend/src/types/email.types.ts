export interface SendEmailRequest {
    tenantId: string;
    userId: string;
    toAddress?: string;
    subject: string;
    body: string;
    metadata?: {
        priority?: 'HIGH' | 'NORMAL' | 'LOW';
        attachments?: Attachment[];
        replyTo?: string;
        cc?: string[];
        bcc?: string[];
    };
}

export interface Attachment {
    filename: string;
    content: string;
    contentType: string;
}

export interface EmailLog {
    id: string;
    eventId: string;
    tenantId: string;
    userId: string;
    fromEmail: string;
    toEmail: string;
    subject: string;
    timestamp: string;
    status: 'QUEUED' | 'PROCESSING' | 'SENT' | 'FAILED' | 'REJECTED' | 'REQUEUED';
    statusDetails?: string;
}