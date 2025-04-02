<p align="center">
  <img src="https://via.placeholder.com/150x150.png?text=EM" alt="Email Microservice Logo" width="150" height="150">
</p>

<h1 align="center">📧 Email Microservice</h1>

<p align="center">
  <strong>Enterprise-grade email delivery with provider flexibility, queue resilience & intelligent throttling</strong>
</p>

<p align="center">
  <a href="#key-features">Key Features</a> •
  <a href="#architecture">Architecture</a> •
  <a href="#quick-start">Quick Start</a> •
  <a href="#deployment">Deployment</a> •
  <a href="#configuration">Configuration</a> •
  <a href="#api-reference">API Reference</a> •
  <a href="#tech-stack">Tech Stack</a>
</p>

<p align="center">
  <img src="https://via.placeholder.com/800x400.png?text=Email+Microservice+Dashboard" alt="Email Microservice Dashboard" width="800">
</p>

---

## ✨ Key Features

- **🧰 Multi-Provider Support**: Seamlessly switch between Gmail, Outlook, or SMTP
- **📊 Quota Management**: Smart email warmup strategy to maximize deliverability
- **🔄 Queue-Based Architecture**: Reliable processing with retry capabilities
- **🛡️ Email Validation**: Protect your reputation by rejecting disposable addresses
- **📝 Detailed Logging**: Complete visibility of every email's journey
- **🔐 OAuth Integration**: Secure connection to email providers
- **📱 Responsive Dashboard**: Manage accounts and monitor status from anywhere
- **🚀 Horizontally Scalable**: Easy scaling for high-volume workloads

## 🏗️ Architecture

Email Microservice follows a clean, modern architecture with clear separation of concerns:

<p align="center">
  <img src="https://via.placeholder.com/700x400.png?text=Architecture+Diagram" alt="Architecture Diagram" width="700">
</p>

The system consists of:

1. **Queue Adapter Layer**: Abstracts queue implementation (RabbitMQ/SQS)
2. **Email Processor**: Core logic for email processing and delivery
3. **Provider Adapters**: Standardized interface for different email providers
4. **Validation Service**: Ensures email quality and deliverability
5. **API Layer**: RESTful endpoints with OAuth integration
6. **Frontend**: React-based management UI

## 🚀 Quick Start

### Prerequisites

- Node.js 16+
- PostgreSQL
- RabbitMQ or AWS SQS access

### Installation

Clone and install dependencies:

```bash
# Clone repository
git clone https://github.com/yourusername/email-microservice.git
cd email-microservice

# Install dependencies
npm install

# Install frontend dependencies
cd frontend && npm install && cd ..

# Copy environment files
cp .env.example .env
cp frontend/.env.example frontend/.env.local
```

### Database Setup

```bash
# Initialize database
psql -d postgres -c "CREATE DATABASE email_service;"
psql -d email_service -f init-db.sql
```

### Start Services

```bash
# Start API server
npm start

# In another terminal, start Email Processor
npm run processor

# In a third terminal, start frontend
cd frontend && npm start
```

Visit `http://localhost:3000` to access the dashboard.

## 🚢 Deployment

### Docker Deployment

The easiest way to deploy is using Docker Compose:

```bash
# Build and start all services
docker-compose up -d

# Scale email processor for higher throughput
docker-compose up -d --scale email-processor=3
```

### Kubernetes Deployment

For production environments, use the provided Kubernetes manifests:

```bash
# Apply Kubernetes manifests
kubectl apply -f k8s/
```

## ⚙️ Configuration

### Email Providers

To enable OAuth with providers:

#### Gmail

1. Create a project in [Google Cloud Console](https://console.cloud.google.com/)
2. Enable Gmail API
3. Create OAuth credentials
4. Configure redirect URI: `http://your-domain/api/v1/auth/gmail/callback`

#### Outlook

1. Register an app in [Azure Portal](https://portal.azure.com/)
2. Add Microsoft Graph permissions for Mail.Send
3. Configure redirect URI: `http://your-domain/api/v1/auth/outlook/callback`

### Environment Variables

Key configuration options:

```
# Queue Selection
QUEUE_TYPE=rabbitmq  # or 'sqs'

# Warmup Strategy
DEFAULT_DAILY_LIMIT=50
WARMUP_STEP=10
MAX_DAILY_LIMIT=500

# API Security
API_KEY=your-secure-key
```

See `.env.example` for all available options.

## 📝 API Reference

### Authentication

All API calls require an API key in the header:

```
X-API-Key: your-api-key
```

### Account Management

**Create Email Account**

```
POST /api/v1/accounts
```

**List Accounts**

```
GET /api/v1/accounts?tenantId={tenantId}
```

### Email Operations

**Send Email**

```
POST /api/v1/emails/send
```

```json
{
  "tenantId": "demo-tenant",
  "userId": "user-1",
  "subject": "Hello World",
  "body": "<p>This is a test email.</p>",
  "toAddress": "recipient@example.com"
}
```

**Get Email Status**

```
GET /api/v1/emails/{eventId}
```

## 🧰 Tech Stack

- **Backend**: Node.js, TypeScript, Express
- **Frontend**: React, TailwindCSS
- **Database**: PostgreSQL
- **Queues**: RabbitMQ / AWS SQS
- **Testing**: Jest, Supertest, Artillery

## 🔍 Monitoring

The service exposes key metrics for monitoring:

- Queue length and processing times
- Email success/failure rates
- Provider-specific metrics
- Quota utilization

Prometheus endpoints are available at `/metrics`.

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

---

<p align="center">
  Made with ❤️ by Udit Garg
</p>
