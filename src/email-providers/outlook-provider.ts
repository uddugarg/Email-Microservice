import { Client } from '@microsoft/microsoft-graph-client';
import fetch from 'node-fetch';
import { EmailProviderAdapter, EmailRequest, EmailResponse } from './provider.interface';
import { logger } from '../utils/logger';

export class OutlookProvider implements EmailProviderAdapter {
    private client!: Client;
    private credentials: any;

    async initialize(credentials: any): Promise<void> {
        try {
            this.credentials = credentials;

            const authProvider = {
                getAccessToken: async () => {
                    // Check if token is expired and refresh if needed
                    if (credentials.expiresAt < Date.now()) {
                        const newCredentials = await this.refreshCredentials();
                        this.credentials = newCredentials;
                        return newCredentials.accessToken;
                    }
                    return credentials.accessToken;
                }
            };

            this.client = Client.initWithMiddleware({
                authProvider: authProvider as any
            });

            logger.debug('Outlook provider initialized');
        } catch (error) {
            logger.error('Error initializing Outlook provider:', error);
            throw error;
        }
    }

    async sendEmail(email: EmailRequest): Promise<EmailResponse> {
        try {
            // Create message object
            const message = {
                subject: email.subject,
                body: {
                    contentType: email.isHtml ? 'html' : 'text',
                    content: email.body
                },
                toRecipients: email.to.map(to => ({
                    emailAddress: { address: to }
                })),
                ccRecipients: email.cc?.map(cc => ({
                    emailAddress: { address: cc }
                })) || [],
                bccRecipients: email.bcc?.map(bcc => ({
                    emailAddress: { address: bcc }
                })) || []
            };

            // Send mail
            const response = await this.client.api('/me/sendMail').post({
                message,
                saveToSentItems: true
            });

            logger.info(`Email sent via Outlook`);

            return {
                success: true,
                providerResponse: response
            };
        } catch (error) {
            logger.error('Error sending email via Outlook:', error);
            return {
                success: false,
                error: {
                    code: this.mapErrorCode(error),
                    message: (error as any).message || 'Unknown error'
                },
                providerResponse: error
            };
        }
    }

    async validateCredentials(): Promise<boolean> {
        try {
            // Check if token is valid by getting user info
            await this.client.api('/me').get();
            return true;
        } catch (error) {
            logger.error('Error validating Outlook credentials:', error);
            if ((error as any).statusCode === 401) {
                try {
                    // Try to refresh the token
                    await this.refreshCredentials();
                    return true;
                } catch (refreshError) {
                    logger.error('Error refreshing Outlook credentials:', refreshError);
                    return false;
                }
            }
            return false;
        }
    }

    async refreshCredentials(): Promise<any> {
        try {
            // Refresh token logic for Outlook
            const response = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                body: new URLSearchParams({
                    client_id: process.env.OUTLOOK_CLIENT_ID as string,
                    client_secret: process.env.OUTLOOK_CLIENT_SECRET as string,
                    refresh_token: this.credentials.refreshToken,
                    grant_type: 'refresh_token'
                })
            });

            if (!response.ok) {
                throw new Error('Failed to refresh token');
            }

            const data = await response.json();

            logger.info('Outlook credentials refreshed successfully');

            const newCredentials = {
                accessToken: data.access_token,
                refreshToken: data.refresh_token || this.credentials.refreshToken,
                expiresAt: Date.now() + (data.expires_in * 1000)
            };

            // Update the client credentials
            this.credentials = newCredentials;

            return newCredentials;
        } catch (error) {
            logger.error('Error refreshing Outlook credentials:', error);
            throw error;
        }
    }

    private mapErrorCode(error: any): string {
        const status = error.statusCode;

        if (status === 429) return 'RATE_LIMIT_EXCEEDED';
        if (status >= 500) return 'SERVER_ERROR';
        if (status === 401) return 'UNAUTHORIZED';
        if (status === 403) return 'FORBIDDEN';
        if (status === 404) return 'NOT_FOUND';

        return 'UNKNOWN_ERROR';
    }
}