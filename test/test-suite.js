import assert from 'assert';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

import { isRentalOrService, isZeroHours, hasDlcKeywords, filterOffer, truncate } from '../src/utils.js';
import { parseFunPayHtml } from '../src/funpay-scraper.js';
import { StateStore } from '../src/state-store.js';
import { buildOfferPayload } from '../src/discord-webhook.js';
import { maskWebhookUrl } from '../src/config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const TEST_DATA_DIR = path.resolve(__dirname, '../data/test-tmp');

let passedTests = 0;
let totalTests = 0;

function runTest(name, fn) {
  totalTests++;
  try {
    fn();
    console.log(`  ✅ [PASS] ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  ❌ [FAIL] ${name}`);
    console.error(err);
  }
}

async function runAsyncTest(name, fn) {
  totalTests++;
  try {
    await fn();
    console.log(`  ✅ [PASS] ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  ❌ [FAIL] ${name}`);
    console.error(err);
  }
}

console.log('\n====================================================');
console.log('         NEXOBOT TEST SUITE — EXECUTION             ');
console.log('====================================================\n');

// 1. FILTER 1: Rental & Service
console.log('--- 1. FILTER 1: Rental & Service Keyword Tests ---');

runTest('Detects English rental keywords (rent, rental, renting, hire, boost, etc.)', () => {
  assert.strictEqual(isRentalOrService('Rust Account for rent 24h'), true);
  assert.strictEqual(isRentalOrService('Rust rental server'), true);
  assert.strictEqual(isRentalOrService('Rust Account Renting service'), true);
  assert.strictEqual(isRentalOrService('Rust account for hire'), true);
  assert.strictEqual(isRentalOrService('Hour boost for Rust'), true);
  assert.strictEqual(isRentalOrService('Boosting hours and trophies'), true);
  assert.strictEqual(isRentalOrService('Pro Rust coaching session'), true);
  assert.strictEqual(isRentalOrService('Raid carry service fast'), true);
  assert.strictEqual(isRentalOrService('Rust sulfur farming service'), true);
  assert.strictEqual(isRentalOrService('Resource grind fast delivery'), true);
  assert.strictEqual(isRentalOrService('Power level rust account'), true);
  assert.strictEqual(isRentalOrService('Fast leveling and farming'), true);
  assert.strictEqual(isRentalOrService('Playing for you in rust'), true);
});

runTest('Detects Russian rental & boosting keywords (аренда, прокачка, буст, услуга, игра за)', () => {
  assert.strictEqual(isRentalOrService('Аренда аккаунта Rust на сутки'), true);
  assert.strictEqual(isRentalOrService('Прокачка аккаунта и часов Rust'), true);
  assert.strictEqual(isRentalOrService('Качественный буст часов'), true);
  assert.strictEqual(isRentalOrService('Услуга фарма ресурсов на сервере'), true);
  assert.strictEqual(isRentalOrService('Игра за вас в Rust турнир'), true);
});

runTest('Does not falsely flag legitimate sell offers', () => {
  assert.strictEqual(isRentalOrService('Rust Account 1500 hours + AK skin + Full Access'), false);
  assert.strictEqual(isRentalOrService('Personal Steam account Rust + DayZ + CS2'), false);
  assert.strictEqual(isRentalOrService('Rust Clean Steam Account, Original Email'), false);
});

// 2. FILTER 2: Zero Hours Filter
console.log('\n--- 2. FILTER 2: Zero Hours Tests ---');

runTest('Detects all variations of 0 hours (0h, 0 hours, 0 hrs, 0 ore, 0 ч, rust 0, zero hours)', () => {
  assert.strictEqual(isZeroHours('Rust account 0 hours fresh'), true);
  assert.strictEqual(isZeroHours('Fresh Rust 0 hour steam'), true);
  assert.strictEqual(isZeroHours('Rust Account with 0 hrs'), true);
  assert.strictEqual(isZeroHours('Account 0 hr on counter'), true);
  assert.strictEqual(isZeroHours('Steam Rust 0h no bans'), true);
  assert.strictEqual(isZeroHours('Steam Rust 0 h clean'), true);
  assert.strictEqual(isZeroHours('Rust 0hours unranked'), true);
  assert.strictEqual(isZeroHours('Cont Rust 0 ore nou'), true);
  assert.strictEqual(isZeroHours('Аккаунт Rust 0 ч новый'), true);
  assert.strictEqual(isZeroHours('Аккаунт 0ч без привязок'), true);
  assert.strictEqual(isZeroHours('Rust 0 game time'), true);
  assert.strictEqual(isZeroHours('Zero hours fresh account'), true);
});

