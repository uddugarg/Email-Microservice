import { Request, Response, NextFunction } from 'express';
import { logger } from '../../utils/logger';

export function authMiddleware(req: Request, res: Response, next: NextFunction) {
    // Skip auth check for OAuth callback and health check
    if (
        req.path.startsWith('/api/v1/auth') && req.path.includes('/callback') ||
        req.path === '/health'
    ) {
        return next();
    }

    const apiKey = req.headers['x-api-key'];

    if (!apiKey || apiKey !== process.env.API_KEY) {
        logger.warn(`Unauthorized access attempt from ${req.ip}`);
        return res.status(401).json({ error: 'Unauthorized' });
    }

    next();
}