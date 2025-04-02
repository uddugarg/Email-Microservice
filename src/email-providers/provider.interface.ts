export interface EmailProviderAdapter {
    initialize(credentials: any): Promise<void>;
    sendEmail(email: EmailRequest): Promise<EmailResponse>;
    validateCredentials(): Promise<boolean>;
    refreshCredentials?(): Promise<any>;
}

export interface EmailRequest {
    from: string;
    to: string[];
    cc?: string[];
    bcc?: string[];
    subject: string;
    body: string;
    isHtml?: boolean;
    attachments?: Attachment[];
    replyTo?: string;
}

export interface EmailResponse {
    success: boolean;
    messageId?: string;
    error?: {
        code: string;
        message: string;
    };
    providerResponse: any;
}

export interface Attachment {
    filename: string;
    content: string | Buffer;
    contentType: string;
}