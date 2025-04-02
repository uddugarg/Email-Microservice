# Email Microservice Detailed Design

## 1. Domain Models

### SendEmail Event
```json
{
  "toAddress": "string",       // Optional - if provided, will override the resolved address
  "tenantId": "string",        // Tenant identifier
  "userId": "string",          // User identifier within the tenant
  "subject": "string",         // Email subject
  "body": "string",            // Email body (can be HTML)
  "metadata": {                // Optional metadata
    "priority": "HIGH|NORMAL|LOW",
    "attachments": [...],       // Optional attachments
    "replyTo": "string",        // Optional reply-to address
    "cc": ["string"],           // Optional CC addresses
    "bcc": ["string"]           // Optional BCC addresses
  },
  "retryCount": 0,             // Number of retry attempts (internal)
  "status": "PENDING"          // Status tracking (internal)
}
```

### EmailAccount
```json
{
  "id": "string",              // Unique identifier
  "tenantId": "string",        // Tenant identifier
  "userId": "string",          // User identifier
  "provider": "GMAIL|OUTLOOK|SMTP", // Email provider
  "email": "string",           // Email address
  "credentials": {             // Provider-specific credentials
    "accessToken": "string",   
    "refreshToken": "string",
    "expiresAt": "timestamp"
  },
  "quotaSettings": {           // Quota settings
    "dailyLimit": 100,         // Default daily limit
    "warmupStep": 10,          // Increase per day during warmup
    "maxLimit": 500,           // Maximum daily limit
    "currentStage": 1          // Current warmup stage
  },
  "status": "ACTIVE|INACTIVE|WARMING_UP" // Account status
}
```

### QuotaUsage
```json
{
  "accountId": "string",       // Reference to EmailAccount
  "date": "string",            // Date in YYYY-MM-DD format
  "sent": 0,                   // Count of emails sent
  "failed": 0,                 // Count of failed emails
  "remaining": 100             // Remaining quota for the day
}
```

### EmailLog
```json
{
  "id": "string",              // Unique identifier
  "eventId": "string",         // Reference to original event ID
  "tenantId": "string",        // Tenant identifier
  "userId": "string",          // User identifier
  "fromEmail": "string",       // Sender address
  "toEmail": "string",         // Recipient address
  "subject": "string",         // Email subject
  "timestamp": "timestamp",    // When the log was created
  "status": "QUEUED|PROCESSING|SENT|FAILED|REJECTED|REQUEUED", // Status
  "statusDetails": "string",   // Detailed status information
  "providerResponse": "json"   // Provider-specific response
}
```

## 2. Component Interfaces

### Queue Adapter Interface
```typescript
interface QueueAdapter {
  initialize(): Promise<void>;
  publish(topic: string, message: any): Promise<void>;
  subscribe(topic: string, handler: (message: any) => Promise<void>): void;
  ack(message: any): Promise<void>;
  nack(message: any, requeue: boolean, delay?: number): Promise<void>;
  close(): Promise<void>;
}
```

### Email Provider Adapter Interface
```typescript
interface EmailProviderAdapter {
  initialize(credentials: any): Promise<void>;
  sendEmail(email: EmailRequest): Promise<EmailResponse>;
  validateCredentials(): Promise<boolean>;
  refreshCredentials?(): Promise<void>;
}

interface EmailRequest {
  from: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  body: string;
  isHtml?: boolean;
  attachments?: Attachment[];
  replyTo?: string;
}

interface EmailResponse {
  success: boolean;
  messageId?: string;
  error?: {
    code: string;
    message: string;
  };
  providerResponse: any;
}
```

### User Repository Interface
```typescript
interface UserRepository {
  resolveEmailAddress(tenantId: string, userId: string): Promise<string | null>;
  getEmailAccount(tenantId: string, userId: string): Promise<EmailAccount | null>;
  saveEmailAccount(account: EmailAccount): Promise<void>;
  updateEmailAccount(id: string, updates: Partial<EmailAccount>): Promise<void>;
  listEmailAccounts(tenantId: string): Promise<EmailAccount[]>;
}
```

