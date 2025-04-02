import { EmailProviderAdapter } from './provider.interface';
import { GmailProvider } from './gmail-provider';
import { OutlookProvider } from './outlook-provider';
import { SMTPProvider } from './smtp-provider';

export class EmailProviderFactory {
    getProvider(providerType: string): EmailProviderAdapter {
        switch (providerType) {
            case 'GMAIL':
                return new GmailProvider();
            case 'OUTLOOK':
                return new OutlookProvider();
            case 'SMTP':
                return new SMTPProvider();
            default:
                throw new Error(`Unsupported provider type: ${providerType}`);
        }
    }
}