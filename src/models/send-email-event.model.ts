export interface SendEmailEvent {
    id: string;
    toAddress?: string;
    tenantId: string;
    userId: string;
    subject: string;
    body: string;
    metadata?: {
        priority?: 'HIGH' | 'NORMAL' | 'LOW';
        attachments?: Attachment[];
        replyTo?: string;
        cc?: string[];
        bcc?: string[];
    };
    retryCount?: number;
    status?: string;
}

export interface Attachment {
    filename: string;
    content: string | Buffer;
    contentType: string;
}