/*
 * QA states suite (E) + untranslated error codes check (Lead request).
 * Uses request interception on the mock app and the no-key server on 4322.
 */
import { createRequire } from 'node:module';
import fs from 'node:fs/promises';

const require = createRequire(import.meta.url);
const puppeteer = require('/tmp/ds-qa/node_modules/puppeteer-core');
const MOCK = 'http://127.0.0.1:4321';
const NOKEY = 'http://127.0.0.1:4322';
const SHOTS = new URL('./screenshots/', import.meta.url).pathname;
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
function check(id, name, pass, detail = '') {
  results.push({ id, name, pass: !!pass, detail: String(detail).slice(0, 1200) });
  console.log((pass ? 'PASS ' : 'FAIL ') + id + ' ' + name + (detail ? ' :: ' + String(detail).slice(0, 700) : ''));
}
async function newPage(browser, viewport) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setCacheEnabled(false);
  if (viewport) await page.setViewport(viewport);
  return { ctx, page };
}
async function appReady(page) {
  await page.waitForFunction(() => document.documentElement.classList.contains('app-ready'), { timeout: 15000 });
}
async function shot(page, name) { await page.screenshot({ path: SHOTS + name }); console.log('SHOT ' + name); }
async function visible(page, sel) {
  return page.evaluate((s) => { const el = document.querySelector(s); return !!(el && !el.hidden && getComputedStyle(el).display !== 'none' && el.getClientRects().length); }, sel);
}
const SUCCESS_PAYLOAD = {
  results: [
    { rerank_score: 2.1, title: 'Recovered result one', url: 'https://example.com/recovered-1',
      snippet: 'Retry succeeded.', summary: 'Long summary after retry.', site_name: 'Example',
      site_icon: null, date: '2026-10-18T09:00:00.000Z', authority: 3 },
    { rerank_score: 1.2, title: 'Recovered result two', url: 'https://example.com/recovered-2',
      snippet: 'Second result after retry.', summary: '', site_name: 'Example',
      site_icon: null, date: null, authority: 1 }
  ],
  mock: false
};

