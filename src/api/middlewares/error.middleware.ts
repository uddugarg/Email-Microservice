import { Request, Response, NextFunction } from 'express';
import { logger } from '../../utils/logger';

export function errorMiddleware(err: Error, req: Request, res: Response, next: NextFunction) {
    logger.error('API Error:', err);

    res.status(500).json({
        error: {
            message: err.message || 'Internal Server Error',
            stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
        }
    });
}