### Quota Service Interface
```typescript
interface QuotaService {
  checkQuota(accountId: string): Promise<QuotaCheckResult>;
  updateUsage(accountId: string, success: boolean): Promise<void>;
  resetDailyQuotas(): Promise<void>;  // Called by a scheduled job
  advanceWarmupStage(accountId: string): Promise<void>;
}

interface QuotaCheckResult {
  allowed: boolean;
  remaining: number;
  reason?: string;
}
```

### Email Validation Service Interface
```typescript
interface EmailValidationService {
  validateEmail(email: string): Promise<ValidationResult>;
  isDisposableEmail(email: string): Promise<boolean>;
}

interface ValidationResult {
  valid: boolean;
  reachable: boolean;
  disposable: boolean;
  reason?: string;
}
```

### Logging Service Interface
```typescript
interface LoggingService {
  logEvent(log: EmailLog): Promise<void>;
  updateLogStatus(id: string, status: string, details?: string): Promise<void>;
  getLogsByEventId(eventId: string): Promise<EmailLog[]>;
  getLogsByTenantAndUser(tenantId: string, userId: string, 
                        pagination: PaginationOptions): Promise<EmailLog[]>;
}
```

## 3. Implementation Details

### Queue Implementations

#### RabbitMQ Adapter
- Implements QueueAdapter interface
- Uses topics for different event types
- Supports dead-letter queues for failed messages
- Configurable retry mechanism with exponential backoff

#### AWS SQS Adapter
- Alternative implementation of QueueAdapter
- Uses SQS queues and SNS topics
- Supports visibility timeout and delay queues

### Database Schema

```sql
-- Email Accounts Table
CREATE TABLE email_accounts (
  id UUID PRIMARY KEY,
  tenant_id VARCHAR(50) NOT NULL,
  user_id VARCHAR(50) NOT NULL,
  provider VARCHAR(20) NOT NULL,
  email VARCHAR(255) NOT NULL,
  credentials JSONB NOT NULL,
  quota_settings JSONB NOT NULL,
  status VARCHAR(20) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, user_id, provider)
);

-- Quota Usage Table
CREATE TABLE quota_usage (
  account_id UUID NOT NULL REFERENCES email_accounts(id),
  date DATE NOT NULL,
  sent INTEGER NOT NULL DEFAULT 0,
  failed INTEGER NOT NULL DEFAULT 0,
  remaining INTEGER NOT NULL,
  PRIMARY KEY(account_id, date)
);

-- Email Logs Table
CREATE TABLE email_logs (
  id UUID PRIMARY KEY,
  event_id UUID NOT NULL,
  tenant_id VARCHAR(50) NOT NULL,
  user_id VARCHAR(50) NOT NULL,
  from_email VARCHAR(255) NOT NULL,
  to_email VARCHAR(255) NOT NULL,
  subject VARCHAR(255) NOT NULL,
  timestamp TIMESTAMP NOT NULL,
  status VARCHAR(20) NOT NULL,
  status_details TEXT,
  provider_response JSONB
);

-- Create indexes
CREATE INDEX idx_email_logs_event_id ON email_logs(event_id);
CREATE INDEX idx_email_logs_tenant_user ON email_logs(tenant_id, user_id);
CREATE INDEX idx_email_logs_status ON email_logs(status);
CREATE INDEX idx_email_logs_timestamp ON email_logs(timestamp);
```

### Email Processor Implementation

