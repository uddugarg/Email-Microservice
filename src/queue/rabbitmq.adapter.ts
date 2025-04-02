import { connect, Connection, Channel, ConsumeMessage, Options } from 'amqplib';
import { QueueAdapter } from './queue.interface';
import { logger } from '../utils/logger';

interface RabbitMQConfig {
    url: string;
    exchanges?: {
        name: string;
        type: string;
        options?: Options.AssertExchange;
    }[];
    queues?: {
        name: string;
        options?: Options.AssertQueue;
        bindings?: {
            exchange: string;
            routingKey: string;
        }[];
    }[];
    prefetch?: number;
}

export class RabbitMQAdapter implements QueueAdapter {
    private connection?: Connection;
    private channel?: Channel;
    private url: string;
    private isInitialized: boolean = false;

    constructor(url: string) {
        this.url = url;
    }

    async initialize(): Promise<void> {
        if (this.isInitialized) {
            return;
        }

        try {
            // Establish connection
            this.connection = await connect(this.url) as unknown as Connection;

            // Create channel
            this.channel = await (this.connection as any).createChannel();

            // Set up exchanges and queues
            await this.setupExchangesAndQueues();

            this.isInitialized = true;
            logger.info('RabbitMQ adapter initialized');
        } catch (error) {
            logger.error('Failed to initialize RabbitMQ adapter:', error);
            this.isInitialized = false;
            throw error;
        }
    }

    private async setupExchangesAndQueues(): Promise<void> {
        if (!this.channel) {
            throw new Error('Channel not created');
        }

        // Set up exchanges and queues
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
    }

    private ensureInitialized(): void {
        if (!this.isInitialized || !this.channel) {
            throw new Error('RabbitMQ adapter not initialized. Call initialize() first.');
        }
    }

    async publish(topic: string, message: any): Promise<void> {
        this.ensureInitialized();

        try {
            this.channel!.publish(
                'emails',
                topic,
                Buffer.from(JSON.stringify(message)),
                { persistent: true }
            );
        } catch (error) {
            logger.error('Error publishing message:', error);
            throw error;
        }
    }

    subscribe(topic: string, handler: (message: any) => Promise<void>): () => void {
        this.ensureInitialized();

        const consumer = async (msg: ConsumeMessage | null) => {
            if (!msg) return;

            try {
                const content = JSON.parse(msg.content.toString());
                // Store the original message for ack/nack
                content._originalMessage = msg;

                await handler(content);

                // Acknowledge message
                this.channel!.ack(msg);
            } catch (error) {
                logger.error('Error processing message:', error);

                // Negative acknowledge
                this.channel!.nack(msg, false, false);
            }
        };

        // Consume messages
        const consumerTag = this.channel!.consume(topic, consumer);

        // Return a function to cancel consumption
        return async () => {
            if (consumerTag) {
                this.channel!.cancel((await consumerTag).consumerTag);
            }
        };
    }

    async ack(message: any): Promise<void> {
        this.ensureInitialized();
        this.channel!.ack(message._originalMessage);
    }

    async nack(message: any, requeue: boolean, delay?: number): Promise<void> {
        this.ensureInitialized();

        // If delay provided, publish to delay queue with custom TTL
        if (delay && delay > 0) {
            const updatedMessage = { ...message };
            delete updatedMessage._originalMessage;

            this.channel!.publish(
                'emails',
                'send-email-delay',
                Buffer.from(JSON.stringify(updatedMessage)),
                {
                    persistent: true,
                    expiration: delay.toString()
                }
            );

            // Ack the original to remove it from the queue
            this.channel!.ack(message._originalMessage);
        } else {
            // Standard nack without delay
            this.channel!.nack(message._originalMessage, false, requeue);
        }
    }

    async close(): Promise<void> {
        try {
            // Ensure channel and connection are closed safely
            if (this.channel) {
                await this.channel.close();
                this.channel = undefined;
            }
            if (this.connection) {
                await (this.connection as any).close();
                this.connection = undefined;
            }
            this.isInitialized = false;
        } catch (error) {
            logger.error('Error closing RabbitMQ connection:', error);
        }
    }
}

// Example of how to use the adapter
export async function initializeRabbitMQ(url: string): Promise<RabbitMQAdapter> {
    const adapter = new RabbitMQAdapter(url);
    await adapter.initialize();
    return adapter;
}