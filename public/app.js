/*
 * DeepSeek Search — application logic
 * Native browser JS. No dependencies, no build step.
 */
(function () {
  'use strict';

  var I18N = window.DS_I18N;

  var STORAGE_THEME = 'ds-theme';
  var STORAGE_LANG = 'ds-lang';
  var SEARCH_FETCH_COUNT = 50;
  var PAGE_SIZE = 10;

  /* Same-origin when served by server.js. Direct file/static previews use the
     local API server on port 3000 (CORS is enabled for local origins). */
  var RUNTIME = window.__DS_RUNTIME__ || {};
  var API_BASE = typeof RUNTIME.apiBase === 'string'
    ? RUNTIME.apiBase.replace(/\/+$/, '')
    : '';
  if (RUNTIME.servedByApp !== true) API_BASE = API_BASE || 'http://127.0.0.1:3000';
  var API_HEALTH = API_BASE + '/api/health';
  var API_SEARCH = API_BASE + '/api/search';
  var REQUEST_TIMEOUT_MS = 20000;
  var COPY_FEEDBACK_MS = 1600;
  var KNOWN_ERROR_CODES = [
    'missing_api_key',
    'invalid_api_key',
    'insufficient_balance',
    'forbidden',
    'invalid_request',
    'rate_limited',
    'payload_too_large',
    'upstream_error',
    'timeout',
    'not_found',
    'network_error',
    'internal_error',
    'unknown'
  ];

  /* Technical insertion text for the operator chips (not user-facing copy). */
  var OPERATOR_INSERTS = {
    site: 'site:',
    excludeSite: '-site:',
    excludeTerm: '-',
    excludePhrase: '-""',
    exactPhrase: '""',
    lang: 'lang:',
    after: 'after:',
    before: 'before:'
  };

  var state = {
    lang: 'zh-CN',
    theme: 'light',
    page: 1,
    themePinned: false,
    status: 'pristine',
    query: '',
    results: [],
    elapsedMs: null,
    errorCode: null,
    expanded: [],
    health: null,
    demo: false,
    noticeMode: null,
    noticeDismissed: false,
    shortcutKey: '⌘K',
    isMac: true,
    activeController: null,
    requestId: 0,
    lastFocus: null
  };

  var dom = {};

  function $(id) {
    return document.getElementById(id);
  }

  function t(key, vars) {
    return I18N.t(state.lang, key, vars);
  }

  function safeStorageGet(key) {
    try {
      return window.localStorage.getItem(key);
    } catch (error) {
      return null;
    }
  }

  function safeStorageSet(key, value) {
    try {
      window.localStorage.setItem(key, value);
    } catch (error) {
      /* Storage can be unavailable; in-memory state still works. */
    }
  }

  function normalizeLanguage(value) {
    return I18N.normalizeLanguage(value);
  }

  function urlParams() {
    try {
      return new URLSearchParams(window.location.search);
    } catch (error) {
      return new URLSearchParams('');
    }
  }

  function detectMac() {
    var platform = '';
    if (navigator.userAgentData && typeof navigator.userAgentData.platform === 'string') {
      platform = navigator.userAgentData.platform;
    } else if (typeof navigator.platform === 'string') {
      platform = navigator.platform;
    }
    return /mac|iphone|ipad|ipod/i.test(platform);
  }

  function element(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (typeof text === 'string') node.textContent = text;
    return node;
  }

  function svgIcon(name) {
    var ns = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('class', 'icon');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    var use = document.createElementNS(ns, 'use');
    use.setAttribute('href', '#' + name);
    svg.appendChild(use);
    return svg;
  }

  function formatNumber(value) {
    var number = Number(value);
    if (!Number.isFinite(number)) return String(value);
    try {
      return new Intl.NumberFormat(state.lang).format(number);
    } catch (error) {
      return String(number);
    }
  }

  function formatScore(value) {
    var number = Number(value);
    if (!Number.isFinite(number)) return '';
    try {
      return new Intl.NumberFormat(state.lang, { maximumFractionDigits: 2 }).format(number);
    } catch (error) {
      return String(number);
    }
  }

  function formatDate(value) {
    if (typeof value !== 'string' || !value.trim()) return '';
    var date = new Date(value);
    if (isNaN(date.getTime())) return '';
    try {
      return new Intl.DateTimeFormat(state.lang, {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      }).format(date);
    } catch (error) {
      return date.toISOString().slice(0, 10);
    }
  }

  function cleanString(value) {
    return typeof value === 'string' ? value.trim() : '';
  }

  function sanitizeHttpUrl(value) {
    if (typeof value !== 'string' || !value.trim()) return '';
    try {
      var url = new URL(value.trim());
      if (url.protocol === 'http:' || url.protocol === 'https:') return url.href;
    } catch (error) {
      /* Relative or malformed URLs are rejected. */
    }
    return '';
  }

  function hostnameOf(url) {
    try {
      return new URL(url).hostname.replace(/^www\./i, '');
    } catch (error) {
      return '';
    }
  }

  function normalizeResult(raw) {
    if (!raw || typeof raw !== 'object') return null;
    var url = sanitizeHttpUrl(raw.url);
    var hostname = url ? hostnameOf(url) : '';
    var title = cleanString(raw.title);
    if (!title) title = hostname;
    if (!title) return null;

    var siteName = cleanString(raw.site_name) || hostname;
    var authorityNumber = Number(raw.authority);
    var scoreNumber = Number(raw.rerank_score);

    return {
      title: title.slice(0, 500),
      url: url,
      hostname: hostname,
      siteName: siteName.slice(0, 160),
      snippet: cleanString(raw.snippet).slice(0, 1200),
      summary: cleanString(raw.summary).slice(0, 4000),
      date: cleanString(raw.date),
      authority: Number.isFinite(authorityNumber)
        ? Math.max(-1, Math.min(4, Math.round(authorityNumber)))
        : -1,
      rerankScore: Number.isFinite(scoreNumber) ? scoreNumber : 0
    };
  }

  /* -------------------------------------------------------------------------
     Static + dynamic translation
     ------------------------------------------------------------------------- */

  function applyStaticTranslations() {
    var nodes = document.querySelectorAll('[data-i18n]');
    for (var i = 0; i < nodes.length; i += 1) {
      var key = nodes[i].getAttribute('data-i18n');
      var value = t(key);
      if (typeof value === 'string') nodes[i].textContent = value;
    }

    var placeholderNodes = document.querySelectorAll('[data-i18n-placeholder]');
    for (var j = 0; j < placeholderNodes.length; j += 1) {
      var placeholderKey = placeholderNodes[j].getAttribute('data-i18n-placeholder');
      var placeholder = t(placeholderKey);
      if (typeof placeholder === 'string') placeholderNodes[j].setAttribute('placeholder', placeholder);
    }

    var ariaNodes = document.querySelectorAll('[data-i18n-aria-label]');
    for (var k = 0; k < ariaNodes.length; k += 1) {
      var ariaKey = ariaNodes[k].getAttribute('data-i18n-aria-label');
      var ariaValue = t(ariaKey);
      if (typeof ariaValue === 'string') ariaNodes[k].setAttribute('aria-label', ariaValue);
    }

    var titleNodes = document.querySelectorAll('[data-i18n-title]');
    for (var m = 0; m < titleNodes.length; m += 1) {
      var titleKey = titleNodes[m].getAttribute('data-i18n-title');
      var titleValue = t(titleKey);
      if (typeof titleValue === 'string') titleNodes[m].setAttribute('title', titleValue);
    }
  }

  function renderLanguageOptions() {
    dom.langSelect.replaceChildren();
    for (var i = 0; i < I18N.supported.length; i += 1) {
      var code = I18N.supported[i];
      var option = document.createElement('option');
      option.value = code;
      option.textContent = I18N.langNames[code] || code;
      option.setAttribute('lang', code);
      dom.langSelect.appendChild(option);
    }
    dom.langSelect.value = state.lang;
  }

  function renderSuggestions() {
    dom.suggestions.replaceChildren();
    var suggestions = t('suggestions');
    if (!Array.isArray(suggestions)) return;
    for (var i = 0; i < suggestions.length; i += 1) {
      (function (query) {
        var button = element('button', 'suggestion', query);
        button.type = 'button';
        button.addEventListener('click', function () {
          setInputValue(query);
          runSearch(query);
        });
        dom.suggestions.appendChild(button);
      })(String(suggestions[i]));
    }
  }

  function renderOperatorHelp() {
    dom.operatorList.replaceChildren();
    var operators = t('operators');
    if (!Array.isArray(operators)) return;

    for (var i = 0; i < operators.length; i += 1) {
      var op = operators[i] || {};
      var row = element('div', 'op-row');
      row.appendChild(element('code', 'op-syntax', cleanString(op.label)));
      var details = element('div', 'op-details');
      details.appendChild(element('span', 'op-desc', cleanString(op.desc)));
      details.appendChild(element('span', 'op-example', cleanString(op.example)));
      row.appendChild(details);
      dom.operatorList.appendChild(row);
    }

    var chips = dom.opChips.querySelectorAll('[data-op]');
    for (var j = 0; j < chips.length; j += 1) {
      var key = chips[j].getAttribute('data-op');
      var match = null;
      for (var k = 0; k < operators.length; k += 1) {
        if (operators[k] && operators[k].key === key) {
          match = operators[k];
          break;
        }
      }
      if (match) {
        chips[j].setAttribute('aria-label', cleanString(match.desc));
        chips[j].setAttribute('title', cleanString(match.desc) + ' — ' + cleanString(match.example));
      }
    }
  }

  function renderFooterHint() {
    if (dom.footerHint) {
      dom.footerHint.textContent = t('footerHint', { key: state.shortcutKey });
    }
    dom.shortcutHint.textContent = state.shortcutKey;
    dom.shortcutHint.setAttribute('title', t('shortcutFocus', { key: state.shortcutKey }));
  }

  function updateThemeControl() {
    var dark = state.theme === 'dark';
    var label = t(dark ? 'themeSwitchToLight' : 'themeSwitchToDark');
    dom.themeToggle.setAttribute('aria-pressed', dark ? 'true' : 'false');
    dom.themeToggle.setAttribute('aria-label', label);
    dom.themeToggle.setAttribute('title', label);
  }

  function updateDemoNotice() {
    if (!dom.demoNotice) return;
    dom.demoNotice.hidden = !state.demo;
  }

  function updateDemoBadge() {
    dom.demoBadge.hidden = !state.demo;
    if (state.demo) {
      var label = t('demoBadgeTitle');
      dom.demoBadge.setAttribute('title', label);
      dom.demoBadge.setAttribute('aria-label', label);
    } else {
      dom.demoBadge.removeAttribute('title');
      dom.demoBadge.removeAttribute('aria-label');
    }
  }

  function updateNoticeText() {
    if (dom.apiNotice.hidden) return;
    var offline = state.noticeMode === 'offline';
    var errorDict = t('errors') || {};
    var offlineEntry = errorDict.network_error || {};
    dom.noticeTitle.textContent = offline ? cleanString(offlineEntry.title) : t('noticeTitle');
    dom.noticeBody.hidden = offline;
    dom.noticeOffline.hidden = !offline;
    dom.noticeAction.hidden = offline;
  }

  function updateDocumentTitle() {
    if (state.query && state.status !== 'pristine') {
      document.title = t('docTitleSearch', { query: state.query.slice(0, 80) });
    } else {
      document.title = t('appName');
    }
  }

  function applyLanguage(lang, options) {
    var opts = options || {};
    var normalized = normalizeLanguage(lang) || I18N.defaultLanguage;
    state.lang = normalized;
    document.documentElement.lang = normalized;
    if (dom.langSelect.value !== normalized) dom.langSelect.value = normalized;

    applyStaticTranslations();
    renderSuggestions();
    renderOperatorHelp();
    renderFooterHint();
    updateThemeControl();
    updateDemoBadge();
    updateDemoNotice();
    updateNoticeText();
    updateDocumentTitle();
    renderDynamicState();

    if (opts.persist) safeStorageSet(STORAGE_LANG, normalized);
    if (opts.syncUrl) syncUrl();
  }

  function renderDynamicState() {
    if (state.status === 'success') {
      renderResults();
    } else if (state.status === 'empty') {
      updateNoResultsTitle();
    } else if (state.status === 'error') {
      renderErrorState();
    } else if (state.status === 'loading') {
      dom.liveStatus.textContent = t('loadingStatus', { query: state.query });
    }
  }

  function syncUrl() {
    if (!window.history || typeof window.history.replaceState !== 'function') return;
    var params = urlParams();
    if (state.query) {
      params.set('q', state.query);
    } else {
      params.delete('q');
    }
    params.set('theme', state.theme);
    params.set('lang', state.lang);
    var queryString = params.toString();
    var next = window.location.pathname + (queryString ? '?' + queryString : '') + window.location.hash;
    try {
      window.history.replaceState(null, '', next);
    } catch (error) {
      /* History can be restricted in sandboxed contexts. */
    }
  }

  /* -------------------------------------------------------------------------
     Theme
     ------------------------------------------------------------------------- */

  function applyTheme(theme, options) {
    var opts = options || {};
    state.theme = theme === 'dark' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', state.theme);
    document.documentElement.style.colorScheme = state.theme;
    if (dom.metaThemeColor) {
      dom.metaThemeColor.setAttribute('content', state.theme === 'dark' ? '#0b0d10' : '#f7f8fa');
    }
    updateThemeControl();
    if (opts.persist) {
      state.themePinned = true;
      safeStorageSet(STORAGE_THEME, state.theme);
    }
    if (opts.syncUrl) syncUrl();
  }

  function initialTheme() {
    var root = document.documentElement;
    return root.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
  }

  function initialLanguage() {
    var fromDocument = normalizeLanguage(document.documentElement.lang);
    if (fromDocument) return fromDocument;
    var stored = normalizeLanguage(safeStorageGet(STORAGE_LANG));
    if (stored) return stored;
    return I18N.browserLanguage();
  }

  function watchSystemTheme() {
    if (!window.matchMedia) return;
    var media = window.matchMedia('(prefers-color-scheme: dark)');
    var handler = function (event) {
      if (state.themePinned) return;
      applyTheme(event.matches ? 'dark' : 'light', { persist: false, syncUrl: false });
    };
    if (typeof media.addEventListener === 'function') {
      media.addEventListener('change', handler);
    } else if (typeof media.addListener === 'function') {
      media.addListener(handler);
    }
  }

  /* -------------------------------------------------------------------------
     Search states and rendering
     ------------------------------------------------------------------------- */

  function setStatus(status) {
    state.status = status;
    var compact = status === 'success' || status === 'empty' || status === 'error';
    dom.app.classList.toggle('is-compact', compact);

    dom.emptyState.hidden = status !== 'pristine';
    dom.loading.hidden = status !== 'loading';
    dom.resultsList.hidden = status !== 'success';
    dom.noResults.hidden = status !== 'empty';
    dom.errorState.hidden = status !== 'error';
    dom.resultsHead.hidden = status !== 'success';
    if (dom.pagination) dom.pagination.hidden = status !== 'success';
    dom.resultsRegion.setAttribute('aria-busy', status === 'loading' ? 'true' : 'false');
  }

  function setSubmitDisabled(disabled) {
    dom.searchSubmit.disabled = disabled;
    dom.searchSubmit.setAttribute('aria-disabled', disabled ? 'true' : 'false');
  }

  function setInputValue(value) {
    dom.searchInput.value = typeof value === 'string' ? value : '';
    updateClearButton();
  }

  function updateClearButton() {
    dom.searchClear.hidden = dom.searchInput.value.length === 0;
  }

  function focusSearch(selectAll) {
    if (!dom.helpPopover.hidden) closeHelp(false);
    dom.searchInput.focus();
    if (selectAll && dom.searchInput.value) {
      try {
        dom.searchInput.select();
      } catch (error) {
        /* Selection is best-effort. */
      }
    }
  }

  function updateResultsHeader() {
    if (state.status !== 'success') {
      dom.resultsHead.hidden = true;
      dom.resultsCount.textContent = '';
      dom.resultsQuery.textContent = '';
      dom.resultsTime.textContent = '';
      return;
    }

    var count = state.results.length;
    dom.resultsCount.textContent = t(count === 1 ? 'resultCountOne' : 'resultCountMany', {
      count: formatNumber(count)
    });
    dom.resultsQuery.textContent = t('resultsFor', { query: state.query });
    if (state.elapsedMs !== null && Number.isFinite(state.elapsedMs)) {
      dom.resultsTime.textContent = t('elapsed', { ms: formatNumber(state.elapsedMs) });
      dom.resultsTime.hidden = false;
    } else {
      dom.resultsTime.textContent = '';
      dom.resultsTime.hidden = true;
    }

    dom.resultsHead.hidden = false;
  }

  function monogramFor(result) {
    var source = result.siteName || result.hostname || result.title || '?';
    var first = Array.from(source)[0] || '?';
    return first.toUpperCase();
  }

  function buildResultCard(result, index) {
    var li = element('li', 'result-card');
    li.setAttribute('data-testid', 'result-item');
    li.style.setProperty('--index', String(Math.min(index, 8)));

    /* Source row */
    var source = element('div', 'result-source');
    var iconWrap = element('span', 'favicon-wrap');
    /* A monogram is always shown: remote favicons are frequently transparent
       or dark-on-dark, and avoiding them also avoids third-party requests. */
    iconWrap.appendChild(element('span', 'favicon-fallback', monogramFor(result)));
    source.appendChild(iconWrap);

    if (result.siteName) {
      source.appendChild(element('span', 'site-name', result.siteName));
    }
    if (result.hostname && result.hostname.toLowerCase() !== result.siteName.toLowerCase()) {
      if (result.siteName) source.appendChild(element('span', 'site-dot'));
      source.appendChild(element('span', 'site-host', result.hostname));
    }
    li.appendChild(source);

    /* Title */
    var title = element('h3', 'result-title');
    if (result.url) {
      var link = document.createElement('a');
      link.href = result.url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = result.title;
      title.appendChild(link);
    } else {
      title.textContent = result.title;
    }
    li.appendChild(title);

    /* Snippet */
    if (result.snippet) {
      li.appendChild(element('p', 'result-snippet', result.snippet));
    }

    /* Expandable summary */
    if (result.summary && result.summary !== result.snippet) {
      var summaryId = 'result-summary-' + index;
      var summary = element('div', 'result-summary');
      summary.id = summaryId;
      summary.appendChild(element('span', 'summary-label', t('summaryLabel')));
      summary.appendChild(document.createTextNode(result.summary));

      var moreButton = element('button', 'more-btn');
      moreButton.type = 'button';
      moreButton.setAttribute('aria-controls', summaryId);
      var moreLabel = element('span', 'more-label', t('more'));
      moreButton.appendChild(moreLabel);
      moreButton.appendChild(svgIcon('i-chevron'));

      var expanded = state.expanded[index] === true;
      summary.hidden = !expanded;
      moreButton.setAttribute('aria-expanded', expanded ? 'true' : 'false');
      moreLabel.textContent = t(expanded ? 'less' : 'more');

      moreButton.addEventListener('click', function () {
        var isOpen = moreButton.getAttribute('aria-expanded') === 'true';
        var nextOpen = !isOpen;
        moreButton.setAttribute('aria-expanded', nextOpen ? 'true' : 'false');
        summary.hidden = !nextOpen;
        moreLabel.textContent = t(nextOpen ? 'less' : 'more');
        state.expanded[index] = nextOpen;
      });

      li.appendChild(moreButton);
      li.appendChild(summary);
    }

    /* Footer metadata */
    var footer = element('div', 'result-footer');

    var formattedDate = formatDate(result.date);
    if (formattedDate) {
      var dateNode = element('span', 'result-date');
      dateNode.appendChild(svgIcon('i-calendar'));
      dateNode.appendChild(document.createTextNode(formattedDate));
      footer.appendChild(dateNode);
    }

    if (result.authority >= 3) {
      var authorityBadge = element('span', 'result-badge authority');
      authorityBadge.appendChild(svgIcon('i-shield'));
      authorityBadge.appendChild(element('span', '', t(result.authority >= 4 ? 'authority4' : 'authority3')));
      footer.appendChild(authorityBadge);
    }

    if (result.rerankScore >= 1.5) {
      var qualityBadge = element('span', 'result-badge quality');
      qualityBadge.appendChild(svgIcon('i-spark'));
      qualityBadge.appendChild(element('span', '', t('quality')));
      qualityBadge.setAttribute('title', t('scoreTitle', { score: formatScore(result.rerankScore) }));
      footer.appendChild(qualityBadge);
    }

    if (result.url) {
      var copyButton = element('button', 'copy-btn');
      copyButton.type = 'button';
      copyButton.appendChild(svgIcon('i-copy'));
      var copyLabel = element('span', 'copy-label', t('copyLink'));
      copyButton.appendChild(copyLabel);
      copyButton.setAttribute('aria-label', t('copyLink'));
      copyButton.setAttribute('title', t('copyLink'));

      copyButton.addEventListener('click', function () {
        copyToClipboard(result.url).then(function (ok) {
          if (!document.body.contains(copyButton)) return;
          copyButton.classList.add('copied');
          copyLabel.textContent = t(ok ? 'copied' : 'copyFailed');
          copyButton.setAttribute('aria-label', t(ok ? 'copied' : 'copyFailed'));
          dom.liveStatus.textContent = t(ok ? 'copied' : 'copyFailed');
          window.clearTimeout(copyButton._resetTimer);
          copyButton._resetTimer = window.setTimeout(function () {
            if (!document.body.contains(copyButton)) return;
            copyButton.classList.remove('copied');
            copyLabel.textContent = t('copyLink');
            copyButton.setAttribute('aria-label', t('copyLink'));
          }, COPY_FEEDBACK_MS);
        });
      });

      footer.appendChild(copyButton);
    }

    if (footer.childNodes.length > 0) li.appendChild(footer);
    return li;
  }

  function totalPages() {
    return Math.max(1, Math.ceil(state.results.length / PAGE_SIZE));
  }

  function updatePagination() {
    if (!dom.pagination) return;
    var pages = totalPages();
    var show = state.status === 'success' && pages > 1;
    dom.pagination.hidden = !show;
    if (!show) {
      dom.pagerPages.replaceChildren();
      dom.pagerStatus.textContent = '';
      return;
    }

    dom.pagerPages.replaceChildren();
    for (var page = 1; page <= pages; page += 1) {
      (function (pageNumber) {
        var button = element('button', 'pager-page', formatNumber(pageNumber));
        button.type = 'button';
        button.setAttribute('aria-label', t('pageNumberLabel', { page: formatNumber(pageNumber) }));
        if (pageNumber === state.page) button.setAttribute('aria-current', 'page');
        button.addEventListener('click', function () {
          goToPage(pageNumber);
        });
        dom.pagerPages.appendChild(button);
      })(page);
    }

    dom.pagerPrev.disabled = state.page <= 1;
    dom.pagerNext.disabled = state.page >= pages;
    dom.pagerPrev.setAttribute('aria-label', t('pagePrevious'));
    dom.pagerNext.setAttribute('aria-label', t('pageNext'));
    dom.pagerStatus.textContent = t('pageStatus', {
      page: formatNumber(state.page),
      pages: formatNumber(pages)
    });
  }

  function goToPage(page) {
    var pages = totalPages();
    var next = Math.min(Math.max(1, page), pages);
    if (next === state.page) return;
    state.page = next;
    renderResults();
    if (dom.resultsRegion) {
      try {
        dom.resultsRegion.focus({ preventScroll: true });
      } catch (error) {
        /* Focus is best-effort. */
      }
      try {
        dom.resultsRegion.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } catch (error) {
        dom.resultsRegion.scrollIntoView();
      }
    }
  }

  function renderResults() {
    var pages = totalPages();
    if (state.page > pages) state.page = pages;
    var start = (state.page - 1) * PAGE_SIZE;
    var end = Math.min(start + PAGE_SIZE, state.results.length);

    dom.resultsList.replaceChildren();
    for (var i = start; i < end; i += 1) {
      dom.resultsList.appendChild(buildResultCard(state.results[i], i));
    }
    updateResultsHeader();
    updatePagination();
  }

  function updateNoResultsTitle() {
    dom.noResultsTitle.textContent = t('noResultsTitle', { query: state.query });
  }

  function renderErrorState() {
    var code = KNOWN_ERROR_CODES.indexOf(state.errorCode) >= 0 ? state.errorCode : 'unknown';
    var errors = t('errors') || {};
    var entry = errors[code] || errors.unknown || {};
    dom.errorTitle.textContent = cleanString(entry.title);
    dom.errorMessage.textContent = cleanString(entry.message);
  }

  /* -------------------------------------------------------------------------
     API
     ------------------------------------------------------------------------- */

  function abortActiveRequest() {
    if (!state.activeController) return;
    try {
      state.activeController.abort();
    } catch (error) {
      /* Abort is best-effort. */
    }
    state.activeController = null;
  }

  function makeApiError(code) {
    var error = new Error(code);
    error.code = code;
    return error;
  }

  function runSearch(rawQuery) {
    var query = cleanString(rawQuery).slice(0, 128);
    if (!query) {
      focusSearch();
      return;
    }
    if (state.status === 'loading' && state.query === query) return;

    abortActiveRequest();
    state.requestId += 1;
    var requestId = state.requestId;
    var controller = new AbortController();
    state.activeController = controller;

    state.query = query;
    state.page = 1;
    state.results = [];
    state.expanded = [];
    state.elapsedMs = null;
    state.errorCode = null;
    setInputValue(query);
    setStatus('loading');
    setSubmitDisabled(true);
    updateResultsHeader();
    dom.liveStatus.textContent = t('loadingStatus', { query: query });
    syncUrl();

    var startedAt = window.performance && typeof window.performance.now === 'function'
      ? window.performance.now()
      : Date.now();
    var timedOut = false;
    var timer = window.setTimeout(function () {
      timedOut = true;
      try {
        controller.abort();
      } catch (error) {
        /* Ignore. */
      }
    }, REQUEST_TIMEOUT_MS);

    fetch(API_SEARCH, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ query: query, count: SEARCH_FETCH_COUNT }),
      signal: controller.signal
    })
      .then(function (response) {
        return response.json().catch(function () {
          return null;
        }).then(function (data) {
          if (requestId !== state.requestId) return null;
          if (!response.ok) {
            var code = data && data.error && typeof data.error.code === 'string'
              ? data.error.code
              : 'unknown';
            throw makeApiError(code);
          }
          if (!data || typeof data !== 'object' || !Array.isArray(data.results)) {
            throw makeApiError('upstream_error');
          }
          return data;
        });
      })
      .then(function (data) {
        if (!data || requestId !== state.requestId) return;

        var normalized = [];
        for (var i = 0; i < data.results.length; i += 1) {
          var result = normalizeResult(data.results[i]);
          if (result) normalized.push(result);
        }

        var measured = (window.performance && typeof window.performance.now === 'function'
          ? window.performance.now()
          : Date.now()) - startedAt;
        var took = Number(data.tookMs);
        state.elapsedMs = Number.isFinite(took) && took >= 0 ? Math.round(took) : Math.round(measured);
        state.results = normalized;
        state.expanded = [];
        if (typeof data.query === 'string' && data.query.trim()) {
          state.query = data.query.trim().slice(0, 128);
          setInputValue(state.query);
        }
        if (data.mock === true) {
          state.demo = true;
          updateDemoBadge();
          updateDemoNotice();
        } else {
          state.demo = false;
          updateDemoBadge();
          updateDemoNotice();
        }

        setSubmitDisabled(false);
        setStatus(normalized.length > 0 ? 'success' : 'empty');
        if (normalized.length > 0) {
          renderResults();
        } else {
          updateNoResultsTitle();
          dom.liveStatus.textContent = t('noResultsTitle', { query: state.query });
        }
        updateDocumentTitle();
        syncUrl();
      })
      .catch(function (error) {
        if (requestId !== state.requestId) return;
        setSubmitDisabled(false);
        if (!timedOut && error && error.name === 'AbortError') return;

        var code = 'network_error';
        if (timedOut) {
          code = 'timeout';
        } else if (error && typeof error.code === 'string' && KNOWN_ERROR_CODES.indexOf(error.code) >= 0) {
          code = error.code;
        } else if (error && error.code === 'invalid_request') {
          code = 'invalid_request';
        }
        state.errorCode = code;
        setStatus('error');
        renderErrorState();
        updateDocumentTitle();
        dom.liveStatus.textContent = '';
        syncUrl();
        if (code === 'missing_api_key') showNotice('missing');
      })
      .finally(function () {
        window.clearTimeout(timer);
        if (requestId === state.requestId) {
          state.activeController = null;
          setSubmitDisabled(false);
        }
      });
  }

  function loadHealth() {
    fetch(API_HEALTH, { headers: { 'Accept': 'application/json' } })
      .then(function (response) {
        if (!response.ok) throw new Error('health status');
        return response.json();
      })
      .then(function (data) {
        if (!data || typeof data !== 'object') throw new Error('health payload');
        state.health = {
          ok: data.ok === true,
          apiKeyConfigured: data.apiKeyConfigured === true,
          mock: data.mock === true
        };
        if (state.health.mock) {
          state.demo = true;
          updateDemoBadge();
          updateDemoNotice();
        }

        var needsSetup = !state.health.apiKeyConfigured && !state.health.mock;
        dom.setupSection.hidden = !needsSetup;
        if (needsSetup) showNotice('missing');
      })
      .catch(function () {
        showNotice('offline');
      });
  }

  /* -------------------------------------------------------------------------
     Setup notice
     ------------------------------------------------------------------------- */

  function showNotice(mode) {
    if (state.noticeDismissed) return;
    state.noticeMode = mode;
    if (mode === 'missing') dom.setupSection.hidden = false;
    dom.apiNotice.hidden = false;
    updateNoticeText();
  }

  function hideNotice() {
    state.noticeDismissed = true;
    state.noticeMode = null;
    dom.apiNotice.hidden = true;
  }

  /* -------------------------------------------------------------------------
     Help popover
     ------------------------------------------------------------------------- */

  /** Keep the popover inside the app's scroll viewport at every window size. */
  function fitHelpPopover() {
    if (!dom.appMain || dom.helpPopover.hidden) return;
    dom.helpPopover.style.maxHeight = '';
    var mainRect = dom.appMain.getBoundingClientRect();
    var popRect = dom.helpPopover.getBoundingClientRect();
    var available = Math.floor(mainRect.bottom - popRect.top - 14);
    if (!Number.isFinite(available) || available < 220) available = 220;
    dom.helpPopover.style.maxHeight = Math.min(available, 640) + 'px';
  }

  function openHelp(focusSetup) {
    state.lastFocus = document.activeElement && typeof document.activeElement.focus === 'function'
      ? document.activeElement
      : dom.helpButton;
    dom.helpPopover.hidden = false;
    dom.helpButton.setAttribute('aria-expanded', 'true');
    fitHelpPopover();

    if (focusSetup && !dom.setupSection.hidden) {
      try {
        dom.setupSection.focus({ preventScroll: true });
      } catch (error) {
        dom.setupSection.focus();
      }
      window.requestAnimationFrame(function () {
        dom.helpPopover.scrollTop = Math.max(0, dom.setupSection.offsetTop - 10);
      });
    } else {
      dom.helpPopover.scrollTop = 0;
      dom.helpPopover.focus();
    }
  }

  function closeHelp(restoreFocus) {
    if (dom.helpPopover.hidden) return;
    dom.helpPopover.hidden = true;
    dom.helpButton.setAttribute('aria-expanded', 'false');
    if (restoreFocus && state.lastFocus && typeof state.lastFocus.focus === 'function') {
      state.lastFocus.focus();
    }
  }

  /* -------------------------------------------------------------------------
     Operator chips
     ------------------------------------------------------------------------- */

  function insertOperator(key) {
    var insertion = OPERATOR_INSERTS[key];
    if (typeof insertion !== 'string') return;
    var input = dom.searchInput;
    var value = input.value;
    var start = typeof input.selectionStart === 'number' ? input.selectionStart : value.length;
    var end = typeof input.selectionEnd === 'number' ? input.selectionEnd : start;
    var before = value.slice(0, start);
    var after = value.slice(end);
    var leadingSpace = before && !/\s$/.test(before) ? ' ' : '';
    var inserted = leadingSpace + insertion;
    input.value = before + inserted + after;
    var caret = before.length + inserted.length;
    if (insertion === '""') caret = before.length + leadingSpace.length + 1;
    if (insertion === '-""') caret = before.length + leadingSpace.length + 2;

    updateClearButton();
    focusSearch(false);
    try {
      input.setSelectionRange(caret, caret);
    } catch (error) {
      /* Ignore. */
    }
  }

  /* -------------------------------------------------------------------------
     Clipboard
     ------------------------------------------------------------------------- */

  function fallbackCopy(text) {
    try {
      var area = document.createElement('textarea');
      area.value = text;
      area.setAttribute('readonly', '');
      area.style.position = 'fixed';
      area.style.top = '-1000px';
      area.style.opacity = '0';
      document.body.appendChild(area);
      area.select();
      var ok = document.execCommand('copy');
      document.body.removeChild(area);
      return ok;
    } catch (error) {
      return false;
    }
  }

  function copyToClipboard(text) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text).then(function () {
        return true;
      }).catch(function () {
        return fallbackCopy(text);
      });
    }
    return Promise.resolve(fallbackCopy(text));
  }

  /* -------------------------------------------------------------------------
     Events
     ------------------------------------------------------------------------- */

  function isTypingTarget(target) {
    if (!target || !target.tagName) return false;
    var tag = target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
    if (target.isContentEditable) return true;
    return false;
  }

  function bindEvents() {
    dom.searchForm.addEventListener('submit', function (event) {
      event.preventDefault();
      var query = cleanString(dom.searchInput.value);
      if (!query) {
        focusSearch();
        return;
      }
      runSearch(query);
    });

    dom.searchInput.addEventListener('input', updateClearButton);

    if (dom.pagerPrev) {
      dom.pagerPrev.addEventListener('click', function () {
        goToPage(state.page - 1);
      });
      dom.pagerNext.addEventListener('click', function () {
        goToPage(state.page + 1);
      });
    }

    dom.searchClear.addEventListener('click', function () {
      abortActiveRequest();
      state.requestId += 1;
      state.query = '';
      state.page = 1;
      state.results = [];
      state.expanded = [];
      state.elapsedMs = null;
      state.errorCode = null;
      setInputValue('');
      setSubmitDisabled(false);
      setStatus('pristine');
      updateResultsHeader();
      updateDocumentTitle();
      dom.liveStatus.textContent = '';
      syncUrl();
      focusSearch();
    });

    var chips = dom.opChips.querySelectorAll('[data-op]');
    for (var i = 0; i < chips.length; i += 1) {
      (function (chip) {
        chip.addEventListener('click', function () {
          insertOperator(chip.getAttribute('data-op'));
        });
      })(chips[i]);
    }

    dom.helpButton.addEventListener('click', function (event) {
      event.stopPropagation();
      if (dom.helpPopover.hidden) {
        openHelp(false);
      } else {
        closeHelp(true);
      }
    });

    dom.helpClose.addEventListener('click', function () {
      closeHelp(true);
    });

    document.addEventListener('pointerdown', function (event) {
      if (dom.helpPopover.hidden) return;
      if (dom.helpPopover.contains(event.target) || dom.helpButton.contains(event.target)) return;
      closeHelp(false);
    });

    dom.noticeAction.addEventListener('click', function () {
      openHelp(true);
    });

    dom.demoNoticeAction.addEventListener('click', function () {
      dom.setupSection.hidden = false;
      openHelp(true);
    });

    dom.noticeClose.addEventListener('click', function () {
      hideNotice();
    });

    dom.themeToggle.addEventListener('click', function () {
      applyTheme(state.theme === 'dark' ? 'light' : 'dark', { persist: true, syncUrl: true });
    });

    dom.langSelect.addEventListener('change', function () {
      applyLanguage(dom.langSelect.value, { persist: true, syncUrl: true });
    });

    dom.retryButton.addEventListener('click', function () {
      if (state.query) runSearch(state.query);
    });

    document.addEventListener('keydown', function (event) {
      var key = typeof event.key === 'string' ? event.key : '';

      if ((event.metaKey || event.ctrlKey) && !event.altKey && key.toLowerCase() === 'k') {
        event.preventDefault();
        focusSearch(true);
        return;
      }

      if (key === '/' && !event.metaKey && !event.ctrlKey && !event.altKey && !isTypingTarget(event.target)) {
        event.preventDefault();
        focusSearch(true);
        return;
      }

      if (key === 'Escape') {
        if (!dom.helpPopover.hidden) {
          event.preventDefault();
          closeHelp(true);
          return;
        }
        if (document.activeElement === dom.searchInput) {
          dom.searchInput.blur();
        }
      }
    });

    window.addEventListener('resize', function () {
      if (!dom.helpPopover.hidden) fitHelpPopover();
    });

    window.addEventListener('pagehide', abortActiveRequest);
  }

  /* -------------------------------------------------------------------------
     Boot
     ------------------------------------------------------------------------- */

  function cacheDom() {
    dom.app = $('app');
    dom.appMain = $('app-main');
    dom.metaThemeColor = $('meta-theme-color');
    dom.themeToggle = $('theme-toggle');
    dom.langSelect = $('lang-select');
    dom.demoBadge = $('demo-badge');
    dom.demoNotice = $('demo-notice');
    dom.demoNoticeAction = $('demo-notice-action');
    dom.pagination = $('pagination');
    dom.pagerPrev = $('pager-prev');
    dom.pagerNext = $('pager-next');
    dom.pagerPages = $('pager-pages');
    dom.pagerStatus = $('pager-status');
    dom.searchForm = $('search-form');
    dom.searchInput = $('search-input');
    dom.searchClear = $('search-clear');
    dom.searchSubmit = $('search-submit');
    dom.shortcutHint = $('shortcut-hint');
    dom.helpButton = $('help-button');
    dom.helpPopover = $('help-popover');
    dom.helpClose = $('help-close');
    dom.operatorList = $('operator-list');
    dom.opChips = document.querySelector('.op-chips');
    dom.setupSection = $('setup-section');
    dom.apiNotice = $('api-notice');
    dom.noticeTitle = $('notice-title');
    dom.noticeBody = $('notice-body');
    dom.noticeOffline = $('notice-offline');
    dom.noticeAction = $('notice-action');
    dom.noticeClose = $('notice-close');
    dom.emptyState = $('empty-state');
    dom.loading = $('loading');
    dom.resultsList = $('results-list');
    dom.noResults = $('no-results');
    dom.noResultsTitle = $('no-results-title');
    dom.errorState = $('error-state');
    dom.errorTitle = $('error-title');
    dom.errorMessage = $('error-message');
    dom.retryButton = $('retry-button');
    dom.suggestions = $('suggestions');
    dom.resultsRegion = $('results-region');
    dom.resultsHead = $('results-head');
    dom.resultsCount = $('results-count');
    dom.resultsQuery = $('results-query');
    dom.resultsTime = $('results-time');
    dom.liveStatus = $('live-status');
    dom.footerHint = $('footer-hint');
  }

  function init() {
    cacheDom();

    var params = urlParams();
    state.isMac = detectMac();
    state.shortcutKey = state.isMac ? '⌘K' : 'Ctrl K';

    var urlTheme = params.get('theme');
    var storedTheme = safeStorageGet(STORAGE_THEME);
    state.themePinned = urlTheme === 'light' || urlTheme === 'dark'
      || storedTheme === 'light' || storedTheme === 'dark';

    state.lang = initialLanguage();
    state.theme = initialTheme();

    renderLanguageOptions();
    applyLanguage(state.lang, { persist: false, syncUrl: false });
    applyTheme(state.theme, { persist: false, syncUrl: false });
    bindEvents();
    watchSystemTheme();

    setStatus('pristine');
    updateResultsHeader();
    setSubmitDisabled(false);
    updateClearButton();

    var initialQuery = cleanString(params.get('q'));
    if (initialQuery) {
      setInputValue(initialQuery.slice(0, 128));
      runSearch(initialQuery);
    }

    loadHealth();
    document.documentElement.classList.add('app-ready');
  }

  try {
    init();
  } catch (error) {
    document.documentElement.classList.add('app-ready');
    if (window.console && typeof window.console.error === 'function') {
      window.console.error('DeepSeek Search failed to initialise', error);
    }
  }
})();