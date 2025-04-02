import { QueueAdapter } from '../queue/queue.interface';
import { SQSAdapter } from '../queue/sqs.adapter';
import { logger } from '../utils/logger';

export async function initializeQueueAdapter(): Promise<QueueAdapter> {
    const queueType = process.env.QUEUE_TYPE || 'rabbitmq';

    logger.info(`Initializing queue adapter: ${queueType}`);

    // if (queueType === 'sqs') {
    // AWS SQS adapter
    return new SQSAdapter({
        region: process.env.AWS_REGION || 'eu-north-1',
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
    // } else {
    //     // Default to RabbitMQ
    //     return new RabbitMQAdapter(process.env.RABBITMQ_URL || 'amqp://localhost');
    // }
}