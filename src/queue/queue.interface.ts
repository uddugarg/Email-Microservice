export interface QueueAdapter {
    initialize(): Promise<void>;
    publish(topic: string, message: any): Promise<void>;
    subscribe(topic: string, handler: (message: any) => Promise<void>): void;
    ack(message: any): Promise<void>;
    nack(message: any, requeue: boolean, delay?: number): Promise<void>;
    close(): Promise<void>;
}