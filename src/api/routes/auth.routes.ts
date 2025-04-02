import { Router, Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import fetch from 'node-fetch';
import { UserRepository } from '../../repositories/user.repository';
import { logger } from '../../utils/logger';

interface TokenResponse {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
}

interface UserInfo {
    email: string;
    mail?: string;
    userPrincipalName?: string;
}

export function authRouter(userRepository: UserRepository) {
    const router = Router();

    // Start OAuth flow
    router.get('/:provider/authorize', (req: Request, res: Response, next: NextFunction) => {
        try {
            const { provider } = req.params;
            const { tenantId, userId, redirectUri } = req.query;

            if (!tenantId || !userId || !redirectUri) {
                return res.status(400).json({ error: 'Missing required parameters' });
            }

            // Construct state parameter to store tenant and user info
            const state = Buffer.from(JSON.stringify({
                tenantId,
                userId,
                redirectUri
            })).toString('base64');

            // Construct authorization URL based on provider
            let authUrl;

            switch (provider.toLowerCase()) {
                case 'gmail':
                    authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
                        `client_id=${process.env.GMAIL_CLIENT_ID}` +
                        `&redirect_uri=${encodeURIComponent(process.env.GMAIL_REDIRECT_URI || '')}` +
                        `&response_type=code` +
                        `&scope=${encodeURIComponent('https://www.googleapis.com/auth/gmail.send')}` +
                        `&access_type=offline` +
                        `&prompt=consent` +
                        `&state=${encodeURIComponent(state)}`;
                    break;

                case 'outlook':
                    authUrl = `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?` +
                        `client_id=${process.env.OUTLOOK_CLIENT_ID}` +
                        `&redirect_uri=${encodeURIComponent(process.env.OUTLOOK_REDIRECT_URI || '')}` +
                        `&response_type=code` +
                        `&scope=${encodeURIComponent('https://graph.microsoft.com/mail.send offline_access')}` +
                        `&response_mode=query` +
                        `&state=${encodeURIComponent(state)}`;
                    break;

                default:
                    return res.status(400).json({ error: 'Unsupported provider' });
            }

            logger.info(`Initiating OAuth flow for provider: ${provider}, tenant: ${tenantId}, user: ${userId}`);

            // Redirect to provider's authorization page
            res.redirect(authUrl);
        } catch (error) {
            next(error);
        }
    });

    // OAuth callback
    router.get('/:provider/callback', async (req: Request, res: Response, next: NextFunction) => {
        try {
            const { provider } = req.params;
            const { code, state, error } = req.query;

            // Handle OAuth error
            if (error) {
                logger.error(`OAuth error: ${error}`);
                return res.redirect(`/?error=${encodeURIComponent(error as string)}`);
            }

            if (!code || !state) {
                logger.error('Missing code or state parameter');
                return res.status(400).json({ error: 'Missing code or state parameter' });
            }

            // Decode state parameter
            const stateData = JSON.parse(Buffer.from(state as string, 'base64').toString());
            const { tenantId, userId, redirectUri } = stateData;

            logger.info(`OAuth callback for provider: ${provider}, tenant: ${tenantId}, user: ${userId}`);

            // Exchange code for tokens based on provider
            let tokenResponse;

            switch (provider.toLowerCase()) {
                case 'gmail':
                    tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/x-www-form-urlencoded'
                        },
                        body: new URLSearchParams({
                            code: code as string,
                            client_id: process.env.GMAIL_CLIENT_ID || '',
                            client_secret: process.env.GMAIL_CLIENT_SECRET || '',
                            redirect_uri: process.env.GMAIL_REDIRECT_URI || '',
                            grant_type: 'authorization_code'
                        })
                    });
                    break;

                case 'outlook':
                    tokenResponse = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/x-www-form-urlencoded'
                        },
                        body: new URLSearchParams({
                            code: code as string,
                            client_id: process.env.OUTLOOK_CLIENT_ID || '',
                            client_secret: process.env.OUTLOOK_CLIENT_SECRET || '',
                            redirect_uri: process.env.OUTLOOK_REDIRECT_URI || '',
                            grant_type: 'authorization_code'
                        })
                    });
                    break;

                default:
                    return res.status(400).json({ error: 'Unsupported provider' });
            }

            if (!tokenResponse.ok) {
                const errorData = await tokenResponse.text();
                logger.error(`Token exchange failed: ${errorData}`);
                return res.redirect(`${redirectUri}?success=false&error=${encodeURIComponent('Token exchange failed')}`);
            }

            const tokens = await tokenResponse.json() as TokenResponse;

            // Get user email based on provider
            let userEmail;

            if (provider.toLowerCase() === 'gmail') {
                const userInfoResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
                    headers: {
                        'Authorization': `Bearer ${tokens.access_token}`
                    }
                });

                if (userInfoResponse.ok) {
                    const userInfo = await userInfoResponse.json() as UserInfo;
                    userEmail = userInfo.email;
                }
            } else if (provider.toLowerCase() === 'outlook') {
                const userInfoResponse = await fetch('https://graph.microsoft.com/v1.0/me', {
                    headers: {
                        'Authorization': `Bearer ${tokens.access_token}`
                    }
                });

                if (userInfoResponse.ok) {
                    const userInfo = await userInfoResponse.json() as UserInfo;
                    userEmail = userInfo.mail || userInfo.userPrincipalName;
                }
            }

            if (!userEmail) {
                logger.error('Could not retrieve user email');
                return res.redirect(`${redirectUri}?success=false&error=${encodeURIComponent('Could not retrieve user email')}`);
            }

            // Get or create email account
            let account = await userRepository.getEmailAccount(tenantId, userId);

            if (!account) {
                // Create new account
                account = {
                    id: uuidv4(),
                    tenantId,
                    userId,
                    provider: provider.toUpperCase() as any,
                    email: userEmail,
                    credentials: {
                        accessToken: tokens.access_token,
                        refreshToken: tokens.refresh_token || '',
                        expiresAt: Date.now() + (tokens.expires_in * 1000)
                    },
                    quotaSettings: {
                        dailyLimit: 50,
                        warmupStep: 10,
                        maxLimit: 500,
                        currentStage: 1
                    },
                    status: 'WARMING_UP'
                };

                await userRepository.saveEmailAccount(account);
                logger.info(`Created new email account for ${userEmail}`);
            } else {
                // Update existing account
                await userRepository.updateEmailAccount(account.id, {
                    email: userEmail,
                    credentials: {
                        accessToken: tokens.access_token,
                        refreshToken: tokens.refresh_token || account.credentials.refreshToken,
                        expiresAt: Date.now() + (tokens.expires_in * 1000)
                    },
                    status: 'ACTIVE'
                });
                logger.info(`Updated existing email account for ${userEmail}`);
            }

            // Redirect back to frontend with success
            res.redirect(`${redirectUri}?success=true&provider=${provider}&email=${encodeURIComponent(userEmail)}`);
        } catch (error) {
            logger.error('Error in OAuth callback:', error);

            // Redirect back to frontend with error
            const redirectUri = req.query.state ?
                JSON.parse(Buffer.from(req.query.state as string, 'base64').toString()).redirectUri :
                '/';

            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            res.redirect(`${redirectUri}?success=false&error=${encodeURIComponent(errorMessage)}`);
        }
    });

    return router;
}