import { config } from './config.js';
import { logger } from './logger.js';
import { truncate, sleep } from './utils.js';
import { sendChannelMessage, getDynamicChannels } from './discord-bot.js';

const COLOR_RUST_ORANGE = 0xCE422B;
const COLOR_STARTUP_GREEN = 0x57F287;
const BOT_NAME = 'NexoBot';

/**
 * Sends a raw payload to a Discord Webhook URL.
 */
export async function sendWebhookPayload(webhookUrl, payload, attempt = 1) {
  if (!webhookUrl || typeof webhookUrl !== 'string' || !webhookUrl.startsWith('http')) {
    return false;
  }

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (response.status === 429) {
      await sleep(2000);
      if (attempt < 3) return await sendWebhookPayload(webhookUrl, payload, attempt + 1);
      return false;
    }

    return response.ok;
  } catch (error) {
    return false;
  }
}

/**
 * Builds the standard Discord embed for a FunPay offer (fără alerte DLC).
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
 * Dispatches a notification to ALL channels registered dynamically or via config.
 */
export async function dispatchDiscordNotification(payload) {
  let sentAny = false;

  // Preia canalul din config + toate canalele activate prin /accounts
  const dynamic = typeof getDynamicChannels === 'function' ? getDynamicChannels() : [];
  const allChannels = [
    config.discordChannelId,
    ...dynamic
  ]
    .flatMap(id => (id ? String(id).split(',') : []))
    .map(id => id.trim())
    .filter(Boolean);

  const uniqueChannels = [...new Set(allChannels)];

  // Trimite pe toate canalele
  if (config.discordBotToken && uniqueChannels.length > 0) {
    for (const channelId of uniqueChannels) {
      try {
        const ok = await sendChannelMessage(config.discordBotToken, channelId, payload);
        if (ok) sentAny = true;
      } catch (err) {}
      await sleep(250);
    }
  }

  // Trimite și pe webhook dacă există
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

export async function sendOfferNotification(offer) {
  const payload = buildOfferPayload(offer);
  return await dispatchDiscordNotification(payload);
}

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
