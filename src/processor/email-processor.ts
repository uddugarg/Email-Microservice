import { v4 as uuidv4 } from 'uuid';
import { QueueAdapter } from '../queue/queue.interface';
import { UserRepository } from '../repositories/user.repository';
import { QuotaRepository } from '../repositories/quota.repository';
import { EmailValidationService } from '../email-validation/email-validator';
import { EmailProviderFactory } from '../email-providers/provider-factory';
import { LoggingRepository } from '../repositories/logging.repository';
import { SendEmailEvent } from '../models/send-email-event.model';
import { logger } from '../utils/logger';

export class EmailProcessor {
    constructor(
        private queueAdapter: QueueAdapter,
        private userRepository: UserRepository,
        private quotaRepository: QuotaRepository,
        private emailValidationService: EmailValidationService,
        private emailProviderFactory: EmailProviderFactory,
        private loggingRepository: LoggingRepository
    ) { }

    async start(): Promise<void> {
        try {
            await this.queueAdapter.initialize();
            this.queueAdapter.subscribe('send-email', this.handleSendEmailEvent.bind(this));
            logger.info('Email processor subscribed to send-email queue');
        } catch (error) {
            logger.error('Failed to start email processor:', error);
            throw error;
        }
    }

    async handleSendEmailEvent(event: SendEmailEvent): Promise<void> {
        // Create initial log entry
        const logId = uuidv4();
        await this.loggingRepository.logEvent({
            id: logId,
            eventId: event.id,
            tenantId: event.tenantId,
            userId: event.userId,
            fromEmail: '', // Will be filled later
            toEmail: event.toAddress || '',
            subject: event.subject,
            timestamp: new Date(),
            status: 'PROCESSING',
            statusDetails: 'Processing started'
        });

        logger.info(`Processing email event ${event.id} for tenant ${event.tenantId}, user ${event.userId}`);

        try {
            // 1. Resolve email address if not provided
            let toAddress = event.toAddress;
            if (!toAddress) {
                const resolvedAddress = await this.userRepository.resolveEmailAddress(
                    event.tenantId, event.userId
                );
                toAddress = resolvedAddress !== null ? resolvedAddress : undefined;
                if (!toAddress) {
                    throw new Error('Cannot resolve email address for user');
                }
            }

            logger.debug(`Resolved recipient address: ${toAddress}`);

            // 2. Validate email
            const validationResult = await this.emailValidationService.validateEmail(toAddress);
            if (!validationResult.valid) {
                await this.loggingRepository.updateLogStatus(
                    logId, 'REJECTED', `Invalid email: ${validationResult.reason}`
                );
                logger.warn(`Email rejected: ${validationResult.reason}`);
                return this.queueAdapter.ack(event);
            }

            if (validationResult.disposable) {
                await this.loggingRepository.updateLogStatus(
                    logId, 'REJECTED', 'Disposable/throwaway email address detected'
                );
                logger.warn(`Email rejected: Disposable email address`);
                return this.queueAdapter.ack(event);
            }

            // 3. Get sender account
            const account = await this.userRepository.getEmailAccount(
                event.tenantId, event.userId
            );
            if (!account) {
                await this.loggingRepository.updateLogStatus(
                    logId, 'REJECTED', 'No email account configured for user'
                );
                logger.warn(`Email rejected: No email account configured`);
                return this.queueAdapter.ack(event);
            }

            // Check if account is active
            if (account.status === 'INACTIVE') {
                await this.loggingRepository.updateLogStatus(
                    logId, 'REJECTED', 'Email account is inactive'
                );
                logger.warn(`Email rejected: Account inactive`);
                return this.queueAdapter.ack(event);
            }

            // 4. Check quota
            const quotaCheck = await this.checkQuota(account.id);
            if (!quotaCheck.allowed) {
                // If quota exceeded, requeue with delay
                await this.loggingRepository.updateLogStatus(
                    logId, 'REQUEUED', `Quota exceeded: ${quotaCheck.reason}`
                );
                logger.info(`Email requeued: Quota exceeded`);
                return this.queueAdapter.nack(event, true, 3600000); // 1 hour delay
            }

            // 5. Get provider and send email
            const provider = this.emailProviderFactory.getProvider(account.provider);
            await provider.initialize(account.credentials);

            // Verify credentials are valid
            const credentialsValid = await provider.validateCredentials();
            if (!credentialsValid) {
                // Try to refresh credentials if supported
                if (provider.refreshCredentials) {
                    try {
                        const newCredentials = await provider.refreshCredentials();
                        // Update account with new credentials
                        await this.userRepository.updateEmailAccount(account.id, {
                            credentials: newCredentials
                        });
                        // Reinitialize with new credentials
                        await provider.initialize(newCredentials);
                    } catch (error) {
                        await this.loggingRepository.updateLogStatus(
                            logId, 'FAILED', 'Invalid credentials and unable to refresh'
                        );
                        logger.error(`Email failed: Invalid credentials and unable to refresh`);
                        return this.queueAdapter.ack(event);
                    }
                } else {
                    await this.loggingRepository.updateLogStatus(
                        logId, 'FAILED', 'Invalid credentials'
                    );
                    logger.error(`Email failed: Invalid credentials`);
                    return this.queueAdapter.ack(event);
                }
            }

            const emailRequest = {
                from: account.email,
                to: [toAddress],
                cc: event.metadata?.cc || [],
                bcc: event.metadata?.bcc || [],
                subject: event.subject,
                body: event.body,
                isHtml: true,
                attachments: event.metadata?.attachments || [],
                replyTo: event.metadata?.replyTo
            };

            // Update log with from address
            await this.loggingRepository.updateLogStatus(
                logId, 'PROCESSING', 'Sending email',
                { fromEmail: account.email }
            );

            logger.info(`Sending email from ${account.email} to ${toAddress}`);

            const result = await provider.sendEmail(emailRequest);

            // 6. Handle result
            if (result.success) {
                await this.updateQuotaUsage(account.id, true);
                await this.loggingRepository.updateLogStatus(
                    logId, 'SENT', 'Email sent successfully',
                    { providerResponse: result.providerResponse }
                );
                logger.info(`Email sent successfully: ${event.id}`);
                return this.queueAdapter.ack(event);
            } else {
                await this.updateQuotaUsage(account.id, false);

                // Determine if we should retry
                const shouldRetry = result.error?.code ? this.shouldRetryError(result.error.code) : false;
                if (shouldRetry && (event.retryCount || 0) < 3) {
                    // Requeue with backoff
                    const retryCount = (event.retryCount || 0) + 1;
                    const delay = Math.pow(2, retryCount) * 60000; // Exponential backoff

                    await this.loggingRepository.updateLogStatus(
                        logId, 'REQUEUED', `Failed: ${result.error?.message}. Retry ${retryCount} scheduled.`,
                        { providerResponse: result.providerResponse }
                    );

                    logger.info(`Email requeued for retry ${retryCount}: ${event.id}`);

                    return this.queueAdapter.nack(
                        { ...event, retryCount },
                        true,
                        delay
                    );
                } else {
                    await this.loggingRepository.updateLogStatus(
                        logId, 'FAILED', `Failed: ${result.error?.message}. No more retries.`,
                        { providerResponse: result.providerResponse }
                    );

                    logger.error(`Email failed, no more retries: ${event.id}`);

                    return this.queueAdapter.ack(event);
                }
            }
        } catch (error) {
            await this.loggingRepository.updateLogStatus(
                logId, 'FAILED', `Error: ${error instanceof Error ? error.message : 'Unknown error'}`
            );

            logger.error(`Error processing email ${event.id}:`, error);

            // For unexpected errors, requeue if retry count allows
            if ((event.retryCount || 0) < 3) {
                const retryCount = (event.retryCount || 0) + 1;
                return this.queueAdapter.nack(
                    { ...event, retryCount },
                    true,
                    30000 * retryCount
                );
            } else {
                return this.queueAdapter.ack(event);
            }
        }
    }

