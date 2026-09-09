/**
 * Helper to pause execution for a given number of milliseconds.
 * @param {number} ms 
 * @returns {Promise<void>}
 */
export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * List of rental, boosting, and service keywords (case-insensitive).
 */
const RENTAL_SERVICE_KEYWORDS = [
  'rent',
  'rental',
  'renting',
  'hire',
  'boost',
  'boosting',
  'coaching',
  'carry',
  'service',
  'farm',
  'farming',
  'grind',
  'grinding',
  'power level',
  'powerleveling',
  'leveling',
  'playing for',
  'игра за',
  'аренда',
  'прокачка',
  'буст',
  'услуга'
];

/**
 * List of DLC, skin pack, and bonus keywords.
 */
const DLC_KEYWORDS = [
  'dlc',
  'battle pass',
  'battlepass',
  'skin pack',
  'skin bundle',
  'twitch drop',
  'twitch drops',
  'founder',
  'supporter',
  'legacy',
  'pack',
  'bundle'
];

/**
 * Regex patterns for zero-hours accounts.
 * Must match 0h, 0 hours, 0 ч, rust 0, zero hours without false-positive matching 100h, 50h, etc.
 */
const ZERO_HOURS_PATTERNS = [
  // Matches "0 hours", "0 hour", "0 hrs", "0 hr", "0h", "0 h", "0 ore", "0 ore", "0 ч", "0ч"
  // ensuring no preceding digit like 10h or 500h
  /(?:^|[^0-9])0\s*(?:hours?|hrs?|hr|h|ore|ч)(?![a-zA-Z0-9])/i,
  // Matches "zero hours", "zero hour"
  /\bzero\s*hours?\b/i,
  // Matches "rust 0"
  /\brust\s*0\b/i
];

/**
 * Checks if title indicates rental, boosting, or service.
 * @param {string} title 
 * @returns {boolean}
 */
export function isRentalOrService(title) {
  if (!title || typeof title !== 'string') return false;
  const lower = title.toLowerCase();

  for (const keyword of RENTAL_SERVICE_KEYWORDS) {
    // For english keywords, we can check word/sub-phrase presence
    // For cyrillic keywords (аренда, буст etc.), substring search is accurate
    if (keyword.includes(' ')) {
      if (lower.includes(keyword)) return true;
    } else {
      // Regex word boundary for single english words to avoid partial word mismatches
      const regex = new RegExp(`(?:^|[\\s.,;!?:_\\/\\-\\[\\]\\(\\)])${escapeRegex(keyword)}(?:$|[\\s.,;!?:_\\/\\-\\[\\]\\(\\)])`, 'i');
      if (regex.test(lower)) return true;
      // Also check simple include for non-latin or special cases
      if (/[\u0400-\u04FF]/.test(keyword) && lower.includes(keyword)) return true;
    }
  }
  return false;
}

/**
 * Checks if title indicates 0 hours played.
 * @param {string} title 
 * @returns {boolean}
 */
export function isZeroHours(title) {
  if (!title || typeof title !== 'string') return false;
  for (const pattern of ZERO_HOURS_PATTERNS) {
    if (pattern.test(title)) {
      return true;
    }
  }
  return false;
}

/**
 * Checks if title mentions DLCs, battle passes, bundles or packs.
 * @param {string} title 
 * @returns {boolean}
 */
export function hasDlcKeywords(title) {
  if (!title || typeof title !== 'string') return false;
  const lower = title.toLowerCase();

  for (const keyword of DLC_KEYWORDS) {
    if (keyword.includes(' ')) {
      if (lower.includes(keyword)) return true;
    } else {
      const regex = new RegExp(`(?:^|[\\s.,;!?:_\\/\\-\\[\\]\\(\\)])${escapeRegex(keyword)}(?:$|[\\s.,;!?:_\\/\\-\\[\\]\\(\\)])`, 'i');
      if (regex.test(lower)) return true;
    }
  }
  return false;
}

/**
 * Evaluates an offer against all filters.
 * @param {{ title: string }} offer 
 * @returns {{ keep: boolean, reason: string | null, hasDLC: boolean }}
 */
export function filterOffer(offer) {
  const title = offer.title || '';
  const dlc = hasDlcKeywords(title);

  if (isRentalOrService(title)) {
    return { keep: false, reason: 'rental_service', hasDLC: dlc };
  }

  if (isZeroHours(title)) {
    return { keep: false, reason: 'zero_hours', hasDLC: dlc };
  }

  return { keep: true, reason: null, hasDLC: dlc };
}

/**
 * Escapes characters for safe RegExp construction.
 * @param {string} str 
 * @returns {string}
 */
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Truncates text safely up to max length.
 * @param {string} text 
 * @param {number} maxLen 
 * @returns {string}
 */
export function truncate(text, maxLen = 256) {
  if (!text) return '';
  const str = String(text).trim();
  if (str.length <= maxLen) return str;
  return str.substring(0, maxLen - 3) + '...';
}
