/*
 * QA security suite (I): XSS payloads, URL sanitization, CSP, no external requests.
 * Uses the live-proxy app (4324 -> stub 4323) and request interception on the mock app.
 */
import { createRequire } from 'node:module';
import fs from 'node:fs/promises';

const require = createRequire(import.meta.url);
const puppeteer = require('/tmp/ds-qa/node_modules/puppeteer-core');
const LIVE = 'http://127.0.0.1:4324';
const MOCK = 'http://127.0.0.1:4321';
const SHOTS = new URL('./screenshots/', import.meta.url).pathname;
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
function check(id, name, pass, detail = '') {
  results.push({ id, name, pass: !!pass, detail: String(detail).slice(0, 1500) });
  console.log((pass ? 'PASS ' : 'FAIL ') + id + ' ' + name + (detail ? ' :: ' + String(detail).slice(0, 800) : ''));
}
async function newPage(browser) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setCacheEnabled(false);
  await page.setViewport({ width: 1440, height: 1000 });
  return { ctx, page };
}
async function appReady(page) {
  await page.waitForFunction(() => document.documentElement.classList.contains('app-ready'), { timeout: 15000 });
}
async function waitResults(page, n) {
  await page.waitForFunction((count) => document.querySelectorAll('[data-testid="result-item"]').length === count, { timeout: 20000 }, n);
}
async function shot(page, name) { await page.screenshot({ path: SHOTS + name }); console.log('SHOT ' + name); }

const MALICIOUS_PAYLOAD = {
  results: [
    {
      rerank_score: 2.5,
      title: '<img src=x onerror="window.__pwned=1">Injected title</img>',
      url: 'javascript:window.__pwned=2',
      snippet: '<svg onload="window.__pwned=3">snippet</svg>',
      summary: '<script>window.__pwned=4<\/script>summary',
      site_name: '<img src=x onerror="window.__pwned=5">Evil',
      site_icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" onload="window.__pwned=6"></svg>',
      date: '2026-10-01T00:00:00.000Z',
      authority: 4
    },
    {
      rerank_score: 1.2,
      title: 'Safe https result',
      url: 'https://example.com/safe',
      snippet: '<b>bold?</b> escaped snippet',
      summary: '<p>hello</p>',
      site_name: 'Safe Site',
      site_icon: 'data:text/html,<script>window.__pwned=7<\/script>',
      date: '2026-10-01T00:00:00.000Z',
      authority: 2
    }
  ],
  query: 'xss via interception',
  mock: false
};

async function inspectDom(page) {
  return page.evaluate(() => {
    const list = document.querySelector('[data-testid="results"]');
    const anchors = [...list.querySelectorAll('a')].map((a) => ({ href: a.getAttribute('href'), target: a.getAttribute('target'), rel: a.getAttribute('rel') }));
    const badScheme = [...document.querySelectorAll('[data-testid="results"] *')].filter((el) => {
      const href = el.getAttribute && (el.getAttribute('href') || '');
      const src = el.getAttribute && (el.getAttribute('src') || '');
      return /^javascript:/i.test(href) || /^data:/i.test(src) || /^data:/i.test(href);
    }).map((el) => el.tagName + ':' + (el.getAttribute('href') || el.getAttribute('src')));
    const injected = [...list.querySelectorAll('img, script, iframe, object, embed, link, style, svg:not(.icon)')]
      .filter((el) => !(el.tagName.toLowerCase() === 'svg' && el.classList.contains('icon'))).length;
    const inlineHandlers = [...list.querySelectorAll('*')]
      .filter((el) => [...el.attributes].some((a) => /^on/i.test(a.name))).length;
    const siteName = list.querySelector('.site-name');
    const title = list.querySelector('.result-title');
    return {
      inlineHandlers,
      pwned: typeof window.__pwned === 'undefined' ? null : window.__pwned,
      anchors,
      badScheme,
      injectedElements: injected,
      siteNameText: siteName ? siteName.textContent : null,
      siteNameHtml: siteName ? siteName.innerHTML : null,
      titleText: title ? title.textContent : null,
      titleHtml: title ? title.innerHTML : null,
      cards: list.querySelectorAll('[data-testid="result-item"]').length,
      bodyHasOnError: /onerror/i.test(list.innerHTML) && list.querySelector('img') !== null
    };
  });
}

