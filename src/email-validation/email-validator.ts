import * as dns from 'dns';
import { promisify } from 'util';
import fetch from 'node-fetch';
import { logger } from '../utils/logger';

export interface EmailValidationService {
    validateEmail(email: string): Promise<ValidationResult>;
    isDisposableEmail(email: string): Promise<boolean>;
}

export interface ValidationResult {
    valid: boolean;
    reachable: boolean;
    disposable: boolean;
    reason?: string;
}

export class EmailValidator implements EmailValidationService {
    private disposableDomains: Set<string>;
    private disposableDomainsLastUpdated: number;

    constructor() {
        this.disposableDomains = new Set();
        this.disposableDomainsLastUpdated = 0;
    }

    async validateEmail(email: string): Promise<ValidationResult> {
        try {
            // Basic format validation
            const formatValid = this.validateFormat(email);
            if (!formatValid.valid) {
                return {
                    valid: false,
                    reachable: false,
                    disposable: false,
                    reason: formatValid.reason
                };
            }

            // Check if the domain is disposable
            const domain = email.split('@')[1];
            const isDisposable = await this.isDisposableEmail(email);

            if (isDisposable) {
                return {
                    valid: true,
                    reachable: false, // Skip reachability for disposable
                    disposable: true,
                    reason: 'Disposable email address'
                };
            }

            // Check domain MX records
            const reachable = await this.checkMXRecords(domain);

            return {
                valid: true,
                reachable,
                disposable: false,
                reason: !reachable ? 'Domain does not have valid mail servers' : undefined
            };
        } catch (error) {
            logger.error('Error validating email:', error);
            return {
                valid: false,
                reachable: false,
                disposable: false,
                reason: 'Error during validation'
            };
        }
    }

    async isDisposableEmail(email: string): Promise<boolean> {
        try {
            const domain = email.split('@')[1].toLowerCase();

            // Update disposable domains list if older than 1 day
            if (Date.now() - this.disposableDomainsLastUpdated > 86400000) {
                await this.updateDisposableDomainsList();
            }

            return this.disposableDomains.has(domain);
        } catch (error) {
            logger.error('Error checking if email is disposable:', error);
            return false; // Fail open - assume not disposable if check fails
        }
    }

    private validateFormat(email: string): { valid: boolean; reason?: string } {
        // Basic format validation using regex
        const regex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

        if (!regex.test(email)) {
            return {
                valid: false,
                reason: 'Invalid email format'
            };
        }

        // Additional checks
        const parts = email.split('@');
        if (parts.length !== 2) {
            return {
                valid: false,
                reason: 'Email must contain exactly one @ symbol'
            };
        }

        const [local, domain] = parts;

        if (local.length > 64) {
            return {
                valid: false,
                reason: 'Local part exceeds maximum length'
            };
        }

        if (domain.length > 255) {
            return {
                valid: false,
                reason: 'Domain exceeds maximum length'
            };
        }

        return { valid: true };
    }

    private async checkMXRecords(domain: string): Promise<boolean> {
        const resolveMx = promisify(dns.resolveMx);

        try {
            const records = await resolveMx(domain);
            return records && records.length > 0;
        } catch (error) {
            logger.debug(`No MX records found for domain: ${domain}`);
            return false;
        }
    }

    private async updateDisposableDomainsList(): Promise<void> {
        try {
            // Fetch from a reliable source (using public GitHub repository as example)
            const response = await fetch('https://raw.githubusercontent.com/disposable-email-domains/disposable-email-domains/master/disposable_email_blocklist.conf');

            if (!response.ok) {
                throw new Error(`Failed to fetch disposable domains: ${response.statusText}`);
            }

            const text = await response.text();
            const domains = text.split('\n')
                .map(line => line.trim())
                .filter(line => line && !line.startsWith('#'));

            this.disposableDomains = new Set(domains);
            this.disposableDomainsLastUpdated = Date.now();

            logger.info(`Updated disposable domains list: ${domains.length} domains`);
        } catch (error) {
            logger.error('Error updating disposable domains list:', error);
            // If update fails, keep using the existing list
        }
    }
}