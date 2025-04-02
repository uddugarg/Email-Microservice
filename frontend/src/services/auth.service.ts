import { api } from './api.service';

// Parse URL query parameters after OAuth redirect
const parseOAuthCallback = (): {
    success: boolean;
    provider?: string;
    email?: string;
    error?: string
} => {
    const urlParams = new URLSearchParams(window.location.search);
    const success = urlParams.get('success') === 'true';

    if (success) {
        return {
            success: true,
            provider: urlParams.get('provider') || undefined,
            email: urlParams.get('email') || undefined
        };
    } else {
        return {
            success: false,
            error: urlParams.get('error') || 'Unknown error'
        };
    }
};

// Clear OAuth callback parameters from URL
const clearOAuthParams = (): void => {
    window.history.replaceState({}, document.title, window.location.pathname);
};

export const authService = {
    parseOAuthCallback,
    clearOAuthParams
};