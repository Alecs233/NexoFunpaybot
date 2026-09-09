import { config, maskWebhookUrl } from './config.js';

const LOG_LEVELS = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3
};

/**
 * Sanitizes any string or object to remove/mask webhooks or credentials
 * @param {any} item 
 * @returns {any}
 */
function sanitize(item) {
  if (typeof item === 'string') {
    return maskWebhookUrl(item);
  }
  if (item instanceof Error) {
    return maskWebhookUrl(item.stack || item.message);
  }
  if (item && typeof item === 'object') {
    try {
      const json = JSON.stringify(item, (key, value) => {
        if (typeof value === 'string' && (key.toLowerCase().includes('webhook') || key.toLowerCase().includes('token') || key.toLowerCase().includes('secret') || value.includes('discord.com/api/webhooks'))) {
          return maskWebhookUrl(value);
        }
        return value;
      });
      return JSON.parse(json);
    } catch {
      return item;
    }
  }
  return item;
}

function getTimestamp() {
  const now = new Date();
  return now.toISOString().replace('T', ' ').substring(0, 19);
}

class Logger {
  constructor() {
    this.currentLevel = LOG_LEVELS[config.logLevel] !== undefined ? LOG_LEVELS[config.logLevel] : LOG_LEVELS.info;
  }

  setLevel(level) {
    const lvl = String(level).toLowerCase();
    if (LOG_LEVELS[lvl] !== undefined) {
      this.currentLevel = LOG_LEVELS[lvl];
    }
  }

  debug(message, ...args) {
    if (this.currentLevel <= LOG_LEVELS.debug) {
      const sanitizedArgs = args.map(sanitize);
      console.debug(`[${getTimestamp()}] [DEBUG] ${sanitize(message)}`, ...sanitizedArgs);
    }
  }

  info(message, ...args) {
    if (this.currentLevel <= LOG_LEVELS.info) {
      const sanitizedArgs = args.map(sanitize);
      console.info(`[${getTimestamp()}] [INFO]  ${sanitize(message)}`, ...sanitizedArgs);
    }
  }

  warn(message, ...args) {
    if (this.currentLevel <= LOG_LEVELS.warn) {
      const sanitizedArgs = args.map(sanitize);
      console.warn(`[${getTimestamp()}] [WARN]  ${sanitize(message)}`, ...sanitizedArgs);
    }
  }

  error(message, ...args) {
    if (this.currentLevel <= LOG_LEVELS.error) {
      const sanitizedArgs = args.map(sanitize);
      console.error(`[${getTimestamp()}] [ERROR] ${sanitize(message)}`, ...sanitizedArgs);
    }
  }
}

export const logger = new Logger();
export default logger;
