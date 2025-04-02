/**
 * Simple logger implementation
 * In a production environment, you would use a more robust logging library
 * like winston or pino
 */

enum LogLevel {
    DEBUG = 0,
    INFO = 1,
    WARN = 2,
    ERROR = 3
}

class Logger {
    private level: LogLevel;

    constructor() {
        // Set log level based on environment
        const env = process.env.NODE_ENV || 'development';
        this.level = env === 'production' ? LogLevel.INFO : LogLevel.DEBUG;
    }

    private formatMessage(level: string, message: string, data?: any): string {
        const timestamp = new Date().toISOString();
        let formattedMessage = `${timestamp} [${level}] ${message}`;

        if (data) {
            if (data instanceof Error) {
                formattedMessage += `\n${data.stack || data.message}`;
            } else if (typeof data === 'object') {
                try {
                    formattedMessage += `\n${JSON.stringify(data, null, 2)}`;
                } catch (e) {
                    formattedMessage += `\n[Object]`;
                }
            } else {
                formattedMessage += `\n${data}`;
            }
        }

        return formattedMessage;
    }

    debug(message: string, data?: any): void {
        if (this.level <= LogLevel.DEBUG) {
            console.debug(this.formatMessage('DEBUG', message, data));
        }
    }

    info(message: string, data?: any): void {
        if (this.level <= LogLevel.INFO) {
            console.info(this.formatMessage('INFO', message, data));
        }
    }

    warn(message: string, data?: any): void {
        if (this.level <= LogLevel.WARN) {
            console.warn(this.formatMessage('WARN', message, data));
        }
    }

    error(message: string, data?: any): void {
        if (this.level <= LogLevel.ERROR) {
            console.error(this.formatMessage('ERROR', message, data));
        }
    }
}

export const logger = new Logger();