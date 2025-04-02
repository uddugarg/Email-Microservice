-- Create database schema

-- Email Accounts Table
CREATE TABLE IF NOT EXISTS email_accounts (
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
CREATE TABLE IF NOT EXISTS quota_usage (
  account_id UUID NOT NULL REFERENCES email_accounts(id),
  date DATE NOT NULL,
  sent INTEGER NOT NULL DEFAULT 0,
  failed INTEGER NOT NULL DEFAULT 0,
  remaining INTEGER NOT NULL,
  PRIMARY KEY(account_id, date)
);

-- Email Logs Table
CREATE TABLE IF NOT EXISTS email_logs (
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
CREATE INDEX IF NOT EXISTS idx_email_logs_event_id ON email_logs(event_id);
CREATE INDEX IF NOT EXISTS idx_email_logs_tenant_user ON email_logs(tenant_id, user_id);
CREATE INDEX IF NOT EXISTS idx_email_logs_status ON email_logs(status);
CREATE INDEX IF NOT EXISTS idx_email_logs_timestamp ON email_logs(timestamp);

-- Insert demo data
INSERT INTO email_accounts (
  id, tenant_id, user_id, provider, email, credentials, quota_settings, status
) VALUES (
  '11111111-1111-1111-1111-111111111111',
  'demo-tenant',
  'user-1',
  'GMAIL',
  'demo.user1@gmail.com',
  '{"accessToken": "", "refreshToken": "", "expiresAt": 0}',
  '{"dailyLimit": 50, "warmupStep": 10, "maxLimit": 500, "currentStage": 1}',
  'INACTIVE'
) ON CONFLICT DO NOTHING;

INSERT INTO email_accounts (
  id, tenant_id, user_id, provider, email, credentials, quota_settings, status
) VALUES (
  '22222222-2222-2222-2222-222222222222',
  'demo-tenant',
  'user-2',
  'OUTLOOK',
  'demo.user2@outlook.com',
  '{"accessToken": "", "refreshToken": "", "expiresAt": 0}',
  '{"dailyLimit": 50, "warmupStep": 10, "maxLimit": 500, "currentStage": 1}',
  'INACTIVE'
) ON CONFLICT DO NOTHING;