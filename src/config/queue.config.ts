import { QueueAdapter, RabbitMQAdapter, SQSAdapter } from '../queue';
import { logger } from '../utils/logger';

export async function initializeQueueAdapter(): Promise<QueueAdapter> {
    const queueType = process.env.QUEUE_TYPE || 'rabbitmq';
    logger.info(`Initializing queue adapter: ${queueType}`);

    try {
        let adapter: QueueAdapter;

        switch (queueType) {
            case 'sqs':
                // Validate required SQS environment variables
                const requiredSQSVars = [
                    'AWS_REGION',
                    'SQS_SEND_EMAIL_QUEUE_URL',
                    'AWS_ACCESS_KEY_ID',
                    'AWS_SECRET_ACCESS_KEY'
                ];
                const missingVars = requiredSQSVars.filter(v => !process.env[v]);

                if (missingVars.length > 0) {
                    throw new Error(`Missing required SQS environment variables: ${missingVars.join(', ')}`);
                }

                adapter = new SQSAdapter({
                    region: process.env.AWS_REGION || 'us-east-1',
                    queueUrls: {
                        'send-email': process.env.SQS_SEND_EMAIL_QUEUE_URL || '',
                        'send-email-delay': process.env.SQS_SEND_EMAIL_DELAY_QUEUE_URL || '',
                        'dead-letter': process.env.SQS_DEAD_LETTER_QUEUE_URL || ''
                    },
                    credentials: {
                        accessKeyId: process.env.AWS_ACCESS_KEY_ID || "",
                        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "",
                    }
                });
                break;

            case 'rabbitmq':
            default:
                // Validate RabbitMQ URL
                if (!process.env.RABBITMQ_URL) {
                    throw new Error('RABBITMQ_URL environment variable is not set');
                }

                adapter = new RabbitMQAdapter(
                    process.env.RABBITMQ_URL || 'amqp://localhost'
                );
                break;
        }

        // Measure initialization time
        const startTime = Date.now();
        await adapter.initialize();
        const initTime = Date.now() - startTime;

        logger.info(`Queue adapter ${queueType} initialized successfully in ${initTime}ms`);
        return adapter;

    } catch (error) {
        logger.error('Queue adapter initialization failed:', error);
        throw new Error(`Failed to initialize queue adapter: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}

// Optional: Health check function for queue adapter
export async function checkQueueAdapterHealth(adapter: QueueAdapter): Promise<boolean> {
    try {
        // Implement a basic health check 
        // This could involve trying to publish a test message to a test queue
        // Or checking connection status
        const startTime = Date.now();

        // You might want to implement a specific health check method in your QueueAdapter interface
        // For now, we'll just check if initialization doesn't throw an error
        await adapter.initialize();

        const checkTime = Date.now() - startTime;
        logger.info(`Queue adapter health check completed in ${checkTime}ms`);

        return true;
    } catch (error) {
        logger.error('Queue adapter health check failed:', error);
        return false;
    }
}