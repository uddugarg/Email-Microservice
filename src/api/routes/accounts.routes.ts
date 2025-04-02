import { Router, Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { UserRepository } from '../../repositories/user.repository';
import { EmailAccount } from '../../models/email-account.model';
import { logger } from '../../utils/logger';

export function accountsRouter(userRepository: UserRepository) {
    const router = Router();

    // Create new email account
    router.post('/', async (req: Request, res: Response, next: NextFunction) => {
        try {
            const { tenantId, userId, provider, email } = req.body;

            if (!tenantId || !userId || !provider || !email) {
                return res.status(400).json({ error: 'Missing required fields' });
            }

            // Check if account already exists
            const existingAccount = await userRepository.getEmailAccount(tenantId, userId);
            if (existingAccount) {
                return res.status(409).json({ error: 'Account already exists for this user' });
            }

            // Create new account
            const account: EmailAccount = {
                id: uuidv4(),
                tenantId,
                userId,
                provider,
                email,
                credentials: {
                    accessToken: '',
                    refreshToken: '',
                    expiresAt: 0
                },
                quotaSettings: {
                    dailyLimit: 50,  // Default starting limit
                    warmupStep: 10,  // Increase by 10 per day
                    maxLimit: 500,   // Maximum limit
                    currentStage: 1  // Initial stage
                },
                status: 'INACTIVE'
            };

            await userRepository.saveEmailAccount(account);

            logger.info(`Created new email account for tenant: ${tenantId}, user: ${userId}`);

            res.status(201).json({
                id: account.id,
                tenantId: account.tenantId,
                userId: account.userId,
                provider: account.provider,
                email: account.email,
                status: account.status
            });
        } catch (error) {
            next(error);
        }
    });

    // List accounts
    router.get('/', async (req: Request, res: Response, next: NextFunction) => {
        try {
            const { tenantId } = req.query;

            if (!tenantId) {
                return res.status(400).json({ error: 'tenantId is required' });
            }

            const accounts = await userRepository.listEmailAccounts(tenantId as string);

            // Remove sensitive data
            const sanitizedAccounts = accounts.map(account => ({
                id: account.id,
                tenantId: account.tenantId,
                userId: account.userId,
                provider: account.provider,
                email: account.email,
                status: account.status,
                quotaSettings: account.quotaSettings
            }));

            res.json(sanitizedAccounts);
        } catch (error) {
            next(error);
        }
    });

    // Get account details
    router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
        try {
            const { id } = req.params;
            const { tenantId } = req.query;

            if (!tenantId) {
                return res.status(400).json({ error: 'tenantId is required' });
            }

            // For simplicity, we're just listing all accounts and filtering by ID
            // In production, you'd want a direct lookup by ID with tenant validation
            const accounts = await userRepository.listEmailAccounts(tenantId as string);
            const account = accounts.find(a => a.id === id);

            if (!account) {
                return res.status(404).json({ error: 'Account not found' });
            }

            // Remove sensitive data
            const sanitizedAccount = {
                id: account.id,
                tenantId: account.tenantId,
                userId: account.userId,
                provider: account.provider,
                email: account.email,
                status: account.status,
                quotaSettings: account.quotaSettings
            };

            res.json(sanitizedAccount);
        } catch (error) {
            next(error);
        }
    });

    // Update account
    router.put('/:id', async (req: Request, res: Response, next: NextFunction) => {
        try {
            const { id } = req.params;
            const { quotaSettings, status } = req.body;

            // For simplicity, we're allowing updates to quota settings and status only
            const updates: Partial<EmailAccount> = {};

            if (quotaSettings) {
                updates.quotaSettings = quotaSettings;
            }

            if (status) {
                updates.status = status;
            }

            await userRepository.updateEmailAccount(id, updates);

            logger.info(`Updated account ${id}`);

            res.json({ id, updated: true });
        } catch (error) {
            next(error);
        }
    });

    // Delete account (placeholder)
    router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
        try {
            // This is a placeholder - in a real implementation, you would implement
            // soft delete or handle cascading deletes for related data
            res.status(501).json({ error: 'Not implemented' });
        } catch (error) {
            next(error);
        }
    });

    return router;
}