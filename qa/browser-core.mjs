/*
 * QA browser core suite: functional flows (C), URL/state (D), i18n completeness (F).
 * Run with mock server on http://127.0.0.1:4321.
 */
import { createRequire } from 'node:module';
import fs from 'node:fs/promises';

const require = createRequire(import.meta.url);
const puppeteer = require('/tmp/ds-qa/node_modules/puppeteer-core');
const APP = 'http://127.0.0.1:4321';
const SHOTS = new URL('./screenshots/', import.meta.url).pathname;
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const RUN_ID = String(Date.now()).slice(-7);
const QUERY = 'DeepSeek V4 qa' + RUN_ID;

const results = [];
const errors = { console: [], pageerror: [], requestfailed: [] };
function check(id, name, pass, detail = '') {
  results.push({ id, name, pass: !!pass, detail: String(detail).slice(0, 900) });
  console.log((pass ? 'PASS ' : 'FAIL ') + id + ' ' + name + (detail ? ' :: ' + String(detail).slice(0, 500) : ''));
}
function watch(page) {
  page.on('console', (m) => { if (m.type() === 'error') errors.console.push(m.text().slice(0, 300)); });
  page.on('pageerror', (e) => errors.pageerror.push(String(e).slice(0, 300)));
  page.on('requestfailed', (r) => errors.requestfailed.push((r.url() + ' :: ' + (r.failure() ? r.failure().errorText : '')).slice(0, 300)));
}
async function newPage(browser, viewport) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setCacheEnabled(false);
  if (viewport) await page.setViewport(viewport);
  watch(page);
  return { ctx, page };
}
async function visible(page, selector) {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return false;
    if (el.hidden) return false;
    const cs = getComputedStyle(el);
    return cs.display !== 'none' && cs.visibility !== 'hidden' && el.getClientRects().length > 0;
  }, selector);
}
async function appReady(page) {
  await page.waitForFunction(() => document.documentElement.classList.contains('app-ready'), { timeout: 15000 });
}
async function waitResults(page, n = 8) {
  await page.waitForFunction((count) => document.querySelectorAll('[data-testid="result-item"]').length === count,
    { timeout: 20000 }, n);
}
async function currentState(page) {
  return page.evaluate(() => ({
    htmlLang: document.documentElement.lang,
    theme: document.documentElement.getAttribute('data-theme'),
    title: document.title,
    url: location.href,
    storageTheme: (() => { try { return localStorage.getItem('ds-theme'); } catch { return null; } })(),
    storageLang: (() => { try { return localStorage.getItem('ds-lang'); } catch { return null; } })(),
    emptyVisible: !document.querySelector('[data-testid="empty-state"]').hidden,
    loadingVisible: !document.querySelector('[data-testid="loading"]').hidden,
    resultsVisible: !document.querySelector('[data-testid="results"]').hidden,
    noResultsVisible: !document.querySelector('[data-testid="no-results"]').hidden,
    errorVisible: !document.querySelector('[data-testid="error-state"]').hidden,
    noticeVisible: !document.querySelector('[data-testid="api-notice"]').hidden,
    resultCount: document.querySelectorAll('[data-testid="result-item"]').length,
    inputValue: document.querySelector('[data-testid="search-input"]').value,
    suggestions: document.querySelectorAll('[data-testid="suggestions"] .suggestion').length,
    demoVisible: !document.querySelector('[data-testid="demo-badge"]').hidden,
    resultsCountText: document.querySelector('[data-testid="results-count"]').textContent,
    resultsQueryText: document.querySelector('#results-query').textContent,
    resultsHeadVisible: !document.querySelector('#results-head').hidden
  }));
}
const TESTIDS = ['search-input', 'search-submit', 'search-clear', 'theme-toggle', 'lang-select', 'results',
  'result-item', 'loading', 'error-state', 'empty-state', 'no-results', 'api-notice', 'help-button',
  'help-popover', 'suggestions', 'results-count', 'demo-badge'];

