import { config, maskWebhookUrl } from './config.js';
import { logger } from './logger.js';
import { truncate, sleep } from './utils.js';
import { sendChannelMessage } from './discord-bot.js';

const COLOR_RUST_ORANGE = 0xCE422B;
const COLOR_STARTUP_GREEN = 0x57F287;
const BOT_NAME = 'NexoBot';

/**
 * Pune aici ID-urile canalelor unde vrei să ajungă ofertele.
 * (Poți adăuga oricâte canale vrei, separate prin virgulă).
 */
const EXTRA_CHANNELS = [
  // Lipește ID-ul canalului de pe al doilea server între ghilimele:
  'PUNE_AICI_ID_CANAL_SECUNDAR'
];

/**
 * Sends a raw payload to the Discord Webhook URL with rate-limit and retry handling.
 */
export async function sendWebhookPayload(webhookUrl, payload, attempt = 1) {
  if (!webhookUrl || typeof webhookUrl !== 'string' || !webhookUrl.startsWith('http')) {
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

    if (response.status === 429) {
      const retryAfterHeader = response.headers.get('retry-after');
      const retryAfterSec = retryAfterHeader ? parseFloat(retryAfterHeader) : 2;
      const waitMs = Math.ceil(retryAfterSec * 1000) + 200;

      logger.warn(`Discord rate limit (HTTP 429). Retrying after ${waitMs}ms...`);
      await sleep(waitMs);

      if (attempt < maxAttempts) {
        return await sendWebhookPayload(webhookUrl, payload, attempt + 1);
      }
      return false;
    }

    if (!response.ok) {
      const errText = await response.text();
      logger.error(`Discord webhook error ${response.status}: ${errText}`);
      return false;
    }

    return true;
  } catch (error) {
    logger.error('Error sending Discord webhook:', error.message);
    return false;
  }
}

/**
 * Builds the standard Discord embed and payload for a FunPay offer (fără alerte speciale DLC).
 */
export function buildOfferPayload(offer) {
  const rawTitle = offer.title || 'Rust Account';
  const embedTitle = truncate(rawTitle, 256);

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
      value: offer.isOnline ? '🟢 Seller Online' : '⚪ Seller Offline',
      inline: true
    },
    {
      name: '🔗 Link',
      value: `[View Offer on FunPay](${offer.url})`,
      inline: false
    }
  ];

  const embed = {
    title: embedTitle,
    url: offer.url,
    color: COLOR_RUST_ORANGE,
    fields,
    footer: {
      text: 'FunPay • Rust Accounts Bot'
    },
    timestamp: new Date().toISOString()
  };

  return {
    username: BOT_NAME,
    embeds: [embed]
  };
}

/**
 * Dispatches a notification to ALL configured Discord channels and webhooks.
 */
export async function dispatchDiscordNotification(payload) {
  let sentAny = false;

  // Unim canalul principal din config cu canalele secundare
  const allChannels = [
    config.discordChannelId,
    ...EXTRA_CHANNELS
  ]
    .flatMap(id => (id ? String(id).split(',') : []))
    .map(id => id.trim())
    .filter(id => id && id !== 'PUNE_AICI_ID_CANAL_SECUNDAR');

  // Trimitem pe fiecare canal prin Bot Token
  if (config.discordBotToken && allChannels.length > 0) {
    for (const channelId of allChannels) {
      try {
        const ok = await sendChannelMessage(config.discordBotToken, channelId, payload);
        if (ok) sentAny = true;
      } catch (err) {
        logger.error(`Eroare la trimitere pe canalul ${channelId}:`, err.message);
      }
      await sleep(250); // Mică pauză între canale ca să respectăm rate limit-ul
    }
  }

  // Trimitem și pe Webhook dacă este configurat
  if (config.discordWebhookUrl) {
    const webhooks = config.discordWebhookUrl.split(',').map(u => u.trim()).filter(Boolean);
    for (const webhook of webhooks) {
      const ok = await sendWebhookPayload(webhook, payload);
      if (ok) sentAny = true;
      await sleep(250);
    }
  }

  return sentAny;
}

/**
 * Sends a notification for a newly detected offer.
 */
export async function sendOfferNotification(offer) {
  const payload = buildOfferPayload(offer);
  return await dispatchDiscordNotification(payload);
}

/**
 * Sends the bot startup message to Discord.
 */
export async function sendStartupNotification(stats = { total: 0, kept: 0 }) {
  const embed = {
    title: '🚀 NexoBot Started',
    description: 
      `Monitoring FunPay Rust Offers for new account listings.\n` +
      `Found **${stats.total}** existing account offers - watching for new ones.\n\n` +
      `**Filters active:**\n` +
      `  • Rental / service offers excluded\n` +
      `  • Accounts with 0 hours excluded`,
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

  return await dispatchDiscordNotification(payload);
}
