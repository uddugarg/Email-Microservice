import { SQS } from 'aws-sdk';
import { QueueAdapter } from './queue.interface';
import { logger } from '../utils/logger';

export class SQSAdapter implements QueueAdapter {
    private sqs: SQS;
    private queueUrls: Record<string, string>;
    private pollingInterval: NodeJS.Timeout;

    constructor(config: {
        region: string;
        queueUrls: Record<string, string>;
    }) {
        this.sqs = new SQS({ region: config.region });
        this.queueUrls = config.queueUrls;
    }

    async initialize(): Promise<void> {
        try {
            // Ensure all queues exist
            for (const [topic, url] of Object.entries(this.queueUrls)) {
                try {
                    await this.sqs.getQueueAttributes({
                        QueueUrl: url,
                        AttributeNames: ['QueueArn']
                    }).promise();
                } catch (error) {
                    logger.error(`Queue ${topic} not found at ${url}`);
                    throw error;
                }
            }

            logger.info('SQS adapter initialized');
        } catch (error) {
            logger.error('Failed to initialize SQS adapter:', error);
            throw error;
        }
    }

    async publish(topic: string, message: any): Promise<void> {
        const queueUrl = this.queueUrls[topic];
        if (!queueUrl) {
            throw new Error(`Queue for topic ${topic} not configured`);
        }

        await this.sqs.sendMessage({
            QueueUrl: queueUrl,
            MessageBody: JSON.stringify(message)
        }).promise();
    }

    subscribe(topic: string, handler: (message: any) => Promise<void>): void {
        const queueUrl = this.queueUrls[topic];
        if (!queueUrl) {
            throw new Error(`Queue for topic ${topic} not configured`);
        }

        const pollQueue = async () => {
            try {
                const response = await this.sqs.receiveMessage({
                    QueueUrl: queueUrl,
                    MaxNumberOfMessages: 10,
                    WaitTimeSeconds: 20,
                    VisibilityTimeout: 30
                }).promise();

                if (response.Messages && response.Messages.length > 0) {
                    for (const message of response.Messages) {
                        try {
                            const content = JSON.parse(message.Body);
                            // Store the original message for ack/nack
                            content._originalMessage = {
                                ReceiptHandle: message.ReceiptHandle,
                                QueueUrl: queueUrl
                            };
                            await handler(content);
                        } catch (error) {
                            logger.error('Error processing message:', error);
                            await this.sqs.changeMessageVisibility({
                                QueueUrl: queueUrl,
                                ReceiptHandle: message.ReceiptHandle,
                                VisibilityTimeout: 0 // Make it immediately available again
                            }).promise();
                        }
                    }
                }
            } catch (error) {
                logger.error('Error polling SQS queue:', error);
            }

            // Continue polling
            this.pollingInterval = setTimeout(pollQueue, 1000);
        };

        // Start polling
        pollQueue();
    }

    async ack(message: any): Promise<void> {
        const { QueueUrl, ReceiptHandle } = message._originalMessage;
        await this.sqs.deleteMessage({
            QueueUrl,
            ReceiptHandle
        }).promise();
    }

    async nack(message: any, requeue: boolean, delay?: number): Promise<void> {
        const { QueueUrl, ReceiptHandle } = message._originalMessage;

        // If requeue with delay, send a new message with delay
        if (requeue && delay) {
            const updatedMessage = { ...message };
            delete updatedMessage._originalMessage;

            await this.sqs.sendMessage({
                QueueUrl,
                MessageBody: JSON.stringify(updatedMessage),
                DelaySeconds: Math.min(Math.floor(delay / 1000), 900) // Max 15 minutes in SQS
            }).promise();

            // Delete the original message
            await this.sqs.deleteMessage({
                QueueUrl,
                ReceiptHandle
            }).promise();
        } else if (requeue) {
            // Make message visible again immediately
            await this.sqs.changeMessageVisibility({
                QueueUrl,
                ReceiptHandle,
                VisibilityTimeout: 0
            }).promise();
        } else {
            // Not requeuing, just delete
            await this.sqs.deleteMessage({
                QueueUrl,
                ReceiptHandle
            }).promise();
        }
    }

    async close(): Promise<void> {
        // Stop polling
        if (this.pollingInterval) {
            clearTimeout(this.pollingInterval);
        }
    }
}