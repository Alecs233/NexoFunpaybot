import http from 'http';
import { config, maskWebhookUrl } from './config.js';
import { logger } from './logger.js';
import { fetchFunPayOffers } from './funpay-scraper.js';
import { filterOffer, sleep } from './utils.js';
import { stateStore } from './state-store.js';
import { sendOfferNotification, sendStartupNotification } from './discord-webhook.js';

let isPolling = false;
let pollTimer = null;
let healthServer = null;

/**
 * Starts the optional lightweight HTTP health check server.
 */
function startHealthServer(port) {
  if (!port) return;

  try {
    healthServer = http.createServer((req, res) => {
      const url = req.url || '';
      if (url === '/health' || url === '/') {
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: true, service: 'nexobot-funpay' }));
      } else {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Not Found' }));
      }
    });

    healthServer.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        logger.warn(`Health server port ${port} is in use. Health server skipped.`);
      } else {
        logger.warn(`Health server error: ${err.message}`);
      }
    });

    healthServer.listen(port, () => {
      logger.info(`Health check server listening on port ${port} (GET /health)`);
    });
  } catch (err) {
    logger.warn(`Could not start health check server: ${err.message}`);
  }
}

/**
 * Core polling cycle logic.
 * @param {boolean} isInitialSeed 
 */
async function runPollCycle(isInitialSeed = false) {
  if (isPolling) {
    logger.warn('Previous polling cycle is still running. Skipping overlapping execution.');
    return;
  }

  isPolling = true;
  const cycleStartTime = Date.now();

  try {
    // 1. Fetch raw offers from FunPay
    const rawOffers = await fetchFunPayOffers();
    const totalCount = rawOffers.length;

    // 2. Apply filters & compute metrics
    let rentalFiltered = 0;
    let zeroHoursFiltered = 0;
    let dlcCount = 0;
    const keptOffers = [];

    for (const offer of rawOffers) {
      const evaluation = filterOffer(offer);
      if (evaluation.hasDLC) {
        offer.hasDLC = true;
        dlcCount++;
      }

      if (!evaluation.keep) {
        if (evaluation.reason === 'rental_service') {
          rentalFiltered++;
        } else if (evaluation.reason === 'zero_hours') {
          zeroHoursFiltered++;
        }
      } else {
        keptOffers.push(offer);
      }
    }

    logger.info(
      `Filters summary -> Total: ${totalCount} | Filtered Rentals: ${rentalFiltered} | ` +
      `Filtered 0-Hours: ${zeroHoursFiltered} | DLC Flagged: ${dlcCount} | Kept: ${keptOffers.length}`
    );

    // 3. Handle Initial Seed Mode
    if (isInitialSeed) {
      const allIds = rawOffers.map((o) => o.id);
      await stateStore.addSeen(allIds);
      logger.info(`Initial seed finished: ${allIds.length} existing offers recorded in state (no Discord spam sent).`);

      if (config.startupMessage && config.discordWebhookUrl) {
        logger.info('Sending startup message to Discord...');
        await sendStartupNotification(config.discordWebhookUrl, {
          total: totalCount,
          kept: keptOffers.length
        });
      }

      return;
    }

    // 4. Identify brand new offers
    const newOffers = keptOffers.filter((offer) => !stateStore.isSeen(offer.id));
    logger.info(`New unseen offers detected: ${newOffers.length}`);

    // 5. Send notifications for new offers
    if (newOffers.length > 0) {
      for (const offer of newOffers) {
        logger.info(`Sending Discord notification for offer #${offer.id}: "${offer.title}" (${offer.price}) [DLC: ${offer.hasDLC ? 'YES' : 'NO'}]`);
        
        await sendOfferNotification(config.discordWebhookUrl, offer);
        await stateStore.addSeen(offer.id);

        // Rate-limiting delay between consecutive webhooks
        if (config.discordRateLimitDelayMs > 0) {
          await sleep(config.discordRateLimitDelayMs);
        }
      }
    }
  } catch (error) {
    logger.error('Error during FunPay polling cycle:', error.message);
  } finally {
    isPolling = false;
    const duration = Date.now() - cycleStartTime;
    logger.info(`Polling cycle completed in ${duration}ms. Next poll in ${config.pollInterval / 1000}s.`);
  }
}

/**
 * Schedules the next polling execution.
 */
function scheduleNextPoll() {
  if (pollTimer) {
    clearTimeout(pollTimer);
  }

  pollTimer = setTimeout(async () => {
    await runPollCycle(false);
    scheduleNextPoll();
  }, config.pollInterval);
}

/**
 * Main application bootstrap function.
 */
export async function main() {
  console.log('====================================================');
  console.log('             NexoBot — FunPay Rust Monitor          ');
  console.log('====================================================');

  logger.info('NexoBot is starting up...');
  logger.info(`Configuration loaded -> Poll Interval: ${config.pollInterval}ms | Startup Message: ${config.startupMessage} | Log Level: ${config.logLevel}`);

  // Validate webhook URL presence
  if (!config.discordWebhookUrl) {
    logger.error('CRITICAL ERROR: DISCORD_WEBHOOK_URL is missing or empty in .env!');
    logger.error('Please configure your DISCORD_WEBHOOK_URL in .env before running NexoBot.');
  } else {
    logger.info(`Discord Webhook configured: ${maskWebhookUrl(config.discordWebhookUrl)}`);
  }

  // Initialize persistence store
  await stateStore.init();

  // Start optional health check server
  if (config.port) {
    startHealthServer(config.port);
  }

  // Run initial seed
  logger.info('Performing initial FunPay seed check...');
  await runPollCycle(true);

  // Start recurring polling schedule
  logger.info(`Starting periodic polling (every ${config.pollInterval / 1000}s)...`);
  scheduleNextPoll();
}

/**
 * Graceful shutdown handlers
 */
function handleShutdown(signal) {
  logger.info(`Received ${signal}. Shutting down NexoBot gracefully...`);
  if (pollTimer) {
    clearTimeout(pollTimer);
    pollTimer = null;
  }
  if (healthServer) {
    healthServer.close();
  }
  process.exit(0);
}

process.on('SIGINT', () => handleShutdown('SIGINT'));
process.on('SIGTERM', () => handleShutdown('SIGTERM'));

// If executed directly via node src/index.js, start main
if (process.argv[1] && process.argv[1].endsWith('index.js')) {
  main().catch((err) => {
    logger.error('Fatal initialization error:', err);
  });
}