runTest('Does not falsely filter accounts with hours > 0 (100h, 50h, 1000 hours, 20h, etc.)', () => {
  assert.strictEqual(isZeroHours('Rust Account 100 hours + skins'), false);
  assert.strictEqual(isZeroHours('Rust Steam Account 500h'), false);
  assert.strictEqual(isZeroHours('Account with 2000 hrs played'), false);
  assert.strictEqual(isZeroHours('Rust account 50h original email'), false);
  assert.strictEqual(isZeroHours('Cont Rust 10 ore jucate'), false);
  assert.strictEqual(isZeroHours('Rust 50 ч наиграно'), false);
});

// 3. FILTER 3: DLC Detection
console.log('\n--- 3. FILTER 3: DLC & Special Pack Detection Tests ---');

runTest('Identifies DLC keywords accurately', () => {
  assert.strictEqual(hasDlcKeywords('Rust + Voice Props DLC + Instruments'), true);
  assert.strictEqual(hasDlcKeywords('Rust Account with Battle Pass maxed'), true);
  assert.strictEqual(hasDlcKeywords('Rust Battlepass completed'), true);
  assert.strictEqual(hasDlcKeywords('Rust Account with Skin Pack 2024'), true);
  assert.strictEqual(hasDlcKeywords('Rust with Nomad Skin Bundle'), true);
  assert.strictEqual(hasDlcKeywords('Rust Account all Twitch Drop items'), true);
  assert.strictEqual(hasDlcKeywords('Rust with Twitch Drops collection'), true);
  assert.strictEqual(hasDlcKeywords('Rust Founder edition badge'), true);
  assert.strictEqual(hasDlcKeywords('Rust Supporter pack included'), true);
  assert.strictEqual(hasDlcKeywords('Legacy Rust skin account'), true);
  assert.strictEqual(hasDlcKeywords('Rust ultimate starter pack'), true);
  assert.strictEqual(hasDlcKeywords('Rust weapon skin bundle'), true);
  assert.strictEqual(hasDlcKeywords('Standard Rust Account 200h'), false);
});

// 4. Combined Filter Evaluation
console.log('\n--- 4. Combined Filter Evaluation Tests ---');

runTest('Correctly rejects rentals, rejects 0h, keeps normal, and flags DLC', () => {
  const rentalResult = filterOffer({ title: 'Rust Account rent 12 hours' });
  assert.strictEqual(rentalResult.keep, false);
  assert.strictEqual(rentalResult.reason, 'rental_service');

  const zeroHoursResult = filterOffer({ title: 'Rust 0 hours clean steam' });
  assert.strictEqual(zeroHoursResult.keep, false);
  assert.strictEqual(zeroHoursResult.reason, 'zero_hours');

  const normalResult = filterOffer({ title: 'Rust Account 300 hours with AK Skin' });
  assert.strictEqual(normalResult.keep, true);
  assert.strictEqual(normalResult.hasDLC, false);

  const dlcResult = filterOffer({ title: 'Rust Account 1500h + Voice Props DLC + Twitch Drops' });
  assert.strictEqual(dlcResult.keep, true);
  assert.strictEqual(dlcResult.hasDLC, true);
});

// 5. HTML Scraper & Parser Tests
console.log('\n--- 5. HTML Scraper & Parser Tests ---');

