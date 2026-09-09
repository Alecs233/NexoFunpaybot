import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env from project root
dotenv.config({ path: path.resolve(__dirname, '../.env') });

/**
 * Safely masks a Discord webhook URL for logging purposes.
 * @param {string} url
 * @returns {string}
 */
export function maskWebhookUrl(url) {
  if (!url || typeof url !== 'string') return '[NOT_SET]';
  const trimmed = url.trim();
  const match = trimmed.match(/^(https?:\/\/(?:ptb\.|canary\.)?discord(?:app)?\.com\/api\/webhooks\/\d+\/)([^\/?#]+)(.*)$/i);
  if (match) {
    const visiblePrefix = match[1];
    const token = match[2];
    const rest = match[3] || '';
    const maskedToken = token.length > 6 
      ? `${token.slice(0, 3)}***${token.slice(-3)}`
      : '******';
    return `${visiblePrefix}${maskedToken}${rest}`;
  }
  // Generic fallback if URL structure is different
  return trimmed.replace(/([a-zA-Z0-9_-]{10,})/g, (val) => `${val.slice(0, 3)}***${val.slice(-3)}`);
}

/**
 * Parses boolean string value safely
 * @param {string|undefined} val 
 * @param {boolean} defaultVal 
 * @returns {boolean}
 */
function parseBool(val, defaultVal = true) {
  if (val === undefined || val === null || val === '') return defaultVal;
  const lower = String(val).trim().toLowerCase();
  return lower === 'true' || lower === '1' || lower === 'yes';
}

/**
 * Parses integer safely with fallback and minimum clamp
 * @param {string|undefined} val 
 * @param {number} defaultVal 
 * @param {number} min 
 * @returns {number}
 */
function parseIntSafe(val, defaultVal = 60000, min = 5000) {
  if (!val) return defaultVal;
  const parsed = parseInt(val, 10);
  if (isNaN(parsed)) return defaultVal;
  return Math.max(parsed, min);
}

export const config = {
  discordWebhookUrl: (process.env.DISCORD_WEBHOOK_URL || '').trim(),
  discordBotToken: (process.env.DISCORD_BOT_TOKEN || '').trim(),
  discordChannelId: (process.env.DISCORD_CHANNEL_ID || '').trim(),
  pollInterval: parseIntSafe(process.env.FUNPAY_POLL_INTERVAL, 60000, 5000),
  startupMessage: parseBool(process.env.STARTUP_MESSAGE, true),
  logLevel: (process.env.LOG_LEVEL || 'info').trim().toLowerCase(),
  port: process.env.PORT ? parseInt(process.env.PORT, 10) : 3000,
  funpayUrl: 'https://funpay.com/en/lots/250/',
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  requestTimeoutMs: 15000,
  discordRateLimitDelayMs: 500,
  maxSeenOffers: 10000
};

export default config;
