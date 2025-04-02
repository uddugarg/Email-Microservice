import nodemailer from 'nodemailer';
import { EmailProviderAdapter, EmailRequest, EmailResponse } from './provider.interface';
import { logger } from '../utils/logger';

export class SMTPProvider implements EmailProviderAdapter {
    private transporter: any;

    async initialize(credentials: any): Promise<void> {
        try {
            this.transporter = nodemailer.createTransport({
                host: credentials.host,
                port: credentials.port,
                secure: credentials.secure,
                auth: {
                    user: credentials.user,
                    pass: credentials.password
                }
            });

            logger.debug('SMTP provider initialized');
        } catch (error) {
            logger.error('Error initializing SMTP provider:', error);
            throw error;
        }
    }

    async sendEmail(email: EmailRequest): Promise<EmailResponse> {
        try {
            const result = await this.transporter.sendMail({
                from: email.from,
                to: email.to.join(', '),
                cc: email.cc?.join(', '),
                bcc: email.bcc?.join(', '),
                subject: email.subject,
                text: !email.isHtml ? email.body : undefined,
                html: email.isHtml ? email.body : undefined,
                replyTo: email.replyTo,
                attachments: email.attachments?.map(att => ({
                    filename: att.filename,
                    content: att.content,
                    contentType: att.contentType
                }))
            });

            logger.info(`Email sent via SMTP: ${result.messageId}`);

            return {
                success: true,
                messageId: result.messageId,
                providerResponse: result
            };
        } catch (error) {
            logger.error('Error sending email via SMTP:', error);
            return {
                success: false,
                error: {
                    code: this.mapErrorCode(error),
                    message: (error as Error).message
                },
                providerResponse: error
            };
        }
    }

    async validateCredentials(): Promise<boolean> {
        try {
            // Verify SMTP connection
            await this.transporter.verify();
            return true;
        } catch (error) {
            logger.error('Error validating SMTP credentials:', error);
            return false;
        }
    }

    private mapErrorCode(error: any): string {
        // Map SMTP error codes to standard error codes
        if (error.code === 'ECONNREFUSED') return 'CONNECTION_ERROR';
        if (error.code === 'ETIMEDOUT') return 'TIMEOUT';
        if (error.code === 'EAUTH') return 'UNAUTHORIZED';
        if (error.responseCode >= 500) return 'SERVER_ERROR';
        if (error.responseCode === 452) return 'RATE_LIMIT_EXCEEDED';

        return 'UNKNOWN_ERROR';
    }
}