runTest('Parses valid FunPay HTML table items correctly', () => {
  const sampleHtml = `
    <div class="tc-table">
      <a href="/lots/offer?id=123456" class="tc-item" data-id="123456" data-online="1">
        <div class="tc-server">PC</div>
        <div class="tc-desc">
          <div class="tc-desc-text">Rust Account 500h + Voice Props DLC | Full Access</div>
        </div>
        <div class="tc-price" data-s="15.50">$15.50</div>
        <div class="media-user-status online"></div>
      </a>
      <a href="https://funpay.com/lots/offer?id=789012" class="tc-item" data-id="789012">
        <div class="tc-server">Steam</div>
        <div class="tc-desc-text">Clean Rust Account 1000 hours</div>
        <div class="tc-price" data-s="25.00">25.00 €</div>
        <div class="media-user-status offline"></div>
      </a>
      <!-- Invalid item with missing title/id -->
      <a href="" class="tc-item">
        <div class="tc-price">0</div>
      </a>
    </div>
  `;

  const offers = parseFunPayHtml(sampleHtml);
  assert.strictEqual(offers.length, 2);

  // Offer 1
  assert.strictEqual(offers[0].id, '123456');
  assert.strictEqual(offers[0].title, 'Rust Account 500h + Voice Props DLC | Full Access');
  assert.strictEqual(offers[0].price, '$15.50');
  assert.strictEqual(offers[0].priceValue, 15.5);
  assert.strictEqual(offers[0].server, 'PC');
  assert.strictEqual(offers[0].url, 'https://funpay.com/lots/offer?id=123456');
  assert.strictEqual(offers[0].isOnline, true);
  assert.strictEqual(offers[0].hasDLC, true);

  // Offer 2
  assert.strictEqual(offers[1].id, '789012');
  assert.strictEqual(offers[1].title, 'Clean Rust Account 1000 hours');
  assert.strictEqual(offers[1].price, '25.00 €');
  assert.strictEqual(offers[1].priceValue, 25);
  assert.strictEqual(offers[1].server, 'Steam');
  assert.strictEqual(offers[1].url, 'https://funpay.com/lots/offer?id=789012');
  assert.strictEqual(offers[1].isOnline, false);
  assert.strictEqual(offers[1].hasDLC, false);
});

// 6. State Store & Atomic Persistence Tests
console.log('\n--- 6. State Store & Atomic Persistence Tests ---');

await runAsyncTest('StateStore initializes, saves atomically, records seen IDs and enforces 10k limit', async () => {
  await fs.mkdir(TEST_DATA_DIR, { recursive: true });
  const testStateFile = path.join(TEST_DATA_DIR, 'state.json');
  const testTmpFile = path.join(TEST_DATA_DIR, 'state.json.tmp');
  const testBrokenFile = path.join(TEST_DATA_DIR, 'state.json.broken');

  // Clean up any test residue
  await fs.rm(TEST_DATA_DIR, { recursive: true, force: true });
  await fs.mkdir(TEST_DATA_DIR, { recursive: true });

  const store = new StateStore({
    stateFile: testStateFile,
    tmpFile: testTmpFile,
    brokenFile: testBrokenFile,
    dataDir: TEST_DATA_DIR,
    maxSeen: 5
  });

  await store.init();
  assert.strictEqual(store.getSeenCount(), 0);
  assert.strictEqual(store.isSeen('101'), false);

  // Add IDs
  await store.addSeen(['101', '102', '103']);
  assert.strictEqual(store.getSeenCount(), 3);
  assert.strictEqual(store.isSeen('101'), true);
  assert.strictEqual(store.isSeen('102'), true);
  assert.strictEqual(store.isSeen('999'), false);

  // Verify file exists on disk
  const content = JSON.parse(await fs.readFile(testStateFile, 'utf8'));
  assert.deepStrictEqual(content.seenOfferIds, ['101', '102', '103']);

  // Add more to trigger max limit of 5
  await store.addSeen(['104', '105', '106', '107']);
  assert.strictEqual(store.getSeenCount(), 5);
  assert.strictEqual(store.isSeen('101'), false); // Oldest pruned
  assert.strictEqual(store.isSeen('107'), true);

  // Reload store from disk
  const store2 = new StateStore({
    stateFile: testStateFile,
    tmpFile: testTmpFile,
    brokenFile: testBrokenFile,
    dataDir: TEST_DATA_DIR,
    maxSeen: 5
  });
  await store2.init();
  assert.strictEqual(store2.getSeenCount(), 5);
  assert.strictEqual(store2.isSeen('107'), true);

  // Test Corruption Recovery
  await fs.writeFile(testStateFile, '{ this is invalid json !!!', 'utf8');
  const store3 = new StateStore({
    stateFile: testStateFile,
    tmpFile: testTmpFile,
    brokenFile: testBrokenFile,
    dataDir: TEST_DATA_DIR,
    maxSeen: 5
  });
  await store3.init();
  assert.strictEqual(store3.getSeenCount(), 0); // Reinitialized safely
  const brokenExists = await fs.stat(testBrokenFile).then(() => true).catch(() => false);
  assert.strictEqual(brokenExists, true, 'Broken state file should be backed up');

  // Clean test folder
  await fs.rm(TEST_DATA_DIR, { recursive: true, force: true });
});