    private async checkQuota(accountId: string): Promise<{ allowed: boolean; reason?: string }> {
        try {
            const account = await this.quotaRepository.getAccount(accountId);
            const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

            let usage = await this.quotaRepository.getQuotaUsage(accountId, today);

            if (!usage) {
                // Initialize today's usage
                const dailyLimit = this.calculateDailyLimit(account);
                usage = {
                    accountId,
                    date: today,
                    sent: 0,
                    failed: 0,
                    remaining: dailyLimit
                };
                await this.quotaRepository.saveQuotaUsage(usage);
            }

            if (usage.remaining <= 0) {
                return {
                    allowed: false,
                    reason: 'Daily quota exceeded'
                };
            }

            return {
                allowed: true
            };
        } catch (error) {
            logger.error('Error checking quota:', error);
            return {
                allowed: false,
                reason: 'Error checking quota'
            };
        }
    }

    private async updateQuotaUsage(accountId: string, success: boolean): Promise<void> {
        try {
            const today = new Date().toISOString().split('T')[0];
            let usage = await this.quotaRepository.getQuotaUsage(accountId, today);

            if (!usage) {
                const account = await this.quotaRepository.getAccount(accountId);
                const dailyLimit = this.calculateDailyLimit(account);

                usage = {
                    accountId,
                    date: today,
                    sent: 0,
                    failed: 0,
                    remaining: dailyLimit
                };
            }

            if (success) {
                usage.sent += 1;
                usage.remaining = Math.max(0, usage.remaining - 1);
            } else {
                usage.failed += 1;
            }

            await this.quotaRepository.saveQuotaUsage(usage);
        } catch (error) {
            logger.error('Error updating quota usage:', error);
        }
    }

    private calculateDailyLimit(account: any): number {
        const { quotaSettings, status } = account;

        if (status === 'INACTIVE') {
            return 0;
        }

        if (status === 'ACTIVE') {
            return quotaSettings.maxLimit;
        }

        // WARMING_UP status
        const { dailyLimit, warmupStep, maxLimit, currentStage } = quotaSettings;
        return Math.min(dailyLimit + (warmupStep * (currentStage - 1)), maxLimit);
    }

    private shouldRetryError(errorCode: string): boolean {
        // Retry on temporary failures, not on permanent ones
        const temporaryFailures = [
            'RATE_LIMIT_EXCEEDED',
            'TEMPORARY_ERROR',
            'CONNECTION_ERROR',
            'TIMEOUT',
            'SERVER_ERROR'
        ];

        return temporaryFailures.includes(errorCode);
    }
}