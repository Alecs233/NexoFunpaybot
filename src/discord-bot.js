import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from './config.js';
import { logger } from './logger.js';
import { sleep } from './utils.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CHANNELS_FILE = path.resolve(__dirname, '../data/dynamic-channels.json');

const dynamicChannels = new Set();

function initDynamicChannels() {
  try {
    if (fs.existsSync(CHANNELS_FILE)) {
      const data = JSON.parse(fs.readFileSync(CHANNELS_FILE, 'utf8'));
      if (Array.isArray(data)) {
        data.forEach(id => dynamicChannels.add(String(id)));
      }
    }
  } catch (e) {}
}
initDynamicChannels();

export function addDynamicChannel(channelId) {
  if (!channelId) return false;
  const str = String(channelId).trim();
  dynamicChannels.add(str);
  try {
    const dir = path.dirname(CHANNELS_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(CHANNELS_FILE, JSON.stringify([...dynamicChannels], null, 2), 'utf8');
  } catch (e) {}
  return true;
}

export function getDynamicChannels() {
  return [...dynamicChannels];
}

let gatewayWs = null;
let heartbeatTimer = null;
let lastSequence = null;
let isConnected = false;
let shouldReconnect = true;

const DISCORD_API_BASE = 'https://discord.com/api/v10';
const GATEWAY_URL = 'wss://gateway.discord.gg/?v=10&encoding=json';

/**
 * Register slash command /accounts with Discord API
 */
async function registerSlashCommands(token, applicationId) {
  try {
    const authHeader = token.startsWith('Bot ') ? token : `Bot ${token}`;
    const url = `${DISCORD_API_BASE}/applications/${applicationId}/commands`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: 'accounts',
        description: 'Seteaza acest canal pentru a primi toate ofertele FunPay Rust',
        type: 1
      })
    });
    if (res.ok) {
      logger.info('Slash command /accounts registered with Discord successfully.');
    }
  } catch (err) {
    logger.warn(`Could not register slash command: ${err.message}`);
  }
}

/**
 * Connects to Discord Gateway WebSocket
 */
export function startDiscordGateway(token) {
  if (!token) return;
  if (typeof globalThis.WebSocket === 'undefined') {
    logger.warn('Native WebSocket is not supported in this Node environment.');
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

      gatewayWs.onmessage = async (event) => {
        try {
          const payload = JSON.parse(event.data);
          const { op, d, s, t } = payload;

          if (s !== null && s !== undefined) {
            lastSequence = s;
          }

          // Opcode 10: HELLO
          if (op === 10) {
            const heartbeatInterval = d.heartbeat_interval;
            if (heartbeatTimer) clearInterval(heartbeatTimer);

            setTimeout(() => {
              sendHeartbeat();
              heartbeatTimer = setInterval(sendHeartbeat, heartbeatInterval);
            }, heartbeatInterval * Math.random());

            sendIdentify(token);
          }

          // Opcode 0: Dispatch Events
          if (op === 0) {
            if (t === 'READY') {
              isConnected = true;
              const botUser = d.user;
              logger.info(`🤖 NexoBot online ca ${botUser.username}#${botUser.discriminator || '0'}`);
              registerSlashCommands(token, botUser.id);
            }

            // 1. Slash command /accounts
            if (t === 'INTERACTION_CREATE') {
              if (d.data && d.data.name === 'accounts') {
                const channelId = d.channel_id;
                addDynamicChannel(channelId);
                logger.info(`Canal adaugat prin /accounts: ${channelId}`);

                try {
                  await fetch(`${DISCORD_API_BASE}/interactions/${d.id}/${d.token}/callback`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      type: 4,
                      data: {
                        content: '✅ **NexoBot activat pe acest canal!** Toate ofertele FunPay Rust vor fi trimise automat aici.'
                      }
                    })
                  });
                } catch (e) {}
              }
            }

            // 2. Chat command: merge si daca scrii !accounts sau /accounts in chat
            if (t === 'MESSAGE_CREATE') {
              const content = (d.content || '').trim().toLowerCase();
              if (content === '!accounts' || content === '/accounts') {
                const channelId = d.channel_id;
                addDynamicChannel(channelId);
                logger.info(`Canal adaugat prin mesaj text: ${channelId}`);

                sendChannelMessage(token, channelId, {
                  content: '✅ **NexoBot activat pe acest canal!** Toate ofertele FunPay Rust vor fi trimise automat aici.'
                });
              }
            }
          }

          if (op === 7) {
            gatewayWs.close(4000);
          }

          if (op === 9) {
            setTimeout(() => sendIdentify(token), 2000);
          }
        } catch (err) {}
      };

      gatewayWs.onclose = () => {
        isConnected = false;
        if (heartbeatTimer) clearInterval(heartbeatTimer);
        if (shouldReconnect) {
          setTimeout(connect, 5000);
        }
      };
    } catch (err) {
      logger.error('Failed to initialize Discord Gateway:', err.message);
    }
  }

  function sendHeartbeat() {
    if (gatewayWs && gatewayWs.readyState === 1) {
      gatewayWs.send(JSON.stringify({ op: 1, d: lastSequence }));
    }
  }

  function sendIdentify(botToken) {
    if (gatewayWs && gatewayWs.readyState === 1) {
      gatewayWs.send(JSON.stringify({
        op: 2,
        d: {
          token: botToken.startsWith('Bot ') ? botToken.slice(4) : botToken,
          intents: 33281, // GUILDS + GUILD_MESSAGES + MESSAGE_CONTENT
          properties: { os: 'linux', browser: 'NexoBot', device: 'NexoBot' },
          presence: {
            activities: [{ name: 'FunPay Rust Offers', type: 3 }],
            status: 'online',
            afk: false
          }
        }
      }));
    }
  }

  connect();
}

/**
 * Sends a message to a Discord channel
 */
export async function sendChannelMessage(token, channelId, payload, attempt = 1) {
  if (!token || !channelId) return false;

  const authHeader = token.startsWith('Bot ') ? token : `Bot ${token}`;
  const url = `${DISCORD_API_BASE}/channels/${channelId}/messages`;

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
      await sleep(2000);
      if (attempt < 3) return await sendChannelMessage(token, channelId, payload, attempt + 1);
      return false;
    }

    return response.ok;
  } catch (err) {
    return false;
  }
}

export function stopDiscordGateway() {
  shouldReconnect = false;
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  if (gatewayWs) gatewayWs.close(1000, 'Shutting down');
}
