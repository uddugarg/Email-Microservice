import {
    SQSClient,
    GetQueueAttributesCommand,
    SendMessageCommand,
    ReceiveMessageCommand,
    DeleteMessageCommand,
    ChangeMessageVisibilityCommand
} from "@aws-sdk/client-sqs";
import { QueueAdapter } from './queue.interface';
import { logger } from '../utils/logger';

export class SQSAdapter implements QueueAdapter {
    private sqsClient: SQSClient;
    private queueUrls: Record<string, string>;
    private pollingInterval!: NodeJS.Timeout;

    constructor(config: {
        region: string;
        queueUrls: Record<string, string>;
        credentials?: {
            accessKeyId?: string;
            secretAccessKey?: string;
            profile?: string;
        };
    }) {
        if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
            throw new Error('AWS credentials are not defined in environment variables');
        }

        this.sqsClient = new SQSClient({ 
            region: config.region,
            credentials: {
              accessKeyId: process.env.AWS_ACCESS_KEY_ID,
              secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
            }
        });
        this.queueUrls = config.queueUrls;
    }

    async initialize(): Promise<void> {
        try {
            // Ensure all queues exist
            for (const [topic, url] of Object.entries(this.queueUrls)) {
                try {
                    await this.sqsClient.send(new GetQueueAttributesCommand({
                        QueueUrl: url,
                        AttributeNames: ['QueueArn']
                    }));
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

        await this.sqsClient.send(new SendMessageCommand({
            QueueUrl: queueUrl,
            MessageBody: JSON.stringify(message)
        }));
    }

    subscribe(topic: string, handler: (message: any) => Promise<void>): void {
        const queueUrl = this.queueUrls[topic];
        if (!queueUrl) {
            throw new Error(`Queue for topic ${topic} not configured`);
        }

        const pollQueue = async () => {
            try {
                const response = await this.sqsClient.send(new ReceiveMessageCommand({
                    QueueUrl: queueUrl,
                    MaxNumberOfMessages: 10,
                    WaitTimeSeconds: 20,
                    VisibilityTimeout: 30
                }));

                if (response.Messages && response.Messages.length > 0) {
                    for (const message of response.Messages) {
                        try {
                            if (!message.Body) {
                                throw new Error('Message body is undefined');
                            }
                            const content = JSON.parse(message.Body);
                            // Store the original message for ack/nack
                            content._originalMessage = {
                                ReceiptHandle: message.ReceiptHandle,
                                QueueUrl: queueUrl
                            };
                            await handler(content);
                        } catch (error) {
                            logger.error('Error processing message:', error);
                            if (queueUrl && message.ReceiptHandle) {
                                await this.sqsClient.send(new ChangeMessageVisibilityCommand({
                                    QueueUrl: queueUrl,
                                    ReceiptHandle: message.ReceiptHandle,
                                    VisibilityTimeout: 0 // Make it immediately available again
                                }));
                            } else {
                                logger.error('QueueUrl or ReceiptHandle is undefined, cannot change message visibility');
                            }
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
        await this.sqsClient.send(new DeleteMessageCommand({
            QueueUrl,
            ReceiptHandle
        }));
    }

    async nack(message: any, requeue: boolean, delay?: number): Promise<void> {
        const { QueueUrl, ReceiptHandle } = message._originalMessage;

        // If requeue with delay, send a new message with delay
        if (requeue && delay) {
            const updatedMessage = { ...message };
            delete updatedMessage._originalMessage;

            await this.sqsClient.send(new SendMessageCommand({
                QueueUrl,
                MessageBody: JSON.stringify(updatedMessage),
                DelaySeconds: Math.min(Math.floor(delay / 1000), 900) // Max 15 minutes in SQS
            }));

            // Delete the original message
            await this.sqsClient.send(new DeleteMessageCommand({
                QueueUrl,
                ReceiptHandle
            }));
        } else if (requeue) {
            // Make message visible again immediately
            await this.sqsClient.send(new ChangeMessageVisibilityCommand({
                QueueUrl,
                ReceiptHandle,
                VisibilityTimeout: 0
            }));
        } else {
            // Not requeuing, just delete
            await this.sqsClient.send(new DeleteMessageCommand({
                QueueUrl,
                ReceiptHandle
            }));
        }
    }

    async close(): Promise<void> {
        // Stop polling
        if (this.pollingInterval) {
            clearTimeout(this.pollingInterval);
        }
    }
}