```typescript
class EmailProcessor {
  constructor(
    private queueAdapter: QueueAdapter,
    private userRepository: UserRepository,
    private quotaService: QuotaService,
    private emailValidationService: EmailValidationService,
    private emailProviderFactory: EmailProviderFactory,
    private loggingService: LoggingService
  ) {}

  async start() {
    await this.queueAdapter.initialize();
    this.queueAdapter.subscribe('send-email', this.handleSendEmailEvent.bind(this));
  }

  async handleSendEmailEvent(event: SendEmail) {
    // Create initial log entry
    const logId = uuidv4();
    await this.loggingService.logEvent({
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

    try {
      // 1. Resolve email address if not provided
      let toAddress = event.toAddress;
      if (!toAddress) {
        toAddress = await this.userRepository.resolveEmailAddress(
          event.tenantId, event.userId
        );
        if (!toAddress) {
          throw new Error('Cannot resolve email address for user');
        }
      }

      // 2. Validate email
      const validationResult = await this.emailValidationService.validateEmail(toAddress);
      if (!validationResult.valid) {
        await this.loggingService.updateLogStatus(
          logId, 'REJECTED', `Invalid email: ${validationResult.reason}`
        );
        return this.queueAdapter.ack(event);
      }
      
      if (validationResult.disposable) {
        await this.loggingService.updateLogStatus(
          logId, 'REJECTED', 'Disposable/throwaway email address detected'
        );
        return this.queueAdapter.ack(event);
      }

      // 3. Get sender account
      const account = await this.userRepository.getEmailAccount(
        event.tenantId, event.userId
      );
      if (!account) {
        await this.loggingService.updateLogStatus(
          logId, 'REJECTED', 'No email account configured for user'
        );
        return this.queueAdapter.ack(event);
      }

      // 4. Check quota
      const quotaResult = await this.quotaService.checkQuota(account.id);
      if (!quotaResult.allowed) {
        // If quota exceeded, requeue with delay
        await this.loggingService.updateLogStatus(
          logId, 'REQUEUED', `Quota exceeded: ${quotaResult.reason}`
        );
        return this.queueAdapter.nack(event, true, 3600000); // 1 hour delay
      }

      // 5. Get provider and send email
      const provider = this.emailProviderFactory.getProvider(account.provider);
      await provider.initialize(account.credentials);

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
      await this.loggingService.updateLogStatus(
        logId, 'PROCESSING', 'Sending email',
        { fromEmail: account.email }
      );

      const result = await provider.sendEmail(emailRequest);

      // 6. Handle result
      if (result.success) {
        await this.quotaService.updateUsage(account.id, true);
        await this.loggingService.updateLogStatus(
          logId, 'SENT', 'Email sent successfully',
          { providerResponse: result.providerResponse }
        );
        return this.queueAdapter.ack(event);
      } else {
        await this.quotaService.updateUsage(account.id, false);
        
        // Determine if we should retry
        const shouldRetry = this.shouldRetryError(result.error?.code);
        if (shouldRetry && (event.retryCount || 0) < 3) {
          // Requeue with backoff
          const retryCount = (event.retryCount || 0) + 1;
          const delay = Math.pow(2, retryCount) * 60000; // Exponential backoff
          
          await this.loggingService.updateLogStatus(
            logId, 'REQUEUED', `Failed: ${result.error?.message}. Retry ${retryCount} scheduled.`,
            { providerResponse: result.providerResponse }
          );
          
          return this.queueAdapter.nack(
            { ...event, retryCount }, 
            true, 
            delay
          );
        } else {
          await this.loggingService.updateLogStatus(
            logId, 'FAILED', `Failed: ${result.error?.message}. No more retries.`,
            { providerResponse: result.providerResponse }
          );
          return this.queueAdapter.ack(event);
        }
      }
    } catch (error) {
      await this.loggingService.updateLogStatus(
        logId, 'FAILED', `Error: ${error.message}`
      );
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
```

### Email Warmup Strategy

