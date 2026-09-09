import { config } from './config.js';
import { logger } from './logger.js';
import { sleep } from './utils.js';

let gatewayWs = null;
let heartbeatTimer = null;
let lastSequence = null;
let isConnected = false;
let shouldReconnect = true;

const DISCORD_API_BASE = 'https://discord.com/api/v10';
const GATEWAY_URL = 'wss://gateway.discord.gg/?v=10&encoding=json';

/**
 * Connects to Discord Gateway WebSocket to display the bot as Online with activity.
 * @param {string} token 
 */
export function startDiscordGateway(token) {
  if (!token) return;
  if (typeof globalThis.WebSocket === 'undefined') {
    logger.warn('Native WebSocket is not supported in this Node environment. Gateway status omitted.');
    return;
  }

  shouldReconnect = true;

  function connect() {
    try {
      logger.info('Connecting NexoBot to Discord Gateway...');
      gatewayWs = new globalThis.WebSocket(GATEWAY_URL);

      gatewayWs.onopen = () => {
        logger.debug('Discord Gateway connection opened.');
      };

      gatewayWs.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          const { op, d, s, t } = payload;

          if (s !== null && s !== undefined) {
            lastSequence = s;
          }

          // Opcode 10: HELLO -> Setup heartbeat and IDENTIFY
          if (op === 10) {
            const heartbeatInterval = d.heartbeat_interval;
            if (heartbeatTimer) clearInterval(heartbeatTimer);

            // First heartbeat after jitter
            setTimeout(() => {
              sendHeartbeat();
              heartbeatTimer = setInterval(sendHeartbeat, heartbeatInterval);
            }, heartbeatInterval * Math.random());

            // Identify
            sendIdentify(token);
          }

          // Opcode 11: Heartbeat ACK
          if (op === 11) {
            logger.debug('Heartbeat acknowledged by Discord Gateway.');
          }

          // Opcode 0: Dispatch Events
          if (op === 0) {
            if (t === 'READY') {
              isConnected = true;
              const botUser = d.user;
              logger.info(`🤖 NexoBot successfully logged into Discord as ${botUser.username}#${botUser.discriminator || '0'} — Status: Online 🟢`);
            }
          }

          // Opcode 7: Reconnect requested by Discord
          if (op === 7) {
            logger.warn('Discord Gateway requested reconnect. Reconnecting...');
            gatewayWs.close(4000);
          }

          // Opcode 9: Invalid Session
          if (op === 9) {
            logger.warn('Invalid session on Discord Gateway. Re-identifying...');
            setTimeout(() => sendIdentify(token), 2000);
          }
        } catch (err) {
          logger.debug('Error parsing gateway message:', err.message);
        }
      };

      gatewayWs.onclose = (event) => {
        isConnected = false;
        if (heartbeatTimer) clearInterval(heartbeatTimer);
        logger.warn(`Discord Gateway closed (Code: ${event.code}, Reason: ${event.reason || 'None'}).`);

        if (shouldReconnect) {
          const backoff = 5000;
          logger.info(`Reconnecting to Discord Gateway in ${backoff / 1000}s...`);
          setTimeout(connect, backoff);
        }
      };

      gatewayWs.onerror = (err) => {
        logger.warn('Discord Gateway error:', err.message || err);
      };
    } catch (err) {
      logger.error('Failed to initialize Discord Gateway:', err.message);
    }
  }

  function sendHeartbeat() {
    if (gatewayWs && gatewayWs.readyState === 1) { // OPEN
      gatewayWs.send(JSON.stringify({
        op: 1,
        d: lastSequence
      }));
    }
  }

  function sendIdentify(botToken) {
    if (gatewayWs && gatewayWs.readyState === 1) {
      const identifyPayload = {
        op: 2,
        d: {
          token: botToken.startsWith('Bot ') ? botToken.slice(4) : botToken,
          intents: 513, // GUILDS (1) + GUILD_MESSAGES (512)
          properties: {
            os: 'linux',
            browser: 'NexoBot',
            device: 'NexoBot'
          },
          presence: {
            activities: [{
              name: 'FunPay Rust Offers',
              type: 3 // Watching
            }],
            status: 'online',
            afk: false
          }
        }
      };
      gatewayWs.send(JSON.stringify(identifyPayload));
    }
  }

  connect();
}

/**
 * Sends a message to a Discord channel via the Discord REST API.
 * @param {string} token 
 * @param {string} channelId 
 * @param {object} payload 
 * @param {number} [attempt=1]
 * @returns {Promise<boolean>}
 */
export async function sendChannelMessage(token, channelId, payload, attempt = 1) {
  if (!token || !channelId) return false;

  const authHeader = token.startsWith('Bot ') ? token : `Bot ${token}`;
  const url = `${DISCORD_API_BASE}/channels/${channelId}/messages`;
  const maxAttempts = 3;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (response.status === 429) {
      const retryAfterHeader = response.headers.get('retry-after');
      const retryAfterSec = retryAfterHeader ? parseFloat(retryAfterHeader) : 2;
      const waitMs = Math.ceil(retryAfterSec * 1000) + 200;

      logger.warn(`Discord REST rate limit (HTTP 429). Retrying in ${waitMs}ms...`);
      await sleep(waitMs);

      if (attempt < maxAttempts) {
        return await sendChannelMessage(token, channelId, payload, attempt + 1);
      }
      return false;
    }

    if (!response.ok) {
      const errText = await response.text();
      logger.error(`Discord REST error HTTP ${response.status}: ${errText}`);
      return false;
    }

    return true;
  } catch (err) {
    logger.error('Discord REST request failed:', err.message);
    return false;
  }
}

/**
 * Stops the Discord Gateway connection cleanly.
 */
export function stopDiscordGateway() {
  shouldReconnect = false;
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  if (gatewayWs) {
    gatewayWs.close(1000, 'Shutting down');
  }
}