async function main() {
  await fs.mkdir(SHOTS, { recursive: true });
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true,
    args: ['--no-sandbox', '--disable-gpu', '--lang=en-US', '--disable-dev-shm-usage'] });

  /* ---------------- I1-I3: live proxy malicious payload ---------------- */
  try {
    const { ctx, page } = await newPage(browser);
    const requests = [];
    const consoleErrors = [];
    page.on('request', (r) => requests.push(r.url()));
    page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
    const response = await page.goto(LIVE + '/?lang=en&theme=light&q=stub-badurls', { waitUntil: 'domcontentloaded' });
    const csp = response.headers()['content-security-policy'] || '';
    await appReady(page);
    await waitResults(page, 2);
    await sleep(700);
    const dom = await inspectDom(page);
    check('I1', 'server drops javascript: URL and sanitizes data: icon from live upstream',
      dom.cards === 2 && dom.badScheme.length === 0 && dom.pwned === null,
      JSON.stringify(dom));
    check('I2', 'live upstream: malicious item dropped, only safe results rendered, no injected content',
      dom.cards === 2 && dom.injectedElements === 0 && dom.inlineHandlers === 0 && dom.pwned === null
      && dom.titleText === 'Valid https result', JSON.stringify({ injected: dom.injectedElements,
        inlineHandlers: dom.inlineHandlers, siteNameText: dom.siteNameText, titleText: dom.titleText, pwned: dom.pwned }));
    check('I3', 'result links are http(s) only with rel=noopener noreferrer',
      dom.anchors.length >= 1 && dom.anchors.every((a) => /^https?:/i.test(a.href) && a.target === '_blank'
        && /noopener/.test(a.rel) && /noreferrer/.test(a.rel)), JSON.stringify(dom.anchors));
    check('I4', 'CSP present on document and restricts default/img/script/connect to self+data',
      /default-src 'self'/.test(csp) && /img-src 'self' data:/.test(csp) && /connect-src 'self'/.test(csp)
      && /frame-ancestors 'none'/.test(csp) && /base-uri 'none'/.test(csp), csp);
    const external = requests.filter((u) => !u.startsWith(LIVE) && !u.startsWith('data:'));
    check('I5', 'no external/third-party requests at all (no remote favicons)', external.length === 0,
      JSON.stringify(external));
    check('I6', 'no page/console errors from malicious payload', consoleErrors.length === 0,
      JSON.stringify(consoleErrors.slice(0, 5)));
    await shot(page, 'security-live-sanitized.png');
    await ctx.close();
  } catch (error) {
    check('I.ERR1', 'live security section completed without harness exception', false, String(error && error.stack || error));
  }

  /* ---------------- I7-I11: client-side injection via interception ---------------- */
  try {
    const { ctx, page } = await newPage(browser);
    const requests = [];
    const consoleErrors = [];
    page.on('request', (r) => requests.push(r.url()));
    page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      if (req.url().includes('/api/search')) {
        req.respond({ status: 200, contentType: 'application/json', body: JSON.stringify(MALICIOUS_PAYLOAD) });
        return;
      }
      req.continue();
    });
    await page.goto(MOCK + '/?lang=en&theme=light', { waitUntil: 'domcontentloaded' });
    await appReady(page);
    await page.click('[data-testid="search-input"]');
    await page.type('[data-testid="search-input"]', 'xss via interception');
    await page.keyboard.press('Enter');
    await waitResults(page, 2);
    await sleep(600);
    const dom = await inspectDom(page);
    check('I7', 'client-side payload: no script execution (window.__pwned undefined)', dom.pwned === null,
      'pwned=' + JSON.stringify(dom.pwned));
    check('I8', 'client-side payload: no img/script/inline-handler injected into results',
      dom.injectedElements === 0 && dom.inlineHandlers === 0,
      'injected=' + dom.injectedElements + ' inlineHandlers=' + dom.inlineHandlers + ' html=' + dom.siteNameHtml);
    check('I9', 'client-side payload: HTML chars escaped in title/site_name text',
      dom.titleText.includes('<img') && /&lt;img/.test(dom.titleHtml) && dom.siteNameHtml.includes('&lt;img'),
      JSON.stringify({ titleText: dom.titleText, titleHtml: dom.titleHtml && dom.titleHtml.slice(0, 140),
        siteNameHtml: dom.siteNameHtml && dom.siteNameHtml.slice(0, 140) }));
    check('I10', 'client-side payload: javascript: URL not clickable, only http(s) anchors',
      dom.badScheme.length === 0 && dom.anchors.every((a) => /^https?:/i.test(a.href)),
      JSON.stringify({ anchors: dom.anchors, badScheme: dom.badScheme }));
    check('I11', 'client-side payload: site_icon data URL not rendered as an image',
      await page.evaluate(() => document.querySelectorAll('[data-testid="results"] img').length === 0),
      'img count=' + await page.evaluate(() => document.querySelectorAll('[data-testid="results"] img').length));
    check('I12', 'no external requests during client-side injection flow',
      requests.filter((u) => !u.startsWith(MOCK) && !u.startsWith('data:')).length === 0,
      JSON.stringify(requests.filter((u) => !u.startsWith(MOCK) && !u.startsWith('data:'))));
    check('I13', 'no page/console errors during client-side injection flow', consoleErrors.length === 0,
      JSON.stringify(consoleErrors.slice(0, 5)));
    await shot(page, 'security-client-injection.png');
    await ctx.close();
  } catch (error) {
    check('I.ERR2', 'client security section completed without harness exception', false, String(error && error.stack || error));
  }

  await browser.close();
  const passed = results.filter((r) => r.pass).length;
  const failed = results.filter((r) => !r.pass);
  console.log('\nSECURITY SUMMARY: ' + passed + ' pass / ' + failed.length + ' fail / ' + results.length + ' total');
  if (failed.length) console.log('FAILED: ' + failed.map((f) => f.id).join(', '));
  await fs.writeFile(new URL('./browser-security-results.json', import.meta.url), JSON.stringify({ generatedAt: new Date().toISOString(), results }, null, 2));
}
main().catch((e) => { console.error('HARNESS ERROR', e); process.exitCode = 1; });
