import { Database } from './database';
import { EmailLog } from '../models/email-log.model';
import { logger } from '../utils/logger';

export interface LoggingRepository {
    logEvent(log: EmailLog): Promise<void>;
    updateLogStatus(id: string, status: string, details?: string, extraData?: any): Promise<void>;
    getLogsByEventId(eventId: string): Promise<EmailLog[]>;
    getLogsByTenantAndUser(
        tenantId: string,
        userId: string,
        pagination: { page: number; limit: number }
    ): Promise<{ logs: EmailLog[]; total: number }>;
}

export class PostgresLoggingRepository implements LoggingRepository {
    constructor(private db: Database) { }

    async logEvent(log: EmailLog): Promise<void> {
        try {
            await this.db.query(
                `INSERT INTO email_logs 
         (id, event_id, tenant_id, user_id, from_email, to_email, subject, timestamp, status, status_details, provider_response)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
                [
                    log.id,
                    log.eventId,
                    log.tenantId,
                    log.userId,
                    log.fromEmail,
                    log.toEmail,
                    log.subject,
                    log.timestamp,
                    log.status,
                    log.statusDetails || null,
                    log.providerResponse ? JSON.stringify(log.providerResponse) : null
                ]
            );

            logger.info(`Logged email event: ${log.eventId} with status ${log.status}`);
        } catch (error) {
            logger.error('Error logging email event:', error);
            throw error;
        }
    }

    async updateLogStatus(id: string, status: string, details?: string, extraData?: any): Promise<void> {
        try {
            const updates: string[] = ['status = $1'];
            const values: any[] = [status];
            let paramIndex = 2;

            if (details) {
                updates.push(`status_details = $${paramIndex++}`);
                values.push(details);
            }

            if (extraData) {
                // Handle additional fields in extraData
                if (extraData.providerResponse) {
                    updates.push(`provider_response = $${paramIndex++}`);
                    values.push(JSON.stringify(extraData.providerResponse));
                }

                if (extraData.fromEmail) {
                    updates.push(`from_email = $${paramIndex++}`);
                    values.push(extraData.fromEmail);
                }
            }

            // Add the ID as the last parameter
            values.push(id);

            await this.db.query(
                `UPDATE email_logs SET ${updates.join(', ')} WHERE id = $${paramIndex}`,
                values
            );

            logger.debug(`Updated log ${id} status to ${status}`);
        } catch (error) {
            logger.error(`Error updating log status for ${id}:`, error);
            throw error;
        }
    }

    async getLogsByEventId(eventId: string): Promise<EmailLog[]> {
        try {
            const result = await this.db.query(
                'SELECT * FROM email_logs WHERE event_id = $1 ORDER BY timestamp DESC',
                [eventId]
            );

            return result.rows.map(this.mapRowToEmailLog);
        } catch (error) {
            logger.error(`Error getting logs for event ${eventId}:`, error);
            throw error;
        }
    }

    async getLogsByTenantAndUser(
        tenantId: string,
        userId: string,
        pagination: { page: number; limit: number }
    ): Promise<{ logs: EmailLog[]; total: number }> {
        try {
            const offset = (pagination.page - 1) * pagination.limit;

            // Get total count
            const countResult = await this.db.query(
                'SELECT COUNT(*) as total FROM email_logs WHERE tenant_id = $1 AND user_id = $2',
                [tenantId, userId]
            );
            const total = parseInt(countResult.rows[0].total, 10);

            // Get paginated results
            const result = await this.db.query(
                `SELECT * FROM email_logs 
         WHERE tenant_id = $1 AND user_id = $2 
         ORDER BY timestamp DESC 
         LIMIT $3 OFFSET $4`,
                [tenantId, userId, pagination.limit, offset]
            );

            return {
                logs: result.rows.map(this.mapRowToEmailLog),
                total
            };
        } catch (error) {
            logger.error(`Error getting logs for tenant ${tenantId}, user ${userId}:`, error);
            throw error;
        }
    }

    private mapRowToEmailLog(row: any): EmailLog {
        return {
            id: row.id,
            eventId: row.event_id,
            tenantId: row.tenant_id,
            userId: row.user_id,
            fromEmail: row.from_email,
            toEmail: row.to_email,
            subject: row.subject,
            timestamp: row.timestamp,
            status: row.status,
            statusDetails: row.status_details,
            providerResponse: row.provider_response ? JSON.parse(row.provider_response) : undefined
        };
    }
}