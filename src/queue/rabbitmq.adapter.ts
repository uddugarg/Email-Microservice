// import * as amqp from 'amqplib';
// import { QueueAdapter } from './queue.interface';
// import { logger } from '../utils/logger';

// export class RabbitMQAdapter implements QueueAdapter {
//     private connection!: amqp.Connection;
//     private channel!: amqp.Channel;
//     private url: string;

//     constructor(url: string) {
//         this.url = url;
//     }

//     async initialize(): Promise<void> {
//         try {
//             this.connection = (await amqp.connect(this.url)) as amqp.Connection;
//             this.channel = await (this.connection as amqp.Connection).createChannel();

//             await this.channel.assertExchange('emails', 'topic', { durable: true });

//             await this.channel.assertQueue('send-email', {
//                 durable: true,
//                 arguments: {
//                     'x-dead-letter-exchange': 'emails',
//                     'x-dead-letter-routing-key': 'dead-letter'
//                 }
//             });

//             await this.channel.assertQueue('send-email-delay', {
//                 durable: true,
//                 arguments: {
//                     'x-dead-letter-exchange': 'emails',
//                     'x-dead-letter-routing-key': 'send-email',
//                     'x-message-ttl': 60000
//                 }
//             });

//             await this.channel.assertQueue('dead-letter', { durable: true });

//             await this.channel.bindQueue('send-email', 'emails', 'send-email');
//             await this.channel.bindQueue('send-email-delay', 'emails', 'send-email-delay');
//             await this.channel.bindQueue('dead-letter', 'emails', 'dead-letter');

//             logger.info('RabbitMQ adapter initialized');
//         } catch (error) {
//             logger.error('Failed to initialize RabbitMQ adapter:', error);
//             throw error;
//         }
//     }

//     async publish(topic: string, message: any): Promise<void> {
//         await this.channel.publish(
//             'emails',
//             topic,
//             Buffer.from(JSON.stringify(message)),
//             { persistent: true }
//         );
//     }

//     subscribe(topic: string, handler: (message: any) => Promise<void>): void {
//         this.channel.consume(topic, async (msg) => {
//             if (!msg) return;

//             try {
//                 const content = JSON.parse(msg.content.toString());
//                 content._originalMessage = msg;
//                 await handler(content);
//             } catch (error) {
//                 logger.error('Error processing message:', error);
//                 this.channel.nack(msg, false, false);
//             }
//         });
//     }

//     async ack(message: any): Promise<void> {
//         this.channel.ack(message._originalMessage);
//     }

//     async nack(message: any, requeue: boolean, delay?: number): Promise<void> {
//         if (delay && delay > 0) {
//             const updatedMessage = { ...message };
//             delete updatedMessage._originalMessage;

//             await this.channel.publish(
//                 'emails',
//                 'send-email-delay',
//                 Buffer.from(JSON.stringify(updatedMessage)),
//                 {
//                     persistent: true,
//                     expiration: delay.toString()
//                 }
//             );

//             this.channel.ack(message._originalMessage);
//         } else {
//             this.channel.nack(message._originalMessage, false, requeue);
//         }
//     }

//     async close(): Promise<void> {
//         await (this.channel as amqp.Channel).close();
//         await (this.connection as amqp.Connection).close();
//     }
// }
