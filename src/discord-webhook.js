import { config, maskWebhookUrl } from './config.js';
import { logger } from './logger.js';
import { truncate, sleep } from './utils.js';

const COLOR_RUST_ORANGE = 0xCE422B;
const COLOR_DLC_GOLD = 0xFFD700;
const COLOR_STARTUP_GREEN = 0x57F287;
const BOT_NAME = 'NexoBot';

/**
 * Sends a raw payload to the Discord Webhook URL with rate-limit and retry handling.
 * @param {string} webhookUrl 
 * @param {object} payload 
 * @param {number} [attempt=1] 
 * @returns {Promise<boolean>}
 */
export async function sendWebhookPayload(webhookUrl, payload, attempt = 1) {
  if (!webhookUrl || typeof webhookUrl !== 'string' || !webhookUrl.startsWith('http')) {
    logger.warn('Discord webhook URL is invalid or not configured. Notification skipped.');
    return false;
  }

  const maxAttempts = 3;

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    // Handle Discord HTTP 429 Rate Limit
    if (response.status === 429) {
      const retryAfterHeader = response.headers.get('retry-after');
      const retryAfterSec = retryAfterHeader ? parseFloat(retryAfterHeader) : 2;
      const waitMs = Math.ceil(retryAfterSec * 1000) + 200;

      logger.warn(`Discord rate limit encountered (HTTP 429). Retrying after ${waitMs}ms (Attempt ${attempt}/${maxAttempts})...`);
      await sleep(waitMs);

      if (attempt < maxAttempts) {
        return await sendWebhookPayload(webhookUrl, payload, attempt + 1);
      } else {
        logger.error('Exceeded maximum retry attempts for Discord webhook due to rate limits.');
        return false;
      }
    }

    if (!response.ok) {
      const errText = await response.text();
      logger.error(`Discord webhook failed with HTTP ${response.status} (${response.statusText}): ${errText}`);
      return false;
    }

    return true;
  } catch (error) {
    logger.error('Error sending Discord webhook:', error.message);
    return false;
  }
}

/**
 * Builds the Discord embed and payload for a FunPay offer.
 * @param {object} offer 
 * @returns {object}
 */
export function buildOfferPayload(offer) {
  const isDlc = Boolean(offer.hasDLC);
  const rawTitle = offer.title || 'Rust Account';
  const prefix = isDlc ? '‼️ DLC DETECTED — ' : '';
  const maxTitleLen = 256 - prefix.length;
  const embedTitle = prefix + truncate(rawTitle, maxTitleLen);

  const fields = [
    {
      name: '💰 Price',
      value: offer.price || 'N/A',
      inline: true
    },
    {
      name: '🖥️ Platform',
      value: offer.server || 'PC',
      inline: true
    },
    {
      name: '🟢 Status',
      value: offer.isOnline ? '🟢 Seller Online' : '🔴 Seller Offline',
      inline: true
    },
    {
      name: '🔗 Link',
      value: `[View on FunPay](${offer.url})`,
      inline: false
    }
  ];

  if (isDlc) {
    fields.push({
      name: '‼️ URGENT — DLC Content',
      value: 'This account may include DLC / skins / packs. Check immediately!',
      inline: false
    });
  }

  const embed = {
    title: embedTitle,
    url: offer.url,
    color: isDlc ? COLOR_DLC_GOLD : COLOR_RUST_ORANGE,
    fields,
    footer: {
      text: 'FunPay • Rust Accounts Bot'
    },
    timestamp: new Date().toISOString()
  };

  const payload = {
    username: BOT_NAME,
    embeds: [embed]
  };

  if (isDlc) {
    payload.content = '‼️ **DLC ACCOUNT — CHECK NOW!**';
  }

  return payload;
}

/**
 * Sends a notification for a newly detected offer.
 * @param {string} webhookUrl 
 * @param {object} offer 
 * @returns {Promise<boolean>}
 */
export async function sendOfferNotification(webhookUrl, offer) {
  const payload = buildOfferPayload(offer);
  return await sendWebhookPayload(webhookUrl, payload);
}

/**
 * Sends the bot startup message to Discord.
 * @param {string} webhookUrl 
 * @param {{ total: number, kept: number }} stats 
 * @returns {Promise<boolean>}
 */
export async function sendStartupNotification(webhookUrl, stats = { total: 0, kept: 0 }) {
  const embed = {
    title: '🤖 NexoBot Started',
    description: 
      `Monitoring FunPay Rust Offers for new account listings.\n\n` +
      `Found **${stats.total}** existing offers — watching for new ones.\n\n` +
      `**Filtre active:**\n` +
      `• Rental/service offers excluded\n` +
      `• Zero-hours offers excluded\n` +
      `• DLC offers flagged`,
    color: COLOR_STARTUP_GREEN,
    footer: {
      text: 'FunPay • Rust Accounts Bot'
    },
    timestamp: new Date().toISOString()
  };

  const payload = {
    username: BOT_NAME,
    embeds: [embed]
  };

  return await sendWebhookPayload(webhookUrl, payload);
}
