import { Pool, PoolClient } from 'pg';
import { logger } from '../utils/logger';

export class Database {
    private pool: Pool;

    constructor(connectionString: string) {
        this.pool = new Pool({
            connectionString,
            max: 20,
            idleTimeoutMillis: 30000,
            connectionTimeoutMillis: 2000,
        });

        // Test the connection
        this.pool.query('SELECT NOW()', (err) => {
            if (err) {
                logger.error('Database connection error:', err);
            } else {
                logger.info('Database connected successfully');
            }
        });
    }

    async query(text: string, params: any[] = []): Promise<any> {
        const start = Date.now();
        try {
            const result = await this.pool.query(text, params);
            const duration = Date.now() - start;

            logger.debug('Executed query', { text, duration, rows: result.rowCount });
            return result;
        } catch (error) {
            logger.error('Query error:', { text, error });
            throw error;
        }
    }

    async getClient(): Promise<PoolClient> {
        const client = await this.pool.connect();
        return client;
    }

    async close(): Promise<void> {
        await this.pool.end();
        logger.info('Database connection closed');
    }
}