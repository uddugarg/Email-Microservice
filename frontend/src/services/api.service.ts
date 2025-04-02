import axios from 'axios';
import { EmailAccount } from '../types/account.types';
import { SendEmailRequest, EmailLog } from '../types/email.types';

// API client configuration
const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001/api/v1';
const API_KEY = process.env.REACT_APP_API_KEY || 'your-api-key';

// Configure axios instance
const apiClient = axios.create({
    baseURL: API_URL,
    headers: {
        'Content-Type': 'application/json',
        'X-API-Key': API_KEY
    }
});

// Account management
const getAccounts = async (tenantId: string): Promise<EmailAccount[]> => {
    const response = await apiClient.get(`/accounts?tenantId=${tenantId}`);
    return response.data;
};

const updateAccount = async (accountId: string, updates: any): Promise<void> => {
    await apiClient.put(`/accounts/${accountId}`, updates);
};

// Email sending
const sendEmail = async (request: SendEmailRequest): Promise<{ eventId: string; status: string }> => {
    const response = await apiClient.post('/emails/send', request);
    return response.data;
};

const getEmailStatus = async (eventId: string): Promise<any> => {
    const response = await apiClient.get(`/emails/${eventId}`);
    return response.data;
};

const getEmailLogs = async (tenantId: string, userId: string, page: number, limit: number): Promise<{
    items: EmailLog[];
    totalCount: number;
    page: number;
    limit: number;
}> => {
    const response = await apiClient.get(`/emails`, {
        params: { tenantId, userId, page, limit }
    });
    return response.data;
};

// Authentication
const getAuthorizationUrl = (provider: string, tenantId: string, userId: string, redirectUri: string): void => {
    const url = `${API_URL}/auth/${provider}/authorize?tenantId=${tenantId}&userId=${userId}&redirectUri=${encodeURIComponent(redirectUri)}`;
    window.location.href = url;
};

export const api = {
    getAccounts,
    updateAccount,
    sendEmail,
    getEmailStatus,
    getEmailLogs,
    getAuthorizationUrl
};