// 7. Discord Webhook Payload Builder Tests
console.log('\n--- 7. Discord Webhook Payload Tests ---');

runTest('Builds standard offer payload with Rust Orange color and proper fields', () => {
  const offer = {
    id: '12345',
    title: 'Rust Account 500h + Personal Account',
    price: '$12.00',
    server: 'PC',
    url: 'https://funpay.com/lots/offer?id=12345',
    isOnline: true,
    hasDLC: false
  };

  const payload = buildOfferPayload(offer);
  assert.strictEqual(payload.username, 'NexoBot');
  assert.strictEqual(payload.content, undefined);
  assert.strictEqual(payload.embeds.length, 1);

  const embed = payload.embeds[0];
  assert.strictEqual(embed.title, 'Rust Account 500h + Personal Account');
  assert.strictEqual(embed.color, 0xCE422B); // Rust orange
  assert.strictEqual(embed.fields.length, 4);
  assert.strictEqual(embed.fields[0].value, '$12.00');
  assert.strictEqual(embed.fields[2].value, '🟢 Seller Online');
  assert.strictEqual(embed.footer.text, 'FunPay • Rust Accounts Bot');
});

runTest('Builds DLC offer payload with Gold color, alert prefix, warning content, and urgent field', () => {
  const offer = {
    id: '67890',
    title: 'Rust Account with Voice Props DLC + Nomad Bundle',
    price: '$35.00',
    server: 'Steam',
    url: 'https://funpay.com/lots/offer?id=67890',
    isOnline: false,
    hasDLC: true
  };

  const payload = buildOfferPayload(offer);
  assert.strictEqual(payload.username, 'NexoBot');
  assert.strictEqual(payload.content, '‼️ **DLC ACCOUNT — CHECK NOW!**');
  assert.strictEqual(payload.embeds.length, 1);

  const embed = payload.embeds[0];
  assert.strictEqual(embed.title.startsWith('‼️ DLC DETECTED — '), true);
  assert.strictEqual(embed.color, 0xFFD700); // Gold
  assert.strictEqual(embed.fields.length, 5);
  assert.strictEqual(embed.fields[2].value, '🔴 Seller Offline');
  assert.strictEqual(embed.fields[4].name, '‼️ URGENT — DLC Content');
});

// 8. Security & Webhook Masking Tests
console.log('\n--- 8. Security & Webhook Masking Tests ---');

runTest('Masks Discord webhook URLs correctly to prevent secret leakage in logs', () => {
  const secretUrl = 'https://discord.com/api/webhooks/123456789012345678/aBcDeFgHiJkLmNoPqRsTuVwXyZ_123456789';
  const masked = maskWebhookUrl(secretUrl);
  assert.strictEqual(masked.includes('aBcDeFgHiJkLmNoPqRsTuVwXyZ_123456789'), false);
  assert.strictEqual(masked.startsWith('https://discord.com/api/webhooks/123456789012345678/'), true);
  assert.strictEqual(masked.includes('***'), true);
});

// Summary
console.log('\n====================================================');
console.log(`TEST RESULTS: ${passedTests} / ${totalTests} passed`);
console.log('====================================================\n');

if (passedTests !== totalTests) {
  process.exit(1);
}
