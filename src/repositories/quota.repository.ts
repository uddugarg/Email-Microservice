import { Database } from './database';
import { EmailAccount } from '../models/email-account.model';
import { QuotaUsage } from '../models/quota-usage.model';
import { logger } from '../utils/logger';

export interface QuotaRepository {
    getAccount(accountId: string): Promise<EmailAccount>;
    updateAccount(accountId: string, updates: Partial<EmailAccount>): Promise<void>;
    getQuotaUsage(accountId: string, date: string): Promise<QuotaUsage | null>;
    saveQuotaUsage(usage: QuotaUsage): Promise<void>;
    getLastWeekUsage(accountId: string): Promise<QuotaUsage[]>;
    getAllAccounts(): Promise<EmailAccount[]>;
}

export class PostgresQuotaRepository implements QuotaRepository {
    constructor(private db: Database) { }

    async getAccount(accountId: string): Promise<EmailAccount> {
        try {
            const result = await this.db.query(
                'SELECT * FROM email_accounts WHERE id = $1',
                [accountId]
            );

            if (result.rows.length === 0) {
                throw new Error(`Account not found: ${accountId}`);
            }

            return {
                id: result.rows[0].id,
                tenantId: result.rows[0].tenant_id,
                userId: result.rows[0].user_id,
                provider: result.rows[0].provider,
                email: result.rows[0].email,
                credentials: result.rows[0].credentials,
                quotaSettings: result.rows[0].quota_settings,
                status: result.rows[0].status
            };
        } catch (error) {
            logger.error(`Error getting account ${accountId}:`, error);
            throw error;
        }
    }

    async updateAccount(accountId: string, updates: Partial<EmailAccount>): Promise<void> {
        try {
            const updateFields: string[] = [];
            const values: any[] = [];
            let paramIndex = 1;

            if (updates.quotaSettings) {
                updateFields.push(`quota_settings = $${paramIndex++}`);
                values.push(JSON.stringify(updates.quotaSettings));
            }

            if (updates.status) {
                updateFields.push(`status = $${paramIndex++}`);
                values.push(updates.status);
            }

            // Always update the updated_at timestamp
            updateFields.push(`updated_at = $${paramIndex++}`);
            values.push(new Date());

            // Add the ID as the last parameter
            values.push(accountId);

            await this.db.query(
                `UPDATE email_accounts SET ${updateFields.join(', ')} WHERE id = $${paramIndex}`,
                values
            );

            logger.info(`Updated account quota settings: ${accountId}`);
        } catch (error) {
            logger.error(`Error updating account ${accountId}:`, error);
            throw error;
        }
    }

    async getQuotaUsage(accountId: string, date: string): Promise<QuotaUsage | null> {
        try {
            const result = await this.db.query(
                'SELECT * FROM quota_usage WHERE account_id = $1 AND date = $2',
                [accountId, date]
            );

            if (result.rows.length === 0) {
                return null;
            }

            return {
                accountId: result.rows[0].account_id,
                date: result.rows[0].date,
                sent: result.rows[0].sent,
                failed: result.rows[0].failed,
                remaining: result.rows[0].remaining
            };
        } catch (error) {
            logger.error(`Error getting quota usage for account ${accountId}:`, error);
            throw error;
        }
    }

    async saveQuotaUsage(usage: QuotaUsage): Promise<void> {
        try {
            // Use upsert to handle both insert and update
            await this.db.query(
                `INSERT INTO quota_usage (account_id, date, sent, failed, remaining)
             VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT (account_id, date) 
             DO UPDATE SET sent = $3, failed = $4, remaining = $5`,
                [
                    usage.accountId,
                    usage.date,
                    usage.sent,
                    usage.failed,
                    usage.remaining
                ]
            );

            logger.debug(`Updated quota usage for account ${usage.accountId}: ${usage.sent} sent, ${usage.remaining} remaining`);
        } catch (error) {
            logger.error(`Error saving quota usage for account ${usage.accountId}:`, error);
            throw error;
        }
    }

    async getLastWeekUsage(accountId: string): Promise<QuotaUsage[]> {
        try {
            // Get usage for the past 7 days
            const result = await this.db.query(
                `SELECT * FROM quota_usage 
             WHERE account_id = $1 
             AND date >= $2
             ORDER BY date DESC`,
                [accountId, new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]]
            );

            return result.rows.map(row => ({
                accountId: row.account_id,
                date: row.date,
                sent: row.sent,
                failed: row.failed,
                remaining: row.remaining
            }));
        } catch (error) {
            logger.error(`Error getting last week usage for account ${accountId}:`, error);
            throw error;
        }
    }

    async getAllAccounts(): Promise<EmailAccount[]> {
        try {
            const result = await this.db.query(
                'SELECT * FROM email_accounts'
            );

            return result.rows.map(row => ({
                id: row.id,
                tenantId: row.tenant_id,
                userId: row.user_id,
                provider: row.provider,
                email: row.email,
                credentials: row.credentials,
                quotaSettings: row.quota_settings,
                status: row.status
            }));
        } catch (error) {
            logger.error('Error getting all accounts:', error);
            throw error;
        }
    }
}
