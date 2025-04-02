import amqp from 'amqplib';
import { QueueAdapter } from './queue.interface';
import { logger } from '../utils/logger';

export class RabbitMQAdapter implements QueueAdapter {
    private connection: amqp.Connection;
    private channel: amqp.Channel;
    private url: string;

    constructor(url: string) {
        this.url = url;
    }

    async initialize(): Promise<void> {
        try {
            this.connection = await amqp.connect(this.url);
            this.channel = await this.connection.createChannel();

            // Ensure topics exist
            await this.channel.assertExchange('emails', 'topic', { durable: true });

            // Create main queue
            await this.channel.assertQueue('send-email', {
                durable: true,
                arguments: {
                    'x-dead-letter-exchange': 'emails',
                    'x-dead-letter-routing-key': 'dead-letter'
                }
            });

            // Create delay queue for retries
            await this.channel.assertQueue('send-email-delay', {
                durable: true,
                arguments: {
                    'x-dead-letter-exchange': 'emails',
                    'x-dead-letter-routing-key': 'send-email',
                    'x-message-ttl': 60000 // Default delay 1 minute
                }
            });

            // Dead letter queue
            await this.channel.assertQueue('dead-letter', { durable: true });

            // Bind queues to exchange
            await this.channel.bindQueue('send-email', 'emails', 'send-email');
            await this.channel.bindQueue('send-email-delay', 'emails', 'send-email-delay');
            await this.channel.bindQueue('dead-letter', 'emails', 'dead-letter');

            logger.info('RabbitMQ adapter initialized');
        } catch (error) {
            logger.error('Failed to initialize RabbitMQ adapter:', error);
            throw error;
        }
    }

    async publish(topic: string, message: any): Promise<void> {
        await this.channel.publish(
            'emails',
            topic,
            Buffer.from(JSON.stringify(message)),
            { persistent: true }
        );
    }

    subscribe(topic: string, handler: (message: any) => Promise<void>): void {
        this.channel.consume(topic, async (msg) => {
            if (!msg) return;

            try {
                const content = JSON.parse(msg.content.toString());
                // Store the original message for ack/nack
                content._originalMessage = msg;
                await handler(content);
            } catch (error) {
                logger.error('Error processing message:', error);
                this.channel.nack(msg, false, false);
            }
        });
    }

    async ack(message: any): Promise<void> {
        this.channel.ack(message._originalMessage);
    }

    async nack(message: any, requeue: boolean, delay?: number): Promise<void> {
        // If delay provided, publish to delay queue with custom TTL
        if (delay && delay > 0) {
            const updatedMessage = { ...message };
            delete updatedMessage._originalMessage;

            await this.channel.publish(
                'emails',
                'send-email-delay',
                Buffer.from(JSON.stringify(updatedMessage)),
                {
                    persistent: true,
                    expiration: delay.toString()
                }
            );

            // Ack the original to remove it from the queue
            this.channel.ack(message._originalMessage);
        } else {
            // Standard nack without delay
            this.channel.nack(message._originalMessage, false, requeue);
        }
    }

    async close(): Promise<void> {
        await this.channel.close();
        await this.connection.close();
    }
}