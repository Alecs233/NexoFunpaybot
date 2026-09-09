import * as cheerio from 'cheerio';
import { config } from './config.js';
import { logger } from './logger.js';
import { hasDlcKeywords } from './utils.js';

const FUNPAY_BASE_URL = 'https://funpay.com';

/**
 * Parses FunPay HTML content and extracts Rust account offers.
 * @param {string} html 
 * @returns {Array<{ id: string, title: string, price: string, priceValue: number, server: string, url: string, isOnline: boolean, hasDLC: boolean }>}
 */
export function parseFunPayHtml(html) {
  if (!html || typeof html !== 'string') return [];
  const $ = cheerio.load(html);
  const offers = [];

  $('a.tc-item').each((_, element) => {
    try {
      const $el = $(element);
      const rawHref = $el.attr('href') || '';
      
      // Determine full URL
      let fullUrl = '';
      if (rawHref.startsWith('http://') || rawHref.startsWith('https://')) {
        fullUrl = rawHref;
      } else if (rawHref.startsWith('/')) {
        fullUrl = `${FUNPAY_BASE_URL}${rawHref}`;
      } else if (rawHref) {
        fullUrl = `${FUNPAY_BASE_URL}/${rawHref}`;
      }

      // Extract ID from data-id or href query / path
      let offerId = $el.attr('data-id') || '';
      if (!offerId && rawHref) {
        const idMatch = rawHref.match(/[?&]id=(\d+)/i) || rawHref.match(/\/offer\/(\d+)/i) || rawHref.match(/(\d+)/);
        if (idMatch) {
          offerId = idMatch[1];
        }
      }

      // Extract title from .tc-desc-text or .tc-desc
      let title = $el.find('.tc-desc-text').text().trim();
      if (!title) {
        title = $el.find('.tc-desc').text().trim();
      }

      // Extract price string and data-s numeric value
      const $priceEl = $el.find('.tc-price');
      const priceText = $priceEl.text().replace(/\s+/g, ' ').trim();
      
      let priceValue = 0;
      const dataS = $priceEl.attr('data-s') || $el.attr('data-s');
      if (dataS) {
        const parsedDataS = parseFloat(dataS);
        if (!isNaN(parsedDataS)) {
          priceValue = parsedDataS;
        }
      } else if (priceText) {
        const numMatch = priceText.replace(/,/g, '.').match(/[\d.]+/);
        if (numMatch) {
          priceValue = parseFloat(numMatch[0]) || 0;
        }
      }

      // Extract server/platform
      let server = $el.find('.tc-server').text().trim();
      if (!server) {
        server = 'PC';
      }

      // Extract seller online status
      // FunPay uses .media-user-status, data-online="1", or .online class
      const userStatusEl = $el.find('.media-user-status, .user-status');
      const dataOnlineAttr = $el.attr('data-online') || userStatusEl.attr('data-online');
      const isOnline = dataOnlineAttr === '1' || dataOnlineAttr === 'true' || 
                       userStatusEl.hasClass('online') || 
                       $el.hasClass('online');

      // Validate required fields
      if (!offerId || !title || !priceText) {
        return;
      }

      const hasDLC = hasDlcKeywords(title);

      offers.push({
        id: String(offerId),
        title,
        price: priceText,
        priceValue,
        server,
        url: fullUrl || `${FUNPAY_BASE_URL}/lots/offer?id=${offerId}`,
        isOnline: Boolean(isOnline),
        hasDLC
      });
    } catch (err) {
      logger.debug('Error parsing individual FunPay offer element:', err.message);
    }
  });

  return offers;
}

/**
 * Fetches the FunPay Rust lots page and returns parsed offers.
 * @returns {Promise<Array<{ id: string, title: string, price: string, priceValue: number, server: string, url: string, isOnline: boolean, hasDLC: boolean }>>}
 */
export async function fetchFunPayOffers() {
  const url = config.funpayUrl;
  logger.info(`Fetching FunPay offers from ${url}...`);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), config.requestTimeoutMs);

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': config.userAgent,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache'
      },
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`FunPay HTTP error ${response.status} (${response.statusText})`);
    }

    const html = await response.text();
    const offers = parseFunPayHtml(html);
    logger.info(`FunPay fetch complete: Found ${offers.length} raw offers`);
    return offers;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw new Error(`FunPay request timed out after ${config.requestTimeoutMs}ms`);
    }
    throw error;
  }
}
