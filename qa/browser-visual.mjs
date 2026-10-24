/*
 * QA visual / responsive / accessibility / performance suite (G, H, K).
 * Also measures the help popover at 1440x900 and 390x844 (Lead request).
 */
import { createRequire } from 'node:module';
import fs from 'node:fs/promises';

const require = createRequire(import.meta.url);
const puppeteer = require('/tmp/ds-qa/node_modules/puppeteer-core');
const APP = 'http://127.0.0.1:4321';
const SHOTS = new URL('./screenshots/', import.meta.url).pathname;
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
function check(id, name, pass, detail = '') {
  results.push({ id, name, pass: !!pass, detail: String(detail).slice(0, 1500) });
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
async function waitResults(page, n = 8) {
  await page.waitForFunction((count) => document.querySelectorAll('[data-testid="result-item"]').length === count, { timeout: 20000 }, n);
}
async function shot(page, name) {
  await page.screenshot({ path: SHOTS + name });
  console.log('SHOT ' + name);
}
const QUERY = 'DeepSeek V4';
const SAMPLE_SELECTORS = ['.hero-title', '.hero-sub', '.result-title a', '.result-snippet',
  '.result-date', '.footer-note', '.demo-badge', '.results-count'];

async function sampleContrast(page, sels) {
  return page.evaluate((selectors) => {
    function parseColor(v) {
      if (!v) return null;
      const m = v.match(/rgba?\(([^)]+)\)/);
      if (!m) return null;
      const p = m[1].split(/[ ,/]+/).map(Number);
      return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
    }
    function over(fg, bg) {
      return { r: fg.r * fg.a + bg.r * (1 - fg.a), g: fg.g * fg.a + bg.g * (1 - fg.a), b: fg.b * fg.a + bg.b * (1 - fg.a), a: 1 };
    }
    function effBg(el) {
      const chain = [];
      for (let n = el; n; n = n.parentElement) chain.unshift(n);
      let bg = { r: 255, g: 255, b: 255, a: 1 };
      for (const n of chain) {
        const c = parseColor(getComputedStyle(n).backgroundColor);
        if (c && c.a > 0) bg = over(c, bg);
      }
      return bg;
    }
    function lum(c) {
      const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
      return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
    }
    return selectors.map((sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const cs = getComputedStyle(el);
      const fg = parseColor(cs.color);
      const bg = effBg(el);
      const size = parseFloat(cs.fontSize);
      const weight = parseInt(cs.fontWeight, 10) || 400;
      const large = size >= 24 || (size >= 18.66 && weight >= 700);
      const l1 = lum(fg), l2 = lum(bg);
      return {
        sel,
        color: cs.color,
        bg: 'rgb(' + Math.round(bg.r) + ',' + Math.round(bg.g) + ',' + Math.round(bg.b) + ')',
        fontSize: size,
        fontWeight: weight,
        large,
        ratio: Math.round(((Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)) * 100) / 100,
        threshold: large ? 3 : 4.5
      };
    });
  }, sels);
}
function checkContrast(id, samples) {
  const failures = samples.filter((s) => s && s.ratio < s.threshold);
  check(id, 'text contrast meets WCAG AA at sampled UI surfaces', failures.length === 0,
    JSON.stringify(samples.map((s) => s && (s.sel + ':' + s.ratio + '/' + s.threshold + ' ' + s.fontSize + 'px'))));
  return samples;
}

async function main() {
  await fs.mkdir(SHOTS, { recursive: true });
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true,
    args: ['--no-sandbox', '--disable-gpu', '--lang=en-US', '--disable-dev-shm-usage'] });

  /* ============================ G1: desktop screenshots + layout ============================ */
  let helpDesktop = null;
  try {
    const { ctx, page } = await newPage(browser, { width: 1440, height: 1000 });
    await page.goto(APP + '/?lang=en&theme=light', { waitUntil: 'domcontentloaded' });
    await appReady(page);
    await sleep(400);
    await shot(page, '1440-light-empty.png');
    const layout = await page.evaluate(() => {
      const win = document.querySelector('.app-window').getBoundingClientRect();
      const bar = document.querySelector('.searchbar').getBoundingClientRect();
      const empty = document.getElementById('empty-state').getBoundingClientRect();
      return { win: { x: win.x, y: win.y, w: win.width, h: win.height }, bar: { w: bar.width, h: bar.height },
        empty: { w: empty.width, h: empty.height }, vw: innerWidth, vh: innerHeight,
        scrollWidth: document.documentElement.scrollWidth };
    });
    check('G1', '1440 empty layout: window centered, search usable, no overflow',
      layout.win.w <= 1120 && layout.win.h > 700 && layout.bar.w > 500 && layout.bar.h >= 50
      && layout.scrollWidth <= layout.vw + 1, JSON.stringify(layout));

    await page.click('[data-testid="search-input"]');
    await page.type('[data-testid="search-input"]', QUERY);
    await page.keyboard.press('Enter');
    await waitResults(page, 8);
    await sleep(600);
    await shot(page, '1440-light-results.png');
    const resultsLayout = await page.evaluate(() => {
      const cards = [...document.querySelectorAll('[data-testid="result-item"]')].map((c) => c.getBoundingClientRect());
      const main = document.querySelector('.app-main');
      return {
        cards: cards.length,
        minW: Math.min(...cards.map((c) => c.width)),
        maxW: Math.max(...cards.map((c) => c.width)),
        mainScrollW: main.scrollWidth, mainClientW: main.clientWidth,
        docScrollW: document.documentElement.scrollWidth, vw: innerWidth,
        cardTitleSize: getComputedStyle(document.querySelector('.result-title')).fontSize,
        snippetSize: getComputedStyle(document.querySelector('.result-snippet')).fontSize
      };
    });
    check('G2', '1440 results layout: 8 readable cards, no horizontal overflow',
      resultsLayout.cards === 8 && resultsLayout.minW > 500 && resultsLayout.docScrollW <= resultsLayout.vw + 1
      && resultsLayout.mainScrollW <= resultsLayout.mainClientW + 1
      && parseFloat(resultsLayout.cardTitleSize) >= 15 && parseFloat(resultsLayout.snippetSize) >= 13,
      JSON.stringify(resultsLayout));

    /* help popover at 1440x900 (Lead request) */
    await page.setViewport({ width: 1440, height: 900 });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await appReady(page);
    await waitResults(page, 8);
    await page.click('[data-testid="help-button"]');
    await sleep(350);
    await shot(page, '1440x900-help-popover.png');
    helpDesktop = await page.evaluate(() => {
      const pop = document.getElementById('help-popover');
      const r = pop.getBoundingClientRect();
      const main = document.querySelector('.app-main').getBoundingClientRect();
      const win = document.querySelector('.app-window').getBoundingClientRect();
      const setup = document.getElementById('setup-section');
      const sr = setup.getBoundingClientRect();
      const setupHeading = setup.querySelector('.popover-subhead');
      return {
        pop: { top: Math.round(r.top), bottom: Math.round(r.bottom), left: Math.round(r.left), right: Math.round(r.right), width: Math.round(r.width), height: Math.round(r.height) },
        viewport: { w: innerWidth, h: innerHeight },
        appMain: { top: Math.round(main.top), bottom: Math.round(main.bottom) },
        appWindow: { top: Math.round(win.top), bottom: Math.round(win.bottom) },
        scrollHeight: pop.scrollHeight, clientHeight: pop.clientHeight, scrollable: pop.scrollHeight > pop.clientHeight + 1,
        scrollTop: pop.scrollTop,
        setup: { top: Math.round(sr.top), bottom: Math.round(sr.bottom), height: Math.round(sr.height) },
        setupFullyVisible: sr.top >= r.top && sr.bottom <= r.bottom + 1,
        setupHeadingText: setupHeading ? setupHeading.textContent : '',
        helpTitle: document.getElementById('help-title').textContent,
        clippedByViewport: r.bottom > innerHeight + 1,
        clippedByWindow: r.bottom > win.bottom + 1,
        clippedByMain: r.bottom > main.bottom + 1,
        operatorsVisible: [...document.querySelectorAll('#operator-list .op-row')].filter((row) => {
          const rr = row.getBoundingClientRect();
          return rr.top >= r.top && rr.bottom <= r.bottom + 1;
        }).length
      };
    });
    check('G3', 'help popover shows all 8 operators at 1440x900 (no awkward clipping)',
      helpDesktop.operatorsVisible === 8, JSON.stringify(helpDesktop));
    check('G4', 'help popover does not clip below app window at 1440x900', !helpDesktop.clippedByViewport
      && !helpDesktop.clippedByWindow && !helpDesktop.clippedByMain, JSON.stringify({ pop: helpDesktop.pop,
        viewport: helpDesktop.viewport, appWindow: helpDesktop.appWindow, appMain: helpDesktop.appMain,
        clippedByViewport: helpDesktop.clippedByViewport, clippedByWindow: helpDesktop.clippedByWindow,
        clippedByMain: helpDesktop.clippedByMain }));
    check('G5', 'mock mode help popover still shows API setup section (content mismatch)',
      helpDesktop.setupHeadingText.length > 0, 'setupHeading=' + JSON.stringify(helpDesktop.setupHeadingText)
      + ' setupFullyVisible=' + helpDesktop.setupFullyVisible + ' popoverScrollable=' + helpDesktop.scrollable
      + ' scrollHeight=' + helpDesktop.scrollHeight + '/' + helpDesktop.clientHeight);
    await page.evaluate(() => { document.getElementById('help-popover').scrollTop = 9999; });
    await sleep(250);
    await shot(page, '1440x900-help-popover-scrolled.png');
    const afterScroll = await page.evaluate(() => {
      const pop = document.getElementById('help-popover');
      const setup = document.getElementById('setup-section').getBoundingClientRect();
      const r = pop.getBoundingClientRect();
      const docs = document.querySelector('.docs-link').getBoundingClientRect();
      return { scrollTop: pop.scrollTop, maxScroll: pop.scrollHeight - pop.clientHeight,
        setupBottom: Math.round(setup.bottom), popBottom: Math.round(r.bottom), docsBottom: Math.round(docs.bottom),
        docsVisible: docs.bottom <= r.bottom + 1, setupVisible: setup.bottom <= r.bottom + 1 };
    });
    check('G6', 'help popover scrolls internally to reveal setup section/docs', afterScroll.scrollTop > 0 && afterScroll.setupVisible,
      JSON.stringify(afterScroll));
    await page.keyboard.press('Escape');

    /* dark results */
    await page.setViewport({ width: 1440, height: 1000 });
    await page.goto(APP + '/?lang=en&theme=dark&q=DeepSeek%20V4', { waitUntil: 'domcontentloaded' });
    await appReady(page);
    await waitResults(page, 8);
    await sleep(600);
    await shot(page, '1440-dark-results.png');
    const darkLayout = await page.evaluate(() => ({
      theme: document.documentElement.getAttribute('data-theme'),
      docScrollW: document.documentElement.scrollWidth, vw: innerWidth,
      cards: document.querySelectorAll('[data-testid="result-item"]').length
    }));
    check('G7', '1440 dark results rendered without overflow', darkLayout.theme === 'dark' && darkLayout.cards === 8
      && darkLayout.docScrollW <= darkLayout.vw + 1, JSON.stringify(darkLayout));

    /* 1024x768 */
    await page.setViewport({ width: 1024, height: 768 });
    await page.goto(APP + '/?lang=en&theme=light&q=DeepSeek%20V4', { waitUntil: 'domcontentloaded' });
    await appReady(page);
    await waitResults(page, 8);
    await sleep(500);
    await shot(page, '1024-light-results.png');
    const tablet = await page.evaluate(() => {
      const win = document.querySelector('.app-window').getBoundingClientRect();
      const bar = document.querySelector('.searchbar').getBoundingClientRect();
      const cards = [...document.querySelectorAll('[data-testid="result-item"]')].map((c) => c.getBoundingClientRect());
      return { win: { x: Math.round(win.x), y: Math.round(win.y), w: Math.round(win.width), h: Math.round(win.height), bottom: Math.round(win.bottom) },
        bar: { w: Math.round(bar.width) }, minCardW: Math.round(Math.min(...cards.map((c) => c.width))),
        docScrollW: document.documentElement.scrollWidth, vw: innerWidth, vh: innerHeight,
        horizontalOverflow: document.documentElement.scrollWidth > innerWidth + 1 };
    });
    check('G8', '1024x768 layout valid (no overflow, usable search, cards fit)', !tablet.horizontalOverflow
      && tablet.win.w <= 1024 && tablet.bar.w > 400 && tablet.minCardW > 500 && tablet.win.bottom <= tablet.vh + 1,
      JSON.stringify(tablet));
    await ctx.close();
  } catch (error) {
    check('G1.ERR', 'desktop visual section completed without harness exception', false, String(error && error.stack || error));
  }

  /* ============================ G2: mobile 390x844 ============================ */
  let helpMobile = null;
  try {
    const { ctx, page } = await newPage(browser, { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    await page.goto(APP + '/?lang=en&theme=light', { waitUntil: 'domcontentloaded' });
    await appReady(page);
    await sleep(400);
    await page.click('[data-testid="search-input"]');
    await page.type('[data-testid="search-input"]', QUERY);
    await page.keyboard.press('Enter');
    await waitResults(page, 8);
    await sleep(500);
    await page.evaluate(() => { document.querySelector('#results-region').scrollIntoView({ block: 'start' }); });
    await sleep(400);
    await shot(page, '390-light-results.png');

    const mobile = await page.evaluate(() => {
      const r = (sel) => { const el = document.querySelector(sel); if (!el) return null; const b = el.getBoundingClientRect(); return { w: Math.round(b.width), h: Math.round(b.height), x: Math.round(b.x), y: Math.round(b.y) }; };
      const footer = document.querySelector('.app-footer').getBoundingClientRect();
      const interactives = [...document.querySelectorAll('button, a, input, select')].filter((el) => {
        const b = el.getBoundingClientRect();
        return b.width > 0 && b.height > 0 && getComputedStyle(el).visibility !== 'hidden';
      }).map((el) => {
        const b = el.getBoundingClientRect();
        const mainEl = document.querySelector('.app-main');
        const visibleTop = Math.max(b.top, mainEl.getBoundingClientRect().top);
        const visibleBottom = Math.min(b.bottom, mainEl.getBoundingClientRect().bottom);
        return { tag: el.tagName, id: el.id || el.className, top: Math.round(b.top), bottom: Math.round(b.bottom),
          visibleTop: Math.round(visibleTop), visibleBottom: Math.round(visibleBottom) };
      });
      const overlapFooter = interactives.filter((el) => el.visibleTop < footer.bottom - 1 && el.visibleBottom > footer.top + 1);
      const main = document.querySelector('.app-main');
      const cardTitle = getComputedStyle(document.querySelector('.result-title'));
      const snippet = getComputedStyle(document.querySelector('.result-snippet'));
      const cards = [...document.querySelectorAll('[data-testid="result-item"]')].map((c) => c.getBoundingClientRect());
      return {
        vw: innerWidth, vh: innerHeight,
        docScrollW: document.documentElement.scrollWidth,
        submit: r('[data-testid="search-submit"]'), theme: r('[data-testid="theme-toggle"]'),
        lang: r('[data-testid="lang-select"]'), help: r('[data-testid="help-button"]'),
        search: r('[data-testid="search-input"]'),
        footer: { top: Math.round(footer.top), bottom: Math.round(footer.bottom) },
        overlapFooter: overlapFooter.slice(0, 8),
        mainScrollW: main.scrollWidth, mainClientW: main.clientWidth,
        cardMinW: Math.round(Math.min(...cards.map((c) => c.width))),
        cardTitleSize: cardTitle.fontSize, cardTitleLineHeight: cardTitle.lineHeight,
        snippetSize: snippet.fontSize,
        lastCardBottom: Math.round(Math.max(...cards.map((c) => c.bottom)))
      };
    });
    check('G9', '390x844: no horizontal overflow, search field + cards fit', mobile.docScrollW <= mobile.vw + 1
      && mobile.mainScrollW <= mobile.mainClientW + 1 && mobile.search.w > 200 && mobile.cardMinW >= 280,
      JSON.stringify(mobile));
    check('G10', 'mobile hit areas >= 40px (submit/theme/lang)',
      mobile.submit && mobile.submit.h >= 40 && mobile.theme.h >= 40 && mobile.lang.h >= 40,
      JSON.stringify({ submit: mobile.submit, theme: mobile.theme, lang: mobile.lang }));
    check('G11', 'footer does not cover interactive content on mobile', mobile.overlapFooter.length === 0,
      JSON.stringify(mobile.overlapFooter));
    check('G12', 'mobile cards readable (font sizes)', parseFloat(mobile.cardTitleSize) >= 15
      && parseFloat(mobile.snippetSize) >= 13, JSON.stringify({ title: mobile.cardTitleSize, snippet: mobile.snippetSize }));

    /* mobile help popover (Lead request) */
    await page.evaluate(() => { document.querySelector('.app-main').scrollTop = 0; });
    await sleep(300);
    await page.click('[data-testid="help-button"]');
    await sleep(350);
    await shot(page, '390-help-popover.png');
    helpMobile = await page.evaluate(() => {
      const pop = document.getElementById('help-popover');
      const r = pop.getBoundingClientRect();
      const win = document.querySelector('.app-window').getBoundingClientRect();
      const main = document.querySelector('.app-main').getBoundingClientRect();
      const setup = document.getElementById('setup-section').getBoundingClientRect();
      return {
        pop: { top: Math.round(r.top), bottom: Math.round(r.bottom), left: Math.round(r.left), right: Math.round(r.right), width: Math.round(r.width), height: Math.round(r.height) },
        viewport: { w: innerWidth, h: innerHeight },
        appMain: { top: Math.round(main.top), bottom: Math.round(main.bottom) },
        appWindow: { top: Math.round(win.top), bottom: Math.round(win.bottom) },
        scrollHeight: pop.scrollHeight, clientHeight: pop.clientHeight, scrollable: pop.scrollHeight > pop.clientHeight + 1,
        setup: { top: Math.round(setup.top), bottom: Math.round(setup.bottom) },
        setupFullyVisible: setup.top >= r.top && setup.bottom <= r.bottom + 1,
        clippedByViewport: r.bottom > innerHeight + 1,
        clippedByWindow: r.bottom > win.bottom + 1,
        clippedByMain: r.bottom > main.bottom + 1,
        operatorsVisible: [...document.querySelectorAll('#operator-list .op-row')].filter((row) => {
          const rr = row.getBoundingClientRect();
          return rr.top >= r.top && rr.bottom <= r.bottom + 1;
        }).length
      };
    });
    check('G13', 'mobile help popover opens inside app window at 390x844',
      helpMobile.operatorsVisible >= 4 && !helpMobile.clippedByViewport && !helpMobile.clippedByWindow
      && !helpMobile.clippedByMain, JSON.stringify(helpMobile));
    check('G14', 'mobile help popover setup section requires inner scroll in mock mode',
      helpMobile.scrollable === true, 'setupFullyVisible=' + helpMobile.setupFullyVisible + ' scrollable=' + helpMobile.scrollable
      + ' setup=' + JSON.stringify(helpMobile.setup) + ' popBottom=' + helpMobile.pop.bottom
      + ' appWindowBottom=' + helpMobile.appWindow.bottom);
    await page.evaluate(() => { document.getElementById('help-popover').scrollTop = 9999; });
    await sleep(250);
    await shot(page, '390-help-popover-scrolled.png');
    await page.keyboard.press('Escape');

    /* mobile dark results */
    await page.goto(APP + '/?lang=en&theme=dark&q=DeepSeek%20V4', { waitUntil: 'domcontentloaded' });
    await appReady(page);
    await waitResults(page, 8);
    await sleep(500);
    await page.evaluate(() => { document.querySelector('#results-region').scrollIntoView({ block: 'start' }); });
    await sleep(400);
    await shot(page, '390-dark-results.png');
    const mobileDark = await page.evaluate(() => ({
      theme: document.documentElement.getAttribute('data-theme'),
      scrollW: document.documentElement.scrollWidth, vw: innerWidth,
      cards: document.querySelectorAll('[data-testid="result-item"]').length
    }));
    check('G15', '390x844 dark results rendered without overflow',
      mobileDark.theme === 'dark' && mobileDark.cards === 8 && mobileDark.scrollW <= mobileDark.vw + 1, JSON.stringify(mobileDark));
    await ctx.close();
  } catch (error) {
    check('G2.ERR', 'mobile visual section completed without harness exception', false, String(error && error.stack || error));
  }

  /* ============================ H: accessibility ============================ */
  try {
    const { ctx, page } = await newPage(browser, { width: 1440, height: 1000 });
    await page.goto(APP + '/?lang=en&theme=light&q=DeepSeek%20V4', { waitUntil: 'domcontentloaded' });
    await appReady(page);
    await waitResults(page, 8);
    await sleep(300);

    const labels = await page.evaluate(() => {
      const a = (sel) => { const el = document.querySelector(sel); return el ? (el.getAttribute('aria-label') || '').trim() : null; };
      return {
        input: a('[data-testid="search-input"]'),
        inputPlaceholder: document.querySelector('[data-testid="search-input"]').placeholder,
        select: a('[data-testid="lang-select"]'),
        theme: a('[data-testid="theme-toggle"]'),
        clear: a('[data-testid="search-clear"]'),
        help: a('[data-testid="help-button"]'),
        helpClose: a('#help-close'),
        noticeClose: a('#notice-close'),
        retryText: document.getElementById('retry-button').textContent.trim(),
        resultLinkName: document.querySelector('[data-testid="result-item"] .result-title a').textContent.trim(),
        copyName: a('[data-testid="result-item"] .copy-btn'),
        footerHint: document.getElementById('footer-hint').textContent
      };
    });
    check('H1', 'accessible names for input/select/theme/clear/help/copy/retry',
      ['input', 'select', 'theme', 'clear', 'help', 'helpClose', 'noticeClose', 'resultLinkName', 'copyName'].every((k) => labels[k] && labels[k].length > 0)
      && labels.inputPlaceholder.length > 0 && labels.retryText.length > 0, JSON.stringify(labels));

    const headings = await page.evaluate(() => [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')]
      .filter((h) => h.getClientRects().length > 0 && getComputedStyle(h).visibility !== 'hidden')
      .map((h) => ({ tag: h.tagName, text: h.textContent.trim().slice(0, 50) })));
    const levels = headings.map((h) => Number(h.tag.slice(1)));
    const firstH1 = levels.length > 0 && levels[0] === 1;
    const skips = [];
    for (let i = 1; i < levels.length; i += 1) if (levels[i] - levels[i - 1] > 1) skips.push([headings[i - 1], headings[i]]);
    check('H2', 'heading order starts at h1 and does not skip levels', firstH1 && skips.length === 0,
      JSON.stringify({ headings, skips }));

    const live = await page.evaluate(() => ({
      liveStatus: { role: document.getElementById('live-status').getAttribute('role'), ariaLive: document.getElementById('live-status').getAttribute('aria-live') },
      resultsCount: { ariaLive: document.getElementById('results-count').getAttribute('aria-live') },
      errorAlert: { role: document.getElementById('error-state').getAttribute('role') },
      resultsRegion: { busy: document.getElementById('results-region').getAttribute('aria-busy'), label: document.getElementById('results-region').getAttribute('aria-label'), tabindex: document.getElementById('results-region').getAttribute('tabindex') },
      helpDialog: { role: document.getElementById('help-popover').getAttribute('role'), tabindex: document.getElementById('help-popover').getAttribute('tabindex'), labelledby: document.getElementById('help-popover').getAttribute('aria-labelledby') }
    }));
    check('H3', 'aria-live status, alert, labelled results region, dialog semantics',
      live.liveStatus.role === 'status' && live.liveStatus.ariaLive === 'polite' && live.resultsCount.ariaLive === 'polite'
      && live.errorAlert.role === 'alert' && live.resultsRegion.busy === 'false' && live.resultsRegion.label
      && live.resultsRegion.tabindex === '-1' && live.helpDialog.role === 'dialog'
      && live.helpDialog.tabindex === '-1' && live.helpDialog.labelledby === 'help-title', JSON.stringify(live));

    /* tab order + focus-visible + skip link */
    await page.goto(APP + '/?lang=en&theme=light', { waitUntil: 'domcontentloaded' });
    await appReady(page);
    await sleep(250);
    await page.evaluate(() => { document.body.setAttribute('tabindex', '-1'); document.body.focus(); document.body.removeAttribute('tabindex'); });
    const tabs = [];
    for (let i = 0; i < 12; i += 1) {
      await page.keyboard.press('Tab');
      await sleep(80);
      tabs.push(await page.evaluate(() => {
        const el = document.activeElement;
        const cs = el ? getComputedStyle(el) : null;
        return {
          tag: el ? el.tagName : '',
          id: el ? el.id : '',
          className: el ? (el.className || '') : '',
          testid: el ? el.getAttribute('data-testid') : '',
          text: el ? (el.textContent || '').trim().slice(0, 30) : '',
          href: el && el.getAttribute ? (el.getAttribute('href') || '') : '',
          focusVisible: el ? el.matches(':focus-visible') : false,
          outline: cs ? cs.outlineStyle + ' ' + cs.outlineWidth : '',
          boxShadow: cs ? cs.boxShadow.slice(0, 80) : ''
        };
      }));
    }
    check('H4', 'skip link is first tab stop', tabs[0] && tabs[0].tag === 'A'
      && /skip/i.test(tabs[0].className) && tabs[0].href === '#results-region',
      JSON.stringify(tabs.slice(0, 3)));
    const orderIds = tabs.map((t) => t.id || t.testid || t.tag);
    check('H5', 'tab order reaches language, theme, search, submit, help',
      orderIds.includes('lang-select') && orderIds.includes('theme-toggle') && orderIds.includes('search-input')
      && orderIds.includes('search-submit') && orderIds.includes('help-button'), JSON.stringify(orderIds));
    const focusRings = tabs.filter((t) => t.focusVisible && (t.outline !== 'none 0px' || (t.boxShadow && t.boxShadow !== 'none')));
    check('H6', 'keyboard focus is visible (:focus-visible + outline/box-shadow)',
      focusRings.length >= 4, JSON.stringify(tabs.map((t) => ({ id: t.id || t.testid, fv: t.focusVisible, outline: t.outline, shadow: t.boxShadow.slice(0, 40) }))));

    /* skip link activation */
    await page.evaluate(() => { document.body.setAttribute('tabindex', '-1'); document.body.focus(); document.body.removeAttribute('tabindex'); });
    await page.keyboard.press('Tab');
    const skipRect = await page.evaluate(() => { const el = document.querySelector('.skip-link'); const r = el.getBoundingClientRect(); return { w: r.width, h: r.height, href: el.getAttribute('href') }; });
    await page.keyboard.press('Enter');
    await sleep(300);
    const skipResult = await page.evaluate(() => ({ activeId: document.activeElement.id, activeClass: document.activeElement.className, scrollTop: document.querySelector('.app-main').scrollTop }));
    check('H7', 'skip link visible on focus and moves focus to results region',
      skipRect.w > 20 && skipRect.h > 10 && skipRect.href === '#results-region' && skipResult.activeId === 'results-region',
      JSON.stringify({ skipRect, skipResult }));

    /* prefers-reduced-motion */
    await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await appReady(page);
    await sleep(300);
    const motion = await page.evaluate(() => {
      const probe = (sel) => {
        const el = document.querySelector(sel);
        if (!el) return null;
        const cs = getComputedStyle(el);
        return { animationDuration: cs.animationDuration, transitionDuration: cs.transitionDuration };
      };
      return {
        reduceMatches: matchMedia('(prefers-reduced-motion: reduce)').matches,
        body: probe('body'), window: probe('.app-window'), card: probe('.result-card') || probe('.skeleton-card'),
        skeleton: probe('.sk'), help: probe('.help-popover')
      };
    });
    const anyMotion = [motion.body, motion.window, motion.card, motion.skeleton].filter(Boolean)
      .some((p) => parseFloat(p.animationDuration) > 0.001 || parseFloat(p.transitionDuration) > 0.001);
    check('H8', 'prefers-reduced-motion disables animations/transitions', motion.reduceMatches === true && !anyMotion,
      JSON.stringify(motion) + ' (0.01ms = effectively none)');

    /* contrast spot checks, light then dark */
    await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'no-preference' }]);
    await page.goto(APP + '/?lang=en&theme=light&q=DeepSeek%20V4', { waitUntil: 'domcontentloaded' });
    await appReady(page);
    await waitResults(page, 8);
    await sleep(400);
    const lightSamples = await sampleContrast(page, SAMPLE_SELECTORS);
    checkContrast('H9', lightSamples);

    const lightAccent = await page.evaluate(() => {
      function hex(c) { c = c.replace('#', ''); return { r: parseInt(c.slice(0, 2), 16), g: parseInt(c.slice(2, 4), 16), b: parseInt(c.slice(4, 6), 16) }; }
      function lum(c) { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); }
      const bgStr = getComputedStyle(document.documentElement).getPropertyValue('--btn-accent-1').trim();
      const btn = document.querySelector('.submit-btn');
      const fg = { r: 255, g: 255, b: 255 };
      const bg = hex(bgStr);
      const ratio = Math.round(((Math.max(lum(fg), lum(bg)) + 0.05) / (Math.min(lum(fg), lum(bg)) + 0.05)) * 100) / 100;
      return { bg: bgStr, color: getComputedStyle(btn).color, fontSize: getComputedStyle(btn).fontSize, ratio };
    });
    check('H10', 'primary submit button contrast >= 4.5 (light)', lightAccent.ratio >= 4.5, JSON.stringify(lightAccent));

    await page.click('[data-testid="theme-toggle"]');
    await sleep(450);
    const darkSamples = await sampleContrast(page, SAMPLE_SELECTORS);
    checkContrast('H11', darkSamples);

    const darkAccent = await page.evaluate(() => {
      function hex(c) { c = c.replace('#', ''); return { r: parseInt(c.slice(0, 2), 16), g: parseInt(c.slice(2, 4), 16), b: parseInt(c.slice(4, 6), 16) }; }
      function lum(c) { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); }
      const bgStr = getComputedStyle(document.documentElement).getPropertyValue('--btn-accent-1').trim();
      const btn = document.querySelector('.submit-btn');
      const fg = { r: 255, g: 255, b: 255 };
      const bg = hex(bgStr);
      const ratio = Math.round(((Math.max(lum(fg), lum(bg)) + 0.05) / (Math.min(lum(fg), lum(bg)) + 0.05)) * 100) / 100;
      return { theme: document.documentElement.getAttribute('data-theme'), bg: bgStr, color: getComputedStyle(btn).color, ratio };
    });
    check('H12', 'primary submit button contrast >= 4.5 (dark)', darkAccent.ratio >= 4.5, JSON.stringify(darkAccent));
    await ctx.close();
  } catch (error) {
    check('H.ERR', 'accessibility section completed without harness exception', false, String(error && error.stack || error));
  }

  /* ============================ K: performance sanity ============================ */
  try {
    const { ctx, page } = await newPage(browser, { width: 1440, height: 1000 });
    const requests = [];
    page.on('request', (r) => requests.push({ url: r.url(), type: r.resourceType() }));
    await page.goto(APP + '/?lang=en&theme=light', { waitUntil: 'load' });
    await appReady(page);
    await sleep(700);
    const cold = await page.evaluate(() => {
      const nav = performance.getEntriesByType('navigation')[0];
      const res = performance.getEntriesByType('resource');
      return {
        domContentLoaded: Math.round(nav.domContentLoadedEventEnd),
        load: Math.round(nav.loadEventEnd),
        ttfb: Math.round(nav.responseStart),
        totalTransfer: res.reduce((s, r) => s + (r.transferSize || 0), 0),
        resources: res.map((r) => ({ name: r.name, type: r.initiatorType, ms: Math.round(r.duration) }))
      };
    });
    const external = cold.resources.filter((r) => !r.name.startsWith(APP));
    check('K1', 'cold load fast, few resources, no external resources',
      cold.load < 2500 && cold.resources.length <= 10 && external.length === 0,
      JSON.stringify({ timing: { domContentLoaded: cold.domContentLoaded, load: cold.load, ttfb: cold.ttfb }, count: cold.resources.length, external, resources: cold.resources }));

    await page.click('[data-testid="search-input"]');
    await page.type('[data-testid="search-input"]', QUERY);
    const searchStart = Date.now();
    await page.keyboard.press('Enter');
    await waitResults(page, 8);
    const searchMs = Date.now() - searchStart;
    const atResults = requests.length;
    await sleep(1600);
    const afterResults = requests.slice(atResults);
    const externalAfter = afterResults.filter((r) => !r.url.startsWith(APP));
    check('K2', 'search completes reasonably fast in demo mode', searchMs < 3000, 'search round-trip=' + searchMs + 'ms');
    check('K3', 'no remote favicon/external requests after results (network idle)', externalAfter.length === 0,
      JSON.stringify({ newRequests: afterResults.map((r) => r.url), externalAfter }));
    const inFlight = await page.evaluate(() => performance.getEntriesByType('resource').filter((r) => r.responseEnd === 0).length);
    check('K4', 'no hanging resource requests after results', inFlight === 0, 'inFlight=' + inFlight);
    const res = await page.goto(APP + '/?lang=en', { waitUntil: 'domcontentloaded' });
    const csp = res.headers()['content-security-policy'] || '';
    check('K5', 'CSP present and restricts img-src to self+data, no remote hosts',
      /img-src 'self' data:/.test(csp) && /default-src 'self'/.test(csp) && !/https?:/.test(csp), csp);
    await ctx.close();
  } catch (error) {
    check('K.ERR', 'performance section completed without harness exception', false, String(error && error.stack || error));
  }

  await browser.close();
  const passed = results.filter((r) => r.pass).length;
  const failed = results.filter((r) => !r.pass);
  console.log('\nVISUAL SUMMARY: ' + passed + ' pass / ' + failed.length + ' fail / ' + results.length + ' total');
  if (failed.length) console.log('FAILED: ' + failed.map((f) => f.id).join(', '));
  console.log('HELP DESKTOP: ' + JSON.stringify(helpDesktop));
  console.log('HELP MOBILE: ' + JSON.stringify(helpMobile));
  await fs.writeFile(new URL('./browser-visual-results.json', import.meta.url), JSON.stringify({ generatedAt: new Date().toISOString(), results, helpDesktop, helpMobile }, null, 2));
}
main().catch((e) => { console.error('HARNESS ERROR', e); process.exitCode = 1; });
