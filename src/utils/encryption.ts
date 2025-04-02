import crypto from 'crypto';

/**
 * Utility for encrypting sensitive data like OAuth tokens
 * In a production environment, you might use a KMS service
 */

export class Encryption {
    private algorithm = 'aes-256-cbc';
    private key: Buffer;
    private iv: Buffer;

    constructor() {
        // In production, these should come from secure environment variables or a key management service
        const encryptionKey = process.env.ENCRYPTION_KEY || 'your-secret-encryption-key-min-32-chars';
        const encryptionIV = process.env.ENCRYPTION_IV || 'your-iv-16-chars';

        // Create key and iv from the provided strings
        this.key = crypto.createHash('sha256').update(encryptionKey).digest();
        this.iv = Buffer.from(encryptionIV.slice(0, 16));
    }

    encrypt(text: string): string {
        const cipher = crypto.createCipheriv(this.algorithm, this.key, this.iv);
        let encrypted = cipher.update(text, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        return encrypted;
    }

    decrypt(encryptedText: string): string {
        const decipher = crypto.createDecipheriv(this.algorithm, this.key, this.iv);
        let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
    }
}

// Singleton instance
export const encryption = new Encryption();