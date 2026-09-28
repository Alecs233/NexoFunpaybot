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

function saveChannelsToDisk() {
  try {
    const dir = path.dirname(CHANNELS_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(CHANNELS_FILE, JSON.stringify([...dynamicChannels], null, 2), 'utf8');
  } catch (e) {}
}

export function addDynamicChannel(channelId) {
  if (!channelId) return false;
  dynamicChannels.add(String(channelId).trim());
  saveChannelsToDisk();
  return true;
}

export function removeDynamicChannel(channelId) {
  if (!channelId) return false;
  dynamicChannels.delete(String(channelId).trim());
  saveChannelsToDisk();
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
let botUserId = null;

const DISCORD_API_BASE = 'https://discord.com/api/v10';
const GATEWAY_URL = 'wss://gateway.discord.gg/?v=10&encoding=json';

/**
 * Trimiterea panoului cu butoane Start / Stop
 */
export async function sendControlPanel(token, channelId) {
  const payload = {
    content: '🎮 **NexoBot — Configurare Oferte FunPay Rust**\nApasă pe butonul de mai jos pentru a activa trimiterea ofertelor pe acest canal:',
    components: [
      {
        type: 1, // Action Row
        components: [
          {
            type: 2, // Button
            style: 3, // Success (Green)
            label: '▶️ Start Oferte Rust',
            custom_id: 'start_offers'
          },
          {
            type: 2, // Button
            style: 4, // Danger (Red)
            label: '⏹️ Stop Oferte',
            custom_id: 'stop_offers'
          }
        ]
      }
    ]
  };

  return await sendChannelMessage(token, channelId, payload);
}

/**
 * Înregistrează comenzile slash /accounts și /start cu Discord API
 */
async function registerSlashCommands(token, applicationId) {
  try {
    const authHeader = token.startsWith('Bot ') ? token : `Bot ${token}`;
    const url = `${DISCORD_API_BASE}/applications/${applicationId}/commands`;
    
    // Înregistrăm comanda /start
    await fetch(url, {
      method: 'POST',
      headers: { 'Authorization': authHeader, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'start',
        description: 'Trimite panoul cu butonul de Start pentru oferte FunPay Rust',
        type: 1
      })
    });

    // Înregistrăm comanda /accounts
    await fetch(url, {
      method: 'POST',
      headers: { 'Authorization': authHeader, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'accounts',
        description: 'Activeaza trimiterea ofertelor FunPay Rust pe acest canal',
        type: 1
      })
    });

    logger.info('Comenzile slash au fost inregistrate cu succes.');
  } catch (err) {}
}

export function startDiscordGateway(token) {
  if (!token) return;
  if (typeof globalThis.WebSocket === 'undefined') return;

  shouldReconnect = true;

  function connect() {
    try {
      gatewayWs = new globalThis.WebSocket(GATEWAY_URL);

      gatewayWs.onopen = () => {};

      gatewayWs.onmessage = async (event) => {
        try {
          const payload = JSON.parse(event.data);
          const { op, d, s, t } = payload;

          if (s !== null && s !== undefined) lastSequence = s;

          if (op === 10) {
            const heartbeatInterval = d.heartbeat_interval;
            if (heartbeatTimer) clearInterval(heartbeatTimer);

            setTimeout(() => {
              sendHeartbeat();
              heartbeatTimer = setInterval(sendHeartbeat, heartbeatInterval);
            }, heartbeatInterval * Math.random());

            sendIdentify(token);
          }

          if (op === 0) {
            if (t === 'READY') {
              isConnected = true;
              botUserId = d.user.id;
              logger.info(`NexoBot online ca ${d.user.username}`);
              registerSlashCommands(token, botUserId);
            }

            // 1. CÂND CINEVA APASĂ PE BUTON (Start sau Stop)
            if (t === 'INTERACTION_CREATE' && d.type === 3) {
              const customId = d.data.custom_id;
              const channelId = d.channel_id;

              if (customId === 'start_offers') {
                addDynamicChannel(channelId);
                logger.info(`Canal activat prin buton: ${channelId}`);

                await fetch(`${DISCORD_API_BASE}/interactions/${d.id}/${d.token}/callback`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    type: 4,
                    data: {
                      content: '✅ **NexoBot a fost activat!** Toate ofertele FunPay Rust vor fi trimise automat pe acest canal.'
                    }
                  })
                });
              } else if (customId === 'stop_offers') {
                removeDynamicChannel(channelId);
                logger.info(`Canal oprit prin buton: ${channelId}`);

                await fetch(`${DISCORD_API_BASE}/interactions/${d.id}/${d.token}/callback`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    type: 4,
                    data: {
                      content: '⏹️ **Ofertele FunPay Rust au fost oprite pentru acest canal.**'
                    }
                  })
                });
              }
            }

            // 2. COMENZI SLASH (/start sau /accounts)
            if (t === 'INTERACTION_CREATE' && d.type === 2) {
              const cmdName = d.data.name;
              const channelId = d.channel_id;

              if (cmdName === 'accounts' || cmdName === 'start') {
                addDynamicChannel(channelId);
                await fetch(`${DISCORD_API_BASE}/interactions/${d.id}/${d.token}/callback`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    type: 4,
                    data: {
                      content: '✅ **NexoBot a fost activat!** Ofertele FunPay Rust vor fi trimise aici.'
                    }
                  })
                });
              }
            }

            // 3. CÂND CINEVA DĂ TAG LA BOT (@NexoBot) SAU SCRIE !start
            if (t === 'MESSAGE_CREATE') {
              const channelId = d.channel_id;
              const isMentioned = botUserId && d.mentions && d.mentions.some(m => m.id === botUserId);
              const content = (d.content || '').trim().toLowerCase();

              if (isMentioned || content === '!start' || content === '!accounts') {
                await sendControlPanel(token, channelId);
              }
            }
          }

          if (op === 7) gatewayWs.close(4000);
          if (op === 9) setTimeout(() => sendIdentify(token), 2000);
        } catch (err) {}
      };

      gatewayWs.onclose = () => {
        isConnected = false;
        if (heartbeatTimer) clearInterval(heartbeatTimer);
        if (shouldReconnect) setTimeout(connect, 5000);
      };
    } catch (err) {}
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
          intents: 513,
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
