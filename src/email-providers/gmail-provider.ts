import { google } from 'googleapis';
import { EmailProviderAdapter, EmailRequest, EmailResponse } from './provider.interface';
import { logger } from '../utils/logger';

export class GmailProvider implements EmailProviderAdapter {
    private oauth2Client: any;
    private gmail: any;

    async initialize(credentials: any): Promise<void> {
        try {
            this.oauth2Client = new google.auth.OAuth2(
                process.env.GMAIL_CLIENT_ID,
                process.env.GMAIL_CLIENT_SECRET,
                process.env.GMAIL_REDIRECT_URI
            );

            this.oauth2Client.setCredentials({
                access_token: credentials.accessToken,
                refresh_token: credentials.refreshToken,
                expiry_date: credentials.expiresAt
            });

            this.gmail = google.gmail({
                version: 'v1',
                auth: this.oauth2Client
            });

            logger.debug('Gmail provider initialized');
        } catch (error) {
            logger.error('Error initializing Gmail provider:', error);
            throw error;
        }
    }

    async sendEmail(email: EmailRequest): Promise<EmailResponse> {
        try {
            // Create MIME message
            const mimeMessage = this.createMimeMessage(email);

            // Base64 encode the MIME message
            const encodedMessage = Buffer.from(mimeMessage)
                .toString('base64')
                .replace(/\+/g, '-')
                .replace(/\//g, '_')
                .replace(/=+$/, '');

            // Send the email
            const response = await this.gmail.users.messages.send({
                userId: 'me',
                requestBody: {
                    raw: encodedMessage
                }
            });

            logger.info(`Email sent via Gmail: ${response.data.id}`);

            return {
                success: true,
                messageId: response.data.id,
                providerResponse: response.data
            };
        } catch (error) {
            logger.error('Error sending email via Gmail:', error);
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
            // Try to get user profile to check if credentials are valid
            await this.gmail.users.getProfile({ userId: 'me' });
            return true;
        } catch (error) {
            logger.error('Error validating Gmail credentials:', error);
            if ((error as any).code === 401) {
                try {
                    // Try to refresh the token
                    await this.refreshCredentials();
                    return true;
                } catch (refreshError) {
                    logger.error('Error refreshing Gmail credentials:', refreshError);
                    return false;
                }
            }
            return false;
        }
    }

    async refreshCredentials(): Promise<any> {
        try {
            // Force token refresh
            const { credentials } = await this.oauth2Client.refreshAccessToken();
            this.oauth2Client.setCredentials(credentials);

            logger.info('Gmail credentials refreshed successfully');

            // Return new credentials to be saved
            return {
                accessToken: credentials.access_token,
                refreshToken: credentials.refresh_token || this.oauth2Client.credentials.refresh_token,
                expiresAt: credentials.expiry_date
            };
        } catch (error) {
            logger.error('Error refreshing Gmail credentials:', error);
            throw error;
        }
    }

    private createMimeMessage(email: EmailRequest): string {
        // Simple MIME message builder
        const headers = [
            `From: ${email.from}`,
            `To: ${email.to.join(', ')}`,
            email.cc?.length ? `Cc: ${email.cc.join(', ')}` : '',
            email.bcc?.length ? `Bcc: ${email.bcc.join(', ')}` : '',
            email.replyTo ? `Reply-To: ${email.replyTo}` : '',
            `Subject: ${email.subject}`,
            'MIME-Version: 1.0',
            `Content-Type: ${email.isHtml ? 'text/html' : 'text/plain'}; charset=utf-8`,
            'Content-Transfer-Encoding: 7bit',
            ''
        ].filter(Boolean).join('\r\n');

        return `${headers}\r\n${email.body}`;
    }

    private mapErrorCode(error: any): string {
        const status = error.code;

        if (status === 429) return 'RATE_LIMIT_EXCEEDED';
        if (status >= 500) return 'SERVER_ERROR';
        if (status === 401) return 'UNAUTHORIZED';
        if (status === 403) return 'FORBIDDEN';
        if (status === 404) return 'NOT_FOUND';

        return 'UNKNOWN_ERROR';
    }
}