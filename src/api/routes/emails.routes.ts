import { Router, Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { LoggingRepository } from '../../repositories/logging.repository';
import { QueueAdapter } from '../../queue/queue.interface';
import { SendEmailEvent } from '../../models/send-email-event.model';
import { logger } from '../../utils/logger';

export function emailsRouter(
    loggingRepository: LoggingRepository,
    queueAdapter: QueueAdapter
) {
    const router = Router();

    // Send email
    router.post('/send', async (req: Request, res: Response, next: NextFunction) => {
        try {
            const { toAddress, tenantId, userId, subject, body, metadata } = req.body;

            if (!tenantId || !userId || !subject || !body) {
                return res.status(400).json({ error: 'Missing required fields' });
            }

            // Create send email event
            const eventId = uuidv4();
            const event: SendEmailEvent = {
                id: eventId,
                toAddress,
                tenantId,
                userId,
                subject,
                body,
                metadata,
                status: 'PENDING'
            };

            // Publish to queue
            await queueAdapter.publish('send-email', event);
            console.log("published")
            logger.info(`Queued email for sending: ${eventId}`);

            res.status(202).json({
                eventId,
                status: 'QUEUED',
                message: 'Email has been queued for sending'
            });
        } catch (error) {
            next(error);
        }
    });

    // Get email status
    router.get('/:eventId', async (req: Request, res: Response, next: NextFunction) => {
        try {
            const { eventId } = req.params;

            const logs = await loggingRepository.getLogsByEventId(eventId);

            if (logs.length === 0) {
                return res.status(404).json({ error: 'Email not found' });
            }

            // Get the latest status
            const latestLog = logs[0];

            res.json({
                eventId,
                status: latestLog.status,
                statusDetails: latestLog.statusDetails,
                timestamp: latestLog.timestamp,
                logs
            });
        } catch (error) {
            next(error);
        }
    });

    // List email logs
    router.get('/', async (req: Request, res: Response, next: NextFunction) => {
        try {
            const { tenantId, userId, page = '1', limit = '10' } = req.query;

            if (!tenantId || !userId) {
                return res.status(400).json({ error: 'tenantId and userId are required' });
            }

            const pagination = {
                page: parseInt(page as string, 10),
                limit: parseInt(limit as string, 10)
            };

            const result = await loggingRepository.getLogsByTenantAndUser(
                tenantId as string,
                userId as string,
                pagination
            );

            res.json({
                items: result.logs,
                totalCount: result.total,
                page: pagination.page,
                limit: pagination.limit
            });
        } catch (error) {
            next(error);
        }
    });

    return router;
}