async function main() {
  await fs.mkdir(SHOTS, { recursive: true });
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true,
    args: ['--no-sandbox', '--disable-gpu', '--lang=en-US', '--disable-dev-shm-usage'] });

  /* ---------------- Interception-driven states on the mock app ---------------- */
  try {
    const { ctx, page } = await newPage(browser, { width: 1440, height: 1000 });
    const consoleErrors = [];
    const pageErrors = [];
    page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) consoleErrors.push(m.text()); });
    page.on('pageerror', (e) => pageErrors.push(String(e)));
    await page.setRequestInterception(true);
    let mode = 'pass';
    let searchHits = 0;
    const CODE_STATUS = { invalid_api_key: 502, insufficient_balance: 502, forbidden: 502, rate_limited: 429,
      upstream_error: 502, timeout: 504, not_found: 404, missing_api_key: 503, unknown: 500, invalid_request: 400 };
    page.on('request', (req) => {
      const url = req.url();
      if (!url.includes('/api/search')) { req.continue(); return; }
      searchHits += 1;
      let query = '';
      try { query = JSON.parse(req.postData() || '{}').query || ''; } catch (e) { query = ''; }
      if (mode === 'pass') { req.continue(); return; }
      if (mode === 'empty') {
        req.respond({ status: 200, contentType: 'application/json',
          body: JSON.stringify({ results: [], query, count: 10, mock: true, tookMs: 12 }) });
        return;
      }
      if (mode === '429') {
        req.respond({ status: 429, contentType: 'application/json',
          body: JSON.stringify({ error: { code: 'rate_limited', message: 'Too many requests.' } }) });
        return;
      }
      if (mode === 'abort') { req.abort('failed'); return; }
      if (mode === 'success') {
        req.respond({ status: 200, contentType: 'application/json',
          body: JSON.stringify({ ...SUCCESS_PAYLOAD, query, count: 10, tookMs: 8 }) });
        return;
      }
      if (mode.startsWith('code:')) {
        const code = mode.slice(5);
        const status = CODE_STATUS[code] || 502;
        const message = 'Intercepted ' + code;
        req.respond({ status, contentType: 'application/json',
          body: JSON.stringify({ error: { code, message } }) });
        return;
      }
      req.continue();
    });

    await page.goto(MOCK + '/?lang=en&theme=light', { waitUntil: 'domcontentloaded' });
    await appReady(page);
    await sleep(400);
    check('E1', 'mock mode shows demo badge and no API-setup notice',
      await visible(page, '[data-testid="demo-badge"]') && !(await visible(page, '[data-testid="api-notice"]')),
      'demoBadge=' + await visible(page, '[data-testid="demo-badge"]') + ' notice=' + await visible(page, '[data-testid="api-notice"]'));

    const dict = await page.evaluate(() => window.DS_I18N.dictionaries.en);

    /* no-results */
    mode = 'empty';
    await page.evaluate(() => {
      const i = document.getElementById('search-input');
      i.value = 'zzz no matches qa';
      document.getElementById('search-form').requestSubmit();
    });
    await page.waitForFunction(() => !document.querySelector('[data-testid="no-results"]').hidden, { timeout: 10000 });
    await sleep(500);
    let state = await page.evaluate(() => ({
      noResultsVisible: !document.querySelector('[data-testid="no-results"]').hidden,
      title: document.getElementById('no-results-title').textContent,
      hint: document.querySelector('#no-results .state-hint').textContent,
      resultsVisible: !document.querySelector('[data-testid="results"]').hidden
    }));
    check('E2', 'empty results -> localized no-results state with query',
      state.noResultsVisible && state.title.includes('zzz no matches qa')
      && state.title === dict.noResultsTitle.replace('{query}', 'zzz no matches qa') && state.hint === dict.noResultsHint
      && !state.resultsVisible, JSON.stringify(state));
    await shot(page, 'state-no-results.png');

    /* 429 -> error + retry -> recovery */
    mode = '429';
    const before429 = searchHits;
    await page.evaluate(() => {
      const i = document.getElementById('search-input');
      i.value = 'rate limited qa';
      document.getElementById('search-form').requestSubmit();
    });
    await page.waitForFunction(() => !document.querySelector('[data-testid="error-state"]').hidden, { timeout: 10000 });
    await sleep(500);
    state = await page.evaluate(() => ({
      visible: !document.getElementById('error-state').hidden,
      title: document.getElementById('error-title').textContent,
      message: document.getElementById('error-message').textContent,
      retryVisible: document.getElementById('retry-button').getBoundingClientRect().height > 0,
      retryText: document.getElementById('retry-button').textContent.trim(),
      opacity: getComputedStyle(document.getElementById('error-state')).opacity,
      titleColor: getComputedStyle(document.getElementById('error-title')).color,
      titleFontSize: getComputedStyle(document.getElementById('error-title')).fontSize,
      messageColor: getComputedStyle(document.getElementById('error-message')).color,
      animation: getComputedStyle(document.getElementById('error-state')).animationName
    }));
    check('E3', '429 -> localized rate_limited error state with retry',
      state.visible && state.title === dict.errors.rate_limited.title
      && state.message === dict.errors.rate_limited.message && state.retryVisible && state.retryText.length > 0
      && state.opacity === '1',
      JSON.stringify(state));
    await shot(page, 'state-error-rate-limited.png');

    const hitsBeforeRetry = searchHits;
    await page.click('#retry-button');
    await page.waitForFunction(() => !document.querySelector('[data-testid="error-state"]').hidden, { timeout: 10000 });
    await sleep(200);
    check('E4', 'retry re-issues the same query on failure',
      searchHits > hitsBeforeRetry, 'search hits ' + hitsBeforeRetry + ' -> ' + searchHits);

    mode = 'success';
    await page.click('#retry-button');
    await page.waitForFunction(() => document.querySelectorAll('[data-testid="result-item"]').length === 2, { timeout: 10000 });
    const recovered = await page.evaluate(() => ({
      results: document.querySelectorAll('[data-testid="result-item"]').length,
      errorHidden: document.getElementById('error-state').hidden,
      firstTitle: document.querySelector('[data-testid="result-item"] .result-title').textContent
    }));
    check('E5', 'retry recovers to results after transient error', recovered.results === 2
      && recovered.errorHidden && recovered.firstTitle.includes('Recovered'), JSON.stringify(recovered));

    /* network abort */
    mode = 'abort';
    await page.evaluate(() => {
      const i = document.getElementById('search-input');
      i.value = 'network failure qa';
      document.getElementById('search-form').requestSubmit();
    });
    await page.waitForFunction(() => !document.querySelector('[data-testid="error-state"]').hidden, { timeout: 10000 });
    await sleep(500);
    state = await page.evaluate(() => ({
      title: document.getElementById('error-title').textContent,
      message: document.getElementById('error-message').textContent,
      live: document.getElementById('live-status').textContent
    }));
    check('E6', 'failed network request -> localized network_error state',
      state.title === dict.errors.network_error.title && state.message === dict.errors.network_error.message,
      JSON.stringify(state));
    await shot(page, 'state-network-error.png');

    /* error-code localization coverage (Lead request) */
    const codes = ['invalid_api_key', 'insufficient_balance', 'forbidden', 'rate_limited', 'upstream_error',
      'timeout', 'not_found', 'missing_api_key', 'unknown'];
    const renderedByCode = {};
    for (const code of codes) {
      mode = 'code:' + code;
      await page.evaluate((q) => {
        const i = document.getElementById('search-input');
        i.value = q;
        document.getElementById('search-form').requestSubmit();
      }, 'error code ' + code + ' qa');
      await page.waitForFunction(() => !document.querySelector('[data-testid="error-state"]').hidden, { timeout: 10000 });
      await page.waitForFunction((expected) => document.getElementById('error-title').textContent === expected,
        { timeout: 5000 }, (dict.errors[code] && dict.errors[code].title) || dict.errors.unknown.title).catch(() => {});
      renderedByCode[code] = await page.evaluate(() => ({
        title: document.getElementById('error-title').textContent,
        message: document.getElementById('error-message').textContent
      }));
    }
    const knownCodes = codes.filter((code) => dict.errors[code]);
    const untranslated = knownCodes.filter((code) => renderedByCode[code].title !== dict.errors[code].title);
    check('E7', 'the 8 client-known error codes render their localized title', untranslated.length === 0,
      'untranslated=' + JSON.stringify(untranslated.map((c) => ({ code: c,
        expected: dict.errors[c] && dict.errors[c].title, actual: renderedByCode[c].title }))));
    const serverOnly = ['invalid_api_key', 'insufficient_balance', 'forbidden'];
    check('E8', 'server-only error codes (invalid_api_key/insufficient_balance/forbidden) render specific localized messages',
      serverOnly.every((code) => renderedByCode[code]
        && renderedByCode[code].title !== dict.errors.network_error.title
        && renderedByCode[code].title !== dict.errors.unknown.title),
      JSON.stringify(Object.fromEntries(serverOnly.map((c) => [c, renderedByCode[c]]))));

    check('E9', 'no JS console/page errors during intercepted state flows',
      consoleErrors.length === 0 && pageErrors.length === 0,
      JSON.stringify({ console: consoleErrors.slice(0, 5), page: pageErrors.slice(0, 5) }));
    await ctx.close();
  } catch (error) {
    check('E.ERR', 'interception state section completed without harness exception', false, String(error && error.stack || error));
  }

  /* ---------------- Real no-key server: missing_api_key notice/error ---------------- */
  try {
    const { ctx, page } = await newPage(browser, { width: 1440, height: 1000 });
    const consoleErrors = [];
    const pageErrors = [];
    page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) consoleErrors.push(m.text()); });
    page.on('pageerror', (e) => pageErrors.push(String(e)));
    await page.goto(NOKEY + '/?lang=en&theme=light', { waitUntil: 'domcontentloaded' });
    await appReady(page);
    await page.waitForFunction(() => !document.getElementById('api-notice').hidden, { timeout: 10000 });
    await sleep(300);
    const notice = await page.evaluate(() => ({
      visible: !document.getElementById('api-notice').hidden,
      title: document.getElementById('notice-title').textContent,
      body: document.getElementById('notice-body').textContent,
      action: document.getElementById('notice-action').textContent.trim(),
      demo: !document.getElementById('demo-badge').hidden,
      dict: window.DS_I18N.dictionaries.en
    }));
    check('E10', 'no-key server shows localized API setup notice (mock off)',
      notice.visible && notice.title === notice.dict.noticeTitle && notice.body === notice.dict.noticeBody
      && notice.action === notice.dict.noticeSetup && notice.demo === false, JSON.stringify(notice));
    await shot(page, 'state-missing-api-key.png');

    await page.click('[data-testid="search-input"]');
    await page.type('[data-testid="search-input"]', 'needs api key qa');
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => !document.querySelector('[data-testid="error-state"]').hidden, { timeout: 10000 });
    const err = await page.evaluate(() => ({
      title: document.getElementById('error-title').textContent,
      message: document.getElementById('error-message').textContent,
      dict: window.DS_I18N.dictionaries.en
    }));
    check('E11', 'search without key -> localized missing_api_key error',
      err.title === err.dict.errors.missing_api_key.title && err.message === err.dict.errors.missing_api_key.message,
      JSON.stringify(err));

    await page.click('#notice-action');
    await sleep(400);
    const setup = await page.evaluate(() => {
      const pop = document.getElementById('help-popover');
      return {
        popoverVisible: !pop.hidden,
        activeId: document.activeElement && document.activeElement.id,
        setupScrollTop: pop.scrollTop,
        setupRect: document.getElementById('setup-section').getBoundingClientRect().top,
        popTop: pop.getBoundingClientRect().top,
        docsVisible: document.querySelector('.docs-link').getBoundingClientRect().height > 0
      };
    });
    check('E12', 'notice action opens help popover focused on setup section',
      setup.popoverVisible && setup.activeId === 'setup-section' && setup.docsVisible, JSON.stringify(setup));
    await shot(page, 'state-missing-api-key-setup.png');
    check('E13', 'no JS console/page errors during missing-key flow',
      consoleErrors.length === 0 && pageErrors.length === 0,
      JSON.stringify({ console: consoleErrors.slice(0, 5), page: pageErrors.slice(0, 5) }));
    await ctx.close();
  } catch (error) {
    check('E.ERR2', 'no-key state section completed without harness exception', false, String(error && error.stack || error));
  }

  await browser.close();
  const passed = results.filter((r) => r.pass).length;
  const failed = results.filter((r) => !r.pass);
  console.log('\nSTATES SUMMARY: ' + passed + ' pass / ' + failed.length + ' fail / ' + results.length + ' total');
  if (failed.length) console.log('FAILED: ' + failed.map((f) => f.id).join(', '));
  await fs.writeFile(new URL('./browser-states-results.json', import.meta.url), JSON.stringify({ generatedAt: new Date().toISOString(), results }, null, 2));
}
main().catch((e) => { console.error('HARNESS ERROR', e); process.exitCode = 1; });
