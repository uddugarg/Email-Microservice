import { Database } from './database';
import { EmailAccount } from '../models/email-account.model';
import { logger } from '../utils/logger';

export interface UserRepository {
    resolveEmailAddress(tenantId: string, userId: string): Promise<string | null>;
    getEmailAccount(tenantId: string, userId: string): Promise<EmailAccount | null>;
    saveEmailAccount(account: EmailAccount): Promise<void>;
    updateEmailAccount(id: string, updates: Partial<EmailAccount>): Promise<void>;
    listEmailAccounts(tenantId: string): Promise<EmailAccount[]>;
}

export class PostgresUserRepository implements UserRepository {
    constructor(private db: Database) { }

    async resolveEmailAddress(tenantId: string, userId: string): Promise<string | null> {
        try {
            const result = await this.db.query(
                'SELECT email FROM email_accounts WHERE tenant_id = $1 AND user_id = $2 AND status = $3 LIMIT 1',
                [tenantId, userId, 'ACTIVE']
            );

            if (result.rows.length === 0) {
                return null;
            }

            return result.rows[0].email;
        } catch (error) {
            logger.error('Error resolving email address:', error);
            throw error;
        }
    }

    async getEmailAccount(tenantId: string, userId: string): Promise<EmailAccount | null> {
        try {
            const result = await this.db.query(
                'SELECT * FROM email_accounts WHERE tenant_id = $1 AND user_id = $2 LIMIT 1',
                [tenantId, userId]
            );

            if (result.rows.length === 0) {
                return null;
            }

            return this.mapRowToEmailAccount(result.rows[0]);
        } catch (error) {
            logger.error('Error getting email account:', error);
            throw error;
        }
    }

    async saveEmailAccount(account: EmailAccount): Promise<void> {
        try {
            await this.db.query(
                `INSERT INTO email_accounts 
         (id, tenant_id, user_id, provider, email, credentials, quota_settings, status) 
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
                [
                    account.id,
                    account.tenantId,
                    account.userId,
                    account.provider,
                    account.email,
                    JSON.stringify(account.credentials),
                    JSON.stringify(account.quotaSettings),
                    account.status
                ]
            );

            logger.info(`Saved email account: ${account.id} for user ${account.userId}`);
        } catch (error) {
            logger.error('Error saving email account:', error);
            throw error;
        }
    }

    async updateEmailAccount(id: string, updates: Partial<EmailAccount>): Promise<void> {
        try {
            // Build dynamic update query based on provided fields
            const updateFields: string[] = [];
            const values: any[] = [];
            let paramIndex = 1;

            if (updates.email) {
                updateFields.push(`email = $${paramIndex++}`);
                values.push(updates.email);
            }

            if (updates.credentials) {
                updateFields.push(`credentials = $${paramIndex++}`);
                values.push(JSON.stringify(updates.credentials));
            }

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
            values.push(id);

            await this.db.query(
                `UPDATE email_accounts SET ${updateFields.join(', ')} WHERE id = $${paramIndex}`,
                values
            );

            logger.info(`Updated email account: ${id}`);
        } catch (error) {
            logger.error('Error updating email account:', error);
            throw error;
        }
    }

    async listEmailAccounts(tenantId: string): Promise<EmailAccount[]> {
        try {
            const result = await this.db.query(
                'SELECT * FROM email_accounts WHERE tenant_id = $1 ORDER BY updated_at DESC',
                [tenantId]
            );

            return result.rows.map(this.mapRowToEmailAccount);
        } catch (error) {
            logger.error('Error listing email accounts:', error);
            throw error;
        }
    }

    private mapRowToEmailAccount(row: any): EmailAccount {
        return {
            id: row.id,
            tenantId: row.tenant_id,
            userId: row.user_id,
            provider: row.provider,
            email: row.email,
            credentials: row.credentials,
            quotaSettings: row.quota_settings,
            status: row.status
        };
    }
}