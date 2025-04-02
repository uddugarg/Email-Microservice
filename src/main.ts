// Main application entry point
import dotenv from 'dotenv';
import { createApp } from './api';
import { Database } from './repositories/database';
import { PostgresUserRepository } from './repositories/user.repository';
import { PostgresLoggingRepository } from './repositories/logging.repository';
import { initializeQueueAdapter } from './config/queue.config';
import { logger } from './utils/logger';

// Load environment variables
dotenv.config();

async function main() {
    try {
        // Initialize database connection
        const db = new Database(process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/email_service');

        // Initialize repositories
        const userRepository = new PostgresUserRepository(db);
        const loggingRepository = new PostgresLoggingRepository(db);

        // Initialize queue adapter
        const queueAdapter = await initializeQueueAdapter();

        // Create Express app
        const app = createApp(userRepository, loggingRepository, queueAdapter);

        // Start API server
        const port = process.env.PORT || 3001;
        app.listen(port, () => {
            logger.info(`Server listening on port ${port}`);
        });

        // Handle graceful shutdown
        process.on('SIGINT', async () => {
            logger.info('Shutting down...');

            try {
                await queueAdapter.close();
                await db.close();

                logger.info('Graceful shutdown completed');
                process.exit(0);
            } catch (err) {
                logger.error('Error during shutdown:', err);
                process.exit(1);
            }
        });
    } catch (err) {
        logger.error('Failed to start application:', err);
        process.exit(1);
    }
}

// Start the application
main();