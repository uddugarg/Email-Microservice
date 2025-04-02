import express from 'express';
import cors from 'cors';
import { UserRepository } from '../repositories/user.repository';
import { LoggingRepository } from '../repositories/logging.repository';
import { QueueAdapter } from '../queue/queue.interface';
import { errorMiddleware, authMiddleware } from './middlewares';
import { accountsRouter, authRouter, emailsRouter } from './routes';
import { logger } from '../utils/logger';

export function createApp(
    userRepository: UserRepository,
    loggingRepository: LoggingRepository,
    queueAdapter: QueueAdapter
) {
    const app = express();

    // Middleware
    app.use(express.json());
    app.use(cors());
    app.use(authMiddleware);

    // Routes
    app.use('/api/v1/accounts', accountsRouter(userRepository));
    app.use('/api/v1/auth', authRouter(userRepository));
    app.use('/api/v1/emails', emailsRouter(loggingRepository, queueAdapter));

    // Health check endpoint
    app.get('/health', (req, res) => {
        res.json({ status: 'ok' });
    });

    // Error handler
    app.use(errorMiddleware);

    return app;
}