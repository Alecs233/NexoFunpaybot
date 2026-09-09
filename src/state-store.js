import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { logger } from './logger.js';
import { config } from './config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.resolve(__dirname, '../data');
const STATE_FILE = path.join(DATA_DIR, 'state.json');
const STATE_TMP_FILE = path.join(DATA_DIR, 'state.json.tmp');
const STATE_BROKEN_FILE = path.join(DATA_DIR, 'state.json.broken');

export class StateStore {
  constructor(options = {}) {
    this.stateFile = options.stateFile || STATE_FILE;
    this.tmpFile = options.tmpFile || STATE_TMP_FILE;
    this.brokenFile = options.brokenFile || STATE_BROKEN_FILE;
    this.dataDir = options.dataDir || DATA_DIR;
    this.maxSeen = options.maxSeen || config.maxSeenOffers || 10000;
    
    this.seenSet = new Set();
    this.seenList = [];
    this.lastPollAt = null;
    this.isInitialized = false;
  }

  /**
   * Initializes the state store and loads existing state from disk.
   */
  async init() {
    await this.ensureDirectory();
    await this.load();
    this.isInitialized = true;
  }

  /**
   * Ensures the data directory exists.
   */
  async ensureDirectory() {
    try {
      await fs.mkdir(this.dataDir, { recursive: true });
    } catch (err) {
      logger.error('Failed to create data directory:', err.message);
    }
  }

  /**
   * Loads state from disk, handling missing or corrupted files.
   */
  async load() {
    try {
      const data = await fs.readFile(this.stateFile, 'utf8');
      const parsed = JSON.parse(data);

      if (parsed && Array.isArray(parsed.seenOfferIds)) {
        this.seenList = parsed.seenOfferIds.map(String);
        this.seenSet = new Set(this.seenList);
        this.lastPollAt = parsed.lastPollAt || null;
        logger.info(`Loaded state: ${this.seenSet.size} seen offer IDs`);
      } else {
        throw new Error('State format invalid (seenOfferIds must be an array)');
      }
    } catch (err) {
      if (err.code === 'ENOENT') {
        // File does not exist, initialize fresh state
        logger.info('No existing state.json found. Creating initial state...');
        this.seenList = [];
        this.seenSet = new Set();
        this.lastPollAt = null;
        await this.save();
      } else {
        // File is corrupted
        logger.error(`state.json is corrupted: ${err.message}. Backing up to state.json.broken and recreating.`);
        try {
          await fs.rename(this.stateFile, this.brokenFile);
        } catch (renameErr) {
          logger.warn('Could not rename broken state file:', renameErr.message);
        }
        this.seenList = [];
        this.seenSet = new Set();
        this.lastPollAt = null;
        await this.save();
      }
    }
  }

  /**
   * Saves state atomically using a temporary file and rename.
   */
  async save() {
    try {
      await this.ensureDirectory();

      // Enforce maximum capacity
      if (this.seenList.length > this.maxSeen) {
        this.seenList = this.seenList.slice(-this.maxSeen);
        this.seenSet = new Set(this.seenList);
      }

      const payload = {
        seenOfferIds: this.seenList,
        lastPollAt: this.lastPollAt
      };

      const json = JSON.stringify(payload, null, 2);

      // Write atomically: write to .tmp then rename
      await fs.writeFile(this.tmpFile, json, 'utf8');
      await fs.rename(this.tmpFile, this.stateFile);
    } catch (err) {
      logger.error('Failed to save state.json atomically:', err.message);
    }
  }

  /**
   * Checks if an offer ID has already been seen.
   * @param {string} id 
   * @returns {boolean}
   */
  isSeen(id) {
    return this.seenSet.has(String(id));
  }

  /**
   * Adds new offer IDs to the store and persists atomically.
   * @param {string|string[]} ids 
   * @param {string} [timestamp]
   */
  async addSeen(ids, timestamp = new Date().toISOString()) {
    const list = Array.isArray(ids) ? ids : [ids];
    let added = 0;

    for (const id of list) {
      const idStr = String(id);
      if (!this.seenSet.has(idStr)) {
        this.seenSet.add(idStr);
        this.seenList.push(idStr);
        added++;
      }
    }

    this.lastPollAt = timestamp;

    if (added > 0 || !this.lastPollAt) {
      await this.save();
    }
  }

  getSeenCount() {
    return this.seenSet.size;
  }
}

export const stateStore = new StateStore();
export default stateStore;
