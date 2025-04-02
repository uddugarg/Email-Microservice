// Main entry point for the email processor service
import dotenv from 'dotenv';
import { initializeQueueAdapter } from '../config/queue.config';
import { Database } from '../repositories/database';
import { PostgresUserRepository } from '../repositories/user.repository';
import { PostgresQuotaRepository } from '../repositories/quota.repository';
import { PostgresLoggingRepository } from '../repositories/logging.repository';
import { EmailValidator } from '../email-validation/email-validator';
import { EmailProviderFactory } from '../email-providers/provider-factory';
import { EmailProcessor } from './email-processor';
import { logger } from '../utils/logger';

// Load environment variables
dotenv.config();

async function main() {
    try {
        // Initialize database connection
        const db = new Database(process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/email_service');

        // Initialize repositories
        const userRepository = new PostgresUserRepository(db);
        const quotaRepository = new PostgresQuotaRepository(db);
        const loggingRepository = new PostgresLoggingRepository(db);

        // Initialize services
        const emailValidationService = new EmailValidator();
        const emailProviderFactory = new EmailProviderFactory();

        // Initialize queue adapter
        const queueAdapter = await initializeQueueAdapter();

        // Create and start email processor
        const emailProcessor = new EmailProcessor(
            queueAdapter,
            userRepository,
            quotaRepository,
            emailValidationService,
            emailProviderFactory,
            loggingRepository
        );

        await emailProcessor.start();
        logger.info('Email processor started successfully');

        // Handle graceful shutdown
        process.on('SIGINT', async () => {
            logger.info('Shutting down email processor...');

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
        logger.error('Failed to start email processor:', err);
        process.exit(1);
    }
}

// Start the processor
main();