```typescript
class WarmupQuotaService implements QuotaService {
  constructor(
    private repository: QuotaRepository
  ) {}

  async checkQuota(accountId: string): Promise<QuotaCheckResult> {
    const account = await this.repository.getAccount(accountId);
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    
    let usage = await this.repository.getQuotaUsage(accountId, today);
    
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
      await this.repository.saveQuotaUsage(usage);
    }
    
    if (usage.remaining <= 0) {
      return {
        allowed: false,
        remaining: 0,
        reason: 'Daily quota exceeded'
      };
    }
    
    return {
      allowed: true,
      remaining: usage.remaining
    };
  }
  
  async updateUsage(accountId: string, success: boolean): Promise<void> {
    const today = new Date().toISOString().split('T')[0];
    const usage = await this.repository.getQuotaUsage(accountId, today);
    
    if (success) {
      usage.sent += 1;
      usage.remaining -= 1;
    } else {
      usage.failed += 1;
    }
    
    await this.repository.saveQuotaUsage(usage);
  }
  
  async resetDailyQuotas(): Promise<void> {
    // Called by a daily cron job
    const accounts = await this.repository.getAllAccounts();
    const today = new Date().toISOString().split('T')[0];
    
    for (const account of accounts) {
      const dailyLimit = this.calculateDailyLimit(account);
      await this.repository.saveQuotaUsage({
        accountId: account.id,
        date: today,
        sent: 0,
        failed: 0,
        remaining: dailyLimit
      });
    }
  }
  
  async advanceWarmupStage(accountId: string): Promise<void> {
    // Called weekly to advance the warmup stage if conditions are met
    const account = await this.repository.getAccount(accountId);
    const lastWeekUsage = await this.repository.getLastWeekUsage(accountId);
    
    // Only advance if we've consistently used close to our quota
    const totalSent = lastWeekUsage.reduce((sum, day) => sum + day.sent, 0);
    const totalQuota = lastWeekUsage.reduce((sum, day) => sum + day.sent + day.remaining, 0);
    
    if (totalSent > totalQuota * 0.8 && account.quotaSettings.currentStage < 10) {
      account.quotaSettings.currentStage += 1;
      await this.repository.updateAccount(accountId, { 
        quotaSettings: account.quotaSettings 
      });
    }
  }
  
  private calculateDailyLimit(account: EmailAccount): number {
    const { dailyLimit, warmupStep, maxLimit, currentStage } = account.quotaSettings;
    
    if (account.status !== 'WARMING_UP') {
      return account.status === 'ACTIVE' ? maxLimit : 0;
    }
    
    // Linear increase during warmup
    return Math.min(dailyLimit + (warmupStep * (currentStage - 1)), maxLimit);
  }
}
```

## 4. API Endpoints

### Account Management API

```
POST /api/v1/accounts
- Create a new email account
- Body: { tenantId, userId, provider, email }
- Response: { id, status }

GET /api/v1/accounts
- List all accounts for the authenticated tenant
- Query params: userId (optional)
- Response: Array of EmailAccount objects

GET /api/v1/accounts/:id
- Get account details
- Response: EmailAccount object

PUT /api/v1/accounts/:id
- Update account settings
- Body: { quotaSettings, status }
- Response: { id, status }

DELETE /api/v1/accounts/:id
- Delete an account
- Response: { success: true }
```

### OAuth Authentication Flow

```
GET /api/v1/auth/:provider/authorize
- Initiate OAuth flow
- Query params: tenantId, userId, redirectUri
- Response: Redirects to provider's authorization page

GET /api/v1/auth/:provider/callback
- OAuth callback endpoint
- Query params: code, state
- Response: Redirects to frontend with success/error status
```

### Email Sending API

```
POST /api/v1/emails/send
- Send an email (publish to queue)
- Body: SendEmail event object
- Response: { eventId, status }

GET /api/v1/emails/:eventId
- Get email sending status
- Response: { eventId, status, logs }

GET /api/v1/emails
- List email logs
- Query params: tenantId, userId, status, from, to, page, limit
- Response: { items: Array of EmailLog, totalCount, page, limit }
```

## 5. Frontend Components

### Account Linking UI
- OAuth flow initiation
- Account status monitoring
- Provider selection (Gmail, Outlook)
- Quota visualization

### Email Logs Dashboard
- Filtering and searching
- Status visualization
- Retry capabilities
- Export functionality