async function main() {
  await fs.mkdir(SHOTS, { recursive: true });
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    args: ['--no-sandbox', '--disable-gpu', '--lang=en-US', '--disable-dev-shm-usage']
  });

  /* ============================ C. Functional flows ============================ */
  const { ctx, page } = await newPage(browser, { width: 1440, height: 1000 });
  try {
    await ctx.overridePermissions(APP, ['clipboard-read', 'clipboard-write']);
    await page.goto(APP + '/?lang=en', { waitUntil: 'domcontentloaded' });
    await appReady(page);
    await sleep(350);

    let st = await currentState(page);
    check('C1', 'pristine empty state, 4 suggestions, demo badge, no notice',
      st.emptyVisible && st.suggestions === 4 && st.demoVisible && !st.noticeVisible && !st.loadingVisible
      && !st.resultsVisible && !st.errorVisible && ['light', 'dark'].includes(st.theme) && st.htmlLang === 'en',
      JSON.stringify(st) + ' (theme follows OS: ' + st.theme + ')');

    const missing = await page.evaluate((ids) => ids.filter((id) => !document.querySelector('[data-testid="' + id + '"]')), TESTIDS.filter((id) => id !== 'result-item'));
    check('C2', 'all expected static data-testid hooks present', missing.length === 0, 'missing=' + JSON.stringify(missing));
    const resultItemAfter = await page.evaluate(() => document.querySelectorAll('[data-testid="result-item"]').length);
    check('C2b', 'result-item testid only appears with results', resultItemAfter === 0, 'initial result-item count=' + resultItemAfter);

    const footerHint = await page.evaluate(() => document.querySelector('#footer-hint').textContent);
    check('C3', 'footer shows keyboard hint', /⌘K|Ctrl K/.test(footerHint), footerHint);

    /* Search via Enter -> loading -> results */
    await page.click('[data-testid="search-input"]');
    await page.type('[data-testid="search-input"]', QUERY, { delay: 5 });
    const clearShown = await visible(page, '[data-testid="search-clear"]');
    await page.keyboard.press('Enter');
    const loadingShotVisible = await page.waitForFunction(
      () => !document.querySelector('[data-testid="loading"]').hidden, { timeout: 600 }
    ).then(() => true).catch(() => false);
    check('C4', 'clear button appears when typing', clearShown, 'clear visible=' + clearShown);
    check('C5', 'loading skeleton visible right after Enter', loadingShotVisible, 'loadingVisible=' + loadingShotVisible + ' query=' + QUERY);
    await waitResults(page, 8);
    st = await currentState(page);
    check('C6', '8 result cards rendered', st.resultCount === 8 && st.resultsVisible, 'count=' + st.resultCount);
    check('C7', 'results header + count + query shown',
      st.resultsHeadVisible && /\b8\b/.test(st.resultsCountText) && st.resultsQueryText.includes(QUERY),
      JSON.stringify({ count: st.resultsCountText, query: st.resultsQueryText, head: st.resultsHeadVisible }));
    const urlAfter = await page.evaluate(() => ({ q: new URLSearchParams(location.search).get('q'), search: location.search }));
    check('C8', 'query synced into URL', urlAfter.q === QUERY, JSON.stringify({ expected: QUERY, seen: urlAfter.q }));

    const links = await page.evaluate(() => [...document.querySelectorAll('[data-testid="result-item"] .result-title a')]
      .map((a) => ({ target: a.target, rel: a.rel, href: a.href, text: a.textContent })));
    const linksOk = links.length === 8 && links.every((l) => l.target === '_blank'
      && /noopener/.test(l.rel) && /noreferrer/.test(l.rel) && /^https?:\/\//.test(l.href));
    check('C9', 'result links target=_blank rel=noopener noreferrer, http(s)', linksOk,
      'links=' + JSON.stringify(links.slice(0, 2)));

    const monograms = await page.evaluate(() => [...document.querySelectorAll('[data-testid="result-item"] .favicon-fallback')]
      .map((el) => el.textContent));
    const noRemoteImages = await page.evaluate(() => document.querySelectorAll('[data-testid="result-item"] img').length === 0);
    check('C10', 'monogram favicon tiles only, no img in results',
      monograms.length === 8 && monograms.every((m) => m.length >= 1) && noRemoteImages,
      'monograms=' + JSON.stringify(monograms) + ' imgs=' + !noRemoteImages);

    /* expand / collapse summary */
    const moreBtn = await page.$('[data-testid="result-item"] .more-btn');
    const summaryBefore = await page.evaluate(() => {
      const s = document.querySelector('[data-testid="result-item"] .result-summary');
      return s ? s.hidden : null;
    });
    if (moreBtn) {
      await moreBtn.click();
      await sleep(120);
    }
    const expanded = await page.evaluate(() => {
      const card = document.querySelector('[data-testid="result-item"]');
      return { hidden: card.querySelector('.result-summary').hidden, aria: card.querySelector('.more-btn').getAttribute('aria-expanded'),
        label: card.querySelector('.more-label').textContent };
    });
    if (moreBtn) { await moreBtn.click(); await sleep(120); }
    const collapsed = await page.evaluate(() => {
      const card = document.querySelector('[data-testid="result-item"]');
      return { hidden: card.querySelector('.result-summary').hidden, aria: card.querySelector('.more-btn').getAttribute('aria-expanded') };
    });
    check('C11', 'summary expands and collapses', summaryBefore === true && expanded.hidden === false
      && expanded.aria === 'true' && expanded.label === 'Less' && collapsed.hidden === true && collapsed.aria === 'false',
      JSON.stringify({ summaryBefore, expanded, collapsed }));

    /* copy link + feedback */
    await page.click('[data-testid="result-item"] .copy-btn');
    await sleep(300);
    const copyState = await page.evaluate(() => ({
      label: document.querySelector('[data-testid="result-item"] .copy-label').textContent,
      copiedClass: document.querySelector('[data-testid="result-item"] .copy-btn').classList.contains('copied'),
      live: document.getElementById('live-status').textContent
    }));
    let clipText = '';
    try { clipText = await page.evaluate(() => navigator.clipboard.readText()); } catch (e) { clipText = 'ERR:' + e.message; }
    const firstHref = links[0].href;
    check('C12', 'copy-link gives visible feedback', copyState.label === 'Copied' && copyState.copiedClass,
      JSON.stringify(copyState) + ' clipboard=' + clipText + ' expected=' + firstHref);
    check('C13', 'clipboard receives result URL', clipText === firstHref, 'clipboard=' + clipText + ' expected=' + firstHref);

    /* clear returns pristine */
    await page.click('[data-testid="search-clear"]');
    await sleep(150);
    st = await currentState(page);
    const clearUrl = await page.evaluate(() => new URLSearchParams(location.search).get('q'));
    check('C14', 'clear button returns pristine state and removes q', st.emptyVisible && st.inputValue === ''
      && !st.resultsVisible && clearUrl === null && !st.loadingVisible,
      JSON.stringify({ emptyVisible: st.emptyVisible, resultsVisible: st.resultsVisible, input: st.inputValue,
        staleHiddenCards: st.resultCount, clearUrl }));

    /* operator chips insert at caret */
    await page.click('[data-testid="search-input"]');
    await page.type('[data-testid="search-input"]', 'DeepSeek ', { delay: 10 });
    await page.evaluate(() => {
      const el = document.querySelector('[data-testid="search-input"]');
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
    });
    await page.click('[data-op="site"]');
    await sleep(80);
    const opState = await page.evaluate(() => {
      const el = document.querySelector('[data-testid="search-input"]');
      return { value: el.value, caret: el.selectionStart, focused: document.activeElement === el };
    });
    check('C15', 'operator chip inserts syntax at caret', opState.value === 'DeepSeek site:'
      && opState.caret === opState.value.length && opState.focused, JSON.stringify(opState));
    await page.click('[data-testid="search-clear"]');
    await sleep(100);

    /* help popover */
    await page.click('[data-testid="help-button"]');
    await sleep(150);
    const helpState = await page.evaluate(() => {
      const pop = document.getElementById('help-popover');
      const active = document.activeElement;
      return {
        visible: !pop.hidden,
        expanded: document.getElementById('help-button').getAttribute('aria-expanded'),
        opRows: document.querySelectorAll('#operator-list .op-row').length,
        focusInPopover: pop.contains(active),
        activeId: active && (active.id || active.tagName),
        title: document.querySelector('#help-title').textContent,
        setupVisible: !document.getElementById('setup-section').hidden
      };
    });
    check('C16', 'help popover opens with 8 operators, focus moves inside', helpState.visible
      && helpState.expanded === 'true' && helpState.opRows === 8 && helpState.focusInPopover,
      JSON.stringify(helpState));
    check('C17', 'help popover has setup section in mock mode (not expected for demo)', true,
      'setupVisible=' + helpState.setupVisible + ' (informational; see visual review)');
    await page.screenshot({ path: SHOTS + 'help-popover-1440x1000-light.png' });
    await page.keyboard.press('Escape');
    await sleep(150);
    const helpClosed = await page.evaluate(() => ({
      hidden: document.getElementById('help-popover').hidden,
      expanded: document.getElementById('help-button').getAttribute('aria-expanded'),
      activeId: document.activeElement && document.activeElement.id
    }));
    check('C18', 'Escape closes help and returns focus to help button', helpClosed.hidden
      && helpClosed.expanded === 'false' && helpClosed.activeId === 'help-button', JSON.stringify(helpClosed));

    /* theme toggle + persistence */
    const beforeToggle = await currentState(page);
    await page.click('[data-testid="theme-toggle"]');
    await sleep(120);
    let themeState = await currentState(page);
    const expectedTheme = beforeToggle.theme === 'dark' ? 'light' : 'dark';
    check('C19', 'theme toggle switches theme and persists to localStorage',
      themeState.theme === expectedTheme && themeState.storageTheme === expectedTheme,
      JSON.stringify({ before: beforeToggle.theme, after: themeState.theme, storage: themeState.storageTheme }));
    await page.reload({ waitUntil: 'domcontentloaded' });
    await appReady(page);
    await sleep(250);
    themeState = await currentState(page);
    check('C20', 'theme persists across reload', themeState.theme === expectedTheme,
      JSON.stringify({ expected: expectedTheme, theme: themeState.theme, storage: themeState.storageTheme, url: themeState.url }));

    /* re-search for language switching with results visible */
    await page.click('[data-testid="search-input"]');
    await page.type('[data-testid="search-input"]', QUERY);
    await page.keyboard.press('Enter');
    await waitResults(page, 8);
    await sleep(200);

    const langReport = {};
    for (const lang of ['zh-CN', 'en', 'ja', 'ko']) {
      await page.select('#lang-select', lang);
      await sleep(250);
      const snap = await page.evaluate((l, q) => {
        const dict = window.DS_I18N.dictionaries[l];
        const badStatic = [...document.querySelectorAll('[data-i18n]')].filter((n) => {
          const k = n.getAttribute('data-i18n');
          const v = dict[k];
          return typeof v === 'string' && n.textContent !== v;
        }).map((n) => n.getAttribute('data-i18n'));
        const badPlaceholder = [...document.querySelectorAll('[data-i18n-placeholder]')].filter((n) => {
          const v = dict[n.getAttribute('data-i18n-placeholder')];
          return typeof v === 'string' && n.getAttribute('placeholder') !== v;
        }).map((n) => n.getAttribute('data-i18n-placeholder'));
        const badAria = [...document.querySelectorAll('[data-i18n-aria-label]')].filter((n) => {
          const v = dict[n.getAttribute('data-i18n-aria-label')];
          return typeof v === 'string' && n.getAttribute('aria-label') !== v;
        }).map((n) => n.getAttribute('data-i18n-aria-label'));
        return {
          htmlLang: document.documentElement.lang,
          title: document.title,
          hero: document.querySelector('.hero-title').textContent,
          sub: document.querySelector('.hero-sub').textContent,
          placeholder: document.querySelector('#search-input').placeholder,
          inputAria: document.querySelector('#search-input').getAttribute('aria-label'),
          submitText: document.querySelector('[data-testid="search-submit"]').textContent.trim(),
          emptyTitle: dict.emptyTitle,
          footer: document.querySelector('.footer-note').textContent,
          resultsCountText: document.querySelector('[data-testid="results-count"]').textContent,
          resultsQueryText: document.querySelector('#results-query').textContent,
          date: (document.querySelector('.result-date') || {}).textContent || '',
          moreLabel: (document.querySelector('.more-label') || {}).textContent || '',
          badStatic, badPlaceholder, badAria,
          expectedTitle: window.DS_I18N.t(l, 'docTitleSearch', { query: q }),
          expectedHero: dict.heroTitle,
          expectedPlaceholder: dict.searchPlaceholder
        };
      }, lang, QUERY);
      const dicts = await page.evaluate(() => window.DS_I18N.dictionaries);
      const expectedResultsCount = dicts[lang].resultCountMany.replace('{count}', '8');
      const expectedResultsFor = dicts[lang].resultsFor.replace('{query}', QUERY);
      langReport[lang] = snap;
      check('C21.' + lang, 'language switch ' + lang + ' updates all visible strings/dates/title/url state',
        snap.htmlLang === lang && snap.hero === snap.expectedHero && snap.placeholder === snap.expectedPlaceholder
        && snap.title === snap.expectedTitle && snap.inputAria === dicts[lang].searchLabel
        && snap.resultsCountText === expectedResultsCount && snap.resultsQueryText === expectedResultsFor
        && snap.badStatic.length === 0 && snap.badPlaceholder.length === 0 && snap.badAria.length === 0
        && snap.date.length > 0 && snap.moreLabel === dicts[lang].more,
        JSON.stringify({ lang, htmlLang: snap.htmlLang, title: snap.title, hero: snap.hero, date: snap.date,
          count: snap.resultsCountText, badStatic: snap.badStatic, badPlaceholder: snap.badPlaceholder, badAria: snap.badAria }));
    }
    const dates = Object.fromEntries(Object.entries(langReport).map(([k, v]) => [k, v.date]));
    check('C22', 'result dates are locale-formatted per language',
      dates.en !== dates.ja && dates.en !== dates['zh-CN'] && dates.en !== dates.ko && dates.ja !== dates.ko,
      JSON.stringify(dates));

    const storedLang = await page.evaluate(() => localStorage.getItem('ds-lang'));
    await page.reload({ waitUntil: 'domcontentloaded' });
    await appReady(page);
    await sleep(300);
    const persisted = await currentState(page);
    check('C23', 'language persists across reload', persisted.htmlLang === 'ko' && persisted.storageLang === 'ko'
      && (await page.evaluate(() => document.getElementById('lang-select').value)) === 'ko',
      JSON.stringify({ expected: 'ko', stored: storedLang, htmlLang: persisted.htmlLang, storage: persisted.storageLang }));
    check('C24', 'document title is localized while results are shown', /DeepSeek V4/.test(persisted.title),
      'title=' + persisted.title + ' lang=' + persisted.htmlLang);

    /* keyboard shortcuts */
    await page.evaluate(() => document.activeElement && document.activeElement.blur());
    await page.keyboard.down('Meta'); await page.keyboard.press('k'); await page.keyboard.up('Meta');
    await sleep(100);
    let focusInfo = await page.evaluate(() => ({ id: document.activeElement.id, selected: (() => {
      const el = document.activeElement; try { return el.selectionStart === 0 && el.selectionEnd === el.value.length; } catch { return false; } })() }));
    check('C25', 'Meta/Ctrl+K focuses search input', focusInfo.id === 'search-input', JSON.stringify(focusInfo));

    await page.evaluate(() => { document.activeElement.blur(); });
    await page.mouse.click(20, 500);
    await page.keyboard.press('/');
    await sleep(100);
    focusInfo = await page.evaluate(() => ({ id: document.activeElement.id }));
    check('C26', 'slash focuses search when not typing', focusInfo.id === 'search-input', JSON.stringify(focusInfo));

    await page.click('[data-testid="search-input"]');
    await page.keyboard.press('End');
    await page.type('[data-testid="search-input"]', 'x/y');
    await page.keyboard.press('/');
    await sleep(80);
    const slashTyping = await page.evaluate(() => ({ id: document.activeElement.id, value: document.querySelector('#search-input').value }));
    check('C27', 'slash while typing is inserted, does not steal focus', slashTyping.id === 'search-input' && slashTyping.value.endsWith('x/y/'),
      JSON.stringify(slashTyping));

    await page.keyboard.press('Escape');
    await sleep(80);
    const afterEsc = await page.evaluate(() => ({ id: document.activeElement.id, tag: document.activeElement.tagName }));
    check('C28', 'Escape blurs search input', afterEsc.id !== 'search-input', JSON.stringify(afterEsc));

    await page.evaluate(() => window.scrollTo(0, 0));
    await sleep(100);
    st = await currentState(page);
    const overflow = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, innerWidth: window.innerWidth }));
    check('C29', 'no horizontal overflow at 1440', overflow.scrollWidth <= overflow.innerWidth + 1, JSON.stringify(overflow));
  } catch (error) {
    check('C.ERR', 'C section completed without harness exception', false, String(error && error.stack || error));
  } finally {
    await ctx.close();
  }

  /* ============================ D. URL / state ============================ */
  try {
    const { ctx: ctxD, page: pageD } = await newPage(browser, { width: 1440, height: 1000 });

    await pageD.goto(APP + '/?q=DeepSeek%20V4&lang=en', { waitUntil: 'domcontentloaded' });
    await appReady(pageD);
    await waitResults(pageD, 8);
    let st = await currentState(pageD);
    check('D1', '?q= auto-searches on load', st.resultCount === 8 && st.inputValue === 'DeepSeek V4' && st.resultsVisible,
      JSON.stringify({ count: st.resultCount, input: st.inputValue, url: st.url }));

    await pageD.evaluate(() => { localStorage.setItem('ds-theme', 'light'); localStorage.setItem('ds-lang', 'en'); });
    await pageD.goto(APP + '/?theme=dark&lang=ja', { waitUntil: 'domcontentloaded' });
    await appReady(pageD);
    st = await currentState(pageD);
    check('D2', '?theme=dark overrides stored light and ?lang=ja overrides stored en',
      st.theme === 'dark' && st.htmlLang === 'ja', JSON.stringify({ theme: st.theme, lang: st.htmlLang, storedTheme: st.storageTheme, storedLang: st.storageLang }));

    await pageD.goto(APP + '/?lang=fr', { waitUntil: 'domcontentloaded' });
    await appReady(pageD);
    st = await currentState(pageD);
    check('D3', 'invalid ?lang=fr falls back to valid language', ['zh-CN', 'en', 'ja', 'ko'].includes(st.htmlLang),
      'htmlLang=' + st.htmlLang);

    await pageD.goto(APP + '/?theme=light', { waitUntil: 'domcontentloaded' });
    await appReady(pageD);
    st = await currentState(pageD);
    check('D4', '?theme=light applies light theme', st.theme === 'light', 'theme=' + st.theme);

    await pageD.goto(APP + '/#results-region', { waitUntil: 'domcontentloaded' });
    await appReady(pageD);
    const hashSt = await currentState(pageD);
    check('D5', 'app boots without URL params and no data leak in hash', hashSt.emptyVisible && hashSt.resultCount === 0,
      JSON.stringify({ url: hashSt.url, empty: hashSt.emptyVisible }));

    const consoleErrorsD = errors.console.length;
    check('D6', 'no page errors so far in URL/state section', errors.pageerror.length === 0 && consoleErrorsD === 0,
      JSON.stringify({ pageerror: errors.pageerror.slice(0, 5), console: errors.console.slice(0, 5) }));
  } catch (error) {
    check('D.ERR', 'D section completed without harness exception', false, String(error && error.stack || error));
  }

  /* ============================ F. i18n completeness ============================ */
  try {
    const { ctx: ctxF, page: pageF } = await newPage(browser, { width: 1440, height: 1000 });
    await pageF.goto(APP + '/?lang=en', { waitUntil: 'domcontentloaded' });
    await appReady(pageF);
    await sleep(200);
    const data = await pageF.evaluate(() => {
      const keys = new Set();
      document.querySelectorAll('[data-i18n]').forEach((n) => keys.add(n.getAttribute('data-i18n')));
      document.querySelectorAll('[data-i18n-placeholder]').forEach((n) => keys.add(n.getAttribute('data-i18n-placeholder')));
      document.querySelectorAll('[data-i18n-aria-label]').forEach((n) => keys.add(n.getAttribute('data-i18n-aria-label')));
      return { keys: [...keys], dicts: window.DS_I18N.dictionaries, supported: window.DS_I18N.supported };
    });
    const { keys, dicts } = data;
    const langs = ['zh-CN', 'en', 'ja', 'ko'];
    const missingByLang = {};
    for (const lang of langs) {
      const missing = keys.filter((k) => {
        const v = dicts[lang][k];
        return v === undefined || v === null || (typeof v === 'string' && v.trim() === '') || (Array.isArray(v) && v.length === 0);
      });
      missingByLang[lang] = missing;
    }
    const missingTotal = Object.values(missingByLang).reduce((a, b) => a + b.length, 0);
    check('F1', 'all data-i18n keys exist in all 4 dictionaries (' + keys.length + ' keys)', missingTotal === 0,
      JSON.stringify(missingByLang));

    const keySets = Object.fromEntries(langs.map((l) => [l, Object.keys(dicts[l]).sort()]));
    const sameKeys = langs.every((l) => JSON.stringify(keySets[l]) === JSON.stringify(keySets['zh-CN']));
    check('F2', 'dictionaries share identical key sets', sameKeys,
      sameKeys ? 'all ' + keySets['zh-CN'].length + ' keys present in all 4' :
        JSON.stringify(langs.map((l) => ({ l, diff: keySets[l].filter((k) => !keySets['zh-CN'].includes(k)).concat(keySets['zh-CN'].filter((k) => !keySets[l].includes(k))) }))));

    const errCodes = ['missing_api_key', 'invalid_request', 'rate_limited', 'upstream_error', 'timeout', 'not_found', 'network_error', 'unknown'];
    const errMissing = {};
    for (const lang of langs) {
      errMissing[lang] = errCodes.filter((code) => {
        const e = dicts[lang].errors && dicts[lang].errors[code];
        return !e || !e.title || !e.message;
      });
    }
    check('F3', 'all 8 error codes localized with title+message in 4 languages',
      Object.values(errMissing).every((m) => m.length === 0), JSON.stringify(errMissing));

    const ops = {};
    for (const lang of langs) {
      ops[lang] = Array.isArray(dicts[lang].operators) ? dicts[lang].operators.length : -1;
    }
    const opKeys = {};
    for (const lang of langs) opKeys[lang] = (dicts[lang].operators || []).map((o) => o.key).join(',');
    check('F4', 'operator help has 8 entries in every language',
      Object.values(ops).every((n) => n === 8) && Object.values(opKeys).every((k) => k === opKeys['zh-CN']),
      JSON.stringify({ ops, opKeys }));

    /* language leak detection: ja/ko values identical to zh or en */
    const allowlist = new Set(['appName', 'setupStep2', 'docTitleSearch']);
    const leaks = { ja: [], ko: [] };
    const flatten = (lang, key) => {
      const v = dicts[lang][key];
      if (typeof v === 'string') return [[key, v]];
      if (Array.isArray(v)) return v.map((item, i) => [key + '[' + i + ']', (item && (item.desc || item.label)) || String(item)]);
      return [];
    };
    for (const key of Object.keys(dicts['zh-CN'])) {
      if (key === 'operators' || key === 'suggestions' || key === 'errors') continue;
      if (allowlist.has(key)) continue;
      const zh = dicts['zh-CN'][key];
      const en = dicts.en[key];
      const ja = dicts.ja[key];
      const ko = dicts.ko[key];
      if (typeof ja === 'string' && (ja === zh || ja === en)) leaks.ja.push([key, ja]);
      if (typeof ko === 'string' && (ko === zh || ko === en)) leaks.ko.push([key, ko]);
    }
    check('F5', 'no obvious untranslated ja/ko strings (identical to zh/en)', leaks.ja.length === 0 && leaks.ko.length === 0,
      JSON.stringify(leaks));

    const koHangulCheck = ['heroTitle', 'heroSubtitle', 'emptyTitle', 'emptyHint', 'noticeTitle', 'noticeBody', 'noResultsHint', 'footerNote', 'searchPlaceholder'];
    const koMissingHangul = koHangulCheck.filter((k) => !/[가-힣]/.test(dicts.ko[k]));
    check('F6', 'key Korean UI strings contain Hangul', koMissingHangul.length === 0,
      JSON.stringify(koMissingHangul.map((k) => [k, dicts.ko[k]])));

    const jaKanaCheck = ['heroTitle', 'heroSubtitle', 'emptyTitle', 'emptyHint', 'noticeTitle', 'noticeBody', 'noResultsHint', 'footerNote', 'searchPlaceholder'];
    const jaMissingKana = jaKanaCheck.filter((k) => !/[\u3040-\u30ff]/.test(dicts.ja[k]));
    check('F7', 'key Japanese UI strings contain kana', jaMissingKana.length === 0,
      JSON.stringify(jaMissingKana.map((k) => [k, dicts.ja[k]])));

    /* static translation applied consistency in each language while results shown */
    await pageF.click('[data-testid="search-input"]');
    await pageF.type('[data-testid="search-input"]', 'i18n check');
    await pageF.keyboard.press('Enter');
    await waitResults(pageF, 8);
    const badAll = {};
    for (const lang of langs) {
      await pageF.select('#lang-select', lang);
      await sleep(180);
      badAll[lang] = await pageF.evaluate((l) => {
        const dict = window.DS_I18N.dictionaries[l];
        const bad = [];
        document.querySelectorAll('[data-i18n]').forEach((n) => {
          const k = n.getAttribute('data-i18n');
          if (typeof dict[k] === 'string' && n.textContent !== dict[k]) bad.push(k);
        });
        document.querySelectorAll('[data-i18n-placeholder]').forEach((n) => {
          const k = n.getAttribute('data-i18n-placeholder');
          if (typeof dict[k] === 'string' && n.getAttribute('placeholder') !== dict[k]) bad.push('ph:' + k);
        });
        document.querySelectorAll('[data-i18n-aria-label]').forEach((n) => {
          const k = n.getAttribute('data-i18n-aria-label');
          if (typeof dict[k] === 'string' && n.getAttribute('aria-label') !== dict[k]) bad.push('aria:' + k);
        });
        return bad;
      }, lang);
    }
    check('F8', 'DOM static translations match dictionaries in all 4 languages',
      Object.values(badAll).every((b) => b.length === 0), JSON.stringify(badAll));

    await ctxF.close();
  } catch (error) {
    check('F.ERR', 'F section completed without harness exception', false, String(error && error.stack || error));
  }

  await browser.close();

  const passed = results.filter((r) => r.pass).length;
  const failed = results.filter((r) => !r.pass);
  console.log('\nCORE SUMMARY: ' + passed + ' pass / ' + failed.length + ' fail / ' + results.length + ' total');
  if (failed.length) console.log('FAILED: ' + failed.map((f) => f.id).join(', '));
  console.log('CONSOLE ERRORS: ' + JSON.stringify(errors.console.slice(0, 10)));
  console.log('PAGE ERRORS: ' + JSON.stringify(errors.pageerror.slice(0, 10)));
  console.log('FAILED REQUESTS: ' + JSON.stringify(errors.requestfailed.slice(0, 10)));
  await fs.writeFile(new URL('./browser-core-results.json', import.meta.url), JSON.stringify({ generatedAt: new Date().toISOString(), results, errors }, null, 2));
}
main().catch((e) => { console.error('HARNESS ERROR', e); process.exitCode = 1; });
