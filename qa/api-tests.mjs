/*
 * QA API test suite for DeepSeek Search.
 * Run: node qa/api-tests.mjs
 * Assumes: mock server on 4321, no-key server on 4322,
 *          live-proxy app on 4324 pointing at stub upstream 4323.
 */
const MOCK = 'http://127.0.0.1:4321';
const NOKEY = 'http://127.0.0.1:4322';
const STUB = 'http://127.0.0.1:4323';
const LIVE = 'http://127.0.0.1:4324';

const results = [];
function check(id, name, pass, detail) {
  results.push({ id, name, pass: !!pass, detail: String(detail).slice(0, 700) });
  console.log((pass ? 'PASS ' : 'FAIL ') + id + ' ' + name + (detail ? ' :: ' + String(detail).slice(0, 400) : ''));
}

async function req(base, path, options = {}) {
  const started = Date.now();
  const res = await fetch(base + path, options);
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* non-JSON */ }
  return { status: res.status, headers: res.headers, text, json, ms: Date.now() - started };
}
function postJson(base, path, body, raw) {
  return req(base, path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: raw !== undefined ? raw : JSON.stringify(body)
  });
}
const longQuery = (n, ch) => ch.repeat(n);

async function main() {
  let r;

  /* ---------------- A. Mock mode API ---------------- */
  r = await req(MOCK, '/api/health');
  check('A1', 'health mock mode', r.status === 200 && r.json && r.json.ok === true
    && r.json.apiKeyConfigured === false && r.json.mock === true && r.json.version === '1.0.0',
    'status=' + r.status + ' body=' + r.text);

  r = await postJson(MOCK, '/api/search', { query: 'DeepSeek V4', count: 10 });
  const j = r.json || {};
  const items = Array.isArray(j.results) ? j.results : [];
  const fieldChecks = items.every((it) => typeof it.title === 'string' && it.title.length > 0
    && typeof it.url === 'string' && /^https?:\/\//.test(it.url)
    && typeof it.snippet === 'string' && typeof it.summary === 'string'
    && typeof it.rerank_score === 'number'
    && (it.site_name === null || typeof it.site_name === 'string')
    && typeof it.authority === 'number');
  check('A2', 'valid search returns normalized results', r.status === 200 && j.query === 'DeepSeek V4'
    && j.count === 10 && j.mock === true && items.length === 8 && fieldChecks,
    'status=' + r.status + ' len=' + items.length + ' mock=' + j.mock + ' count=' + j.count + ' fields=' + fieldChecks);

  r = await postJson(MOCK, '/api/search', { query: 'search-a2b', count: 3 });
  check('A3', 'count forwarded/clamped in mock', r.status === 200 && r.json && r.json.count === 3,
    'status=' + r.status + ' body=' + r.text.slice(0, 150));

  r = await req(MOCK, '/api/search', { method: 'POST', headers: { 'Content-Type': 'application/json' } });
  check('A4', 'missing body -> 400 invalid_request', r.status === 400 && r.json && r.json.error.code === 'invalid_request',
    'status=' + r.status + ' body=' + r.text);

  r = await postJson(MOCK, '/api/search', null, 'not-json{');
  check('A5', 'non-JSON body -> 400 invalid_request', r.status === 400 && r.json && r.json.error.code === 'invalid_request',
    'status=' + r.status + ' body=' + r.text);

  r = await postJson(MOCK, '/api/search', { query: '' });
  check('A6', 'empty query -> 400', r.status === 400 && r.json && r.json.error.code === 'invalid_request',
    'status=' + r.status + ' body=' + r.text);

  r = await postJson(MOCK, '/api/search', { query: longQuery(129, 'a') });
  check('A7', '129-char query -> 400', r.status === 400 && r.json && r.json.error.code === 'invalid_request',
    'status=' + r.status + ' body=' + r.text.slice(0, 200));

  r = await postJson(MOCK, '/api/search', { query: 'count-zero', count: 0 });
  check('A8', 'count 0 -> 400', r.status === 400 && r.json && r.json.error.code === 'invalid_request',
    'status=' + r.status + ' body=' + r.text.slice(0, 200));

  r = await postJson(MOCK, '/api/search', { query: 'count-high', count: 51 });
  check('A9', 'count 51 -> 400', r.status === 400 && r.json && r.json.error.code === 'invalid_request',
    'status=' + r.status + ' body=' + r.text.slice(0, 200));

  r = await req(MOCK, '/api/search');
  check('A10', 'GET /api/search -> 405 Allow POST', r.status === 405 && r.headers.get('allow') === 'POST'
    && r.json && r.json.error.code === 'method_not_allowed', 'status=' + r.status + ' allow=' + r.headers.get('allow'));

  r = await postJson(MOCK, '/api/health', {});
  check('A11', 'POST /api/health -> 405 Allow GET', r.status === 405 && r.headers.get('allow') === 'GET, HEAD',
    'status=' + r.status + ' allow=' + r.headers.get('allow'));

  const statics = [
    ['A12', '/', 'text/html'],
    ['A13', '/styles.css', 'text/css'],
    ['A14', '/app.js', 'text/javascript'],
    ['A15', '/i18n.js', 'text/javascript'],
    ['A16', '/favicon.svg', 'image/svg+xml']
  ];
  for (const [id, path, type] of statics) {
    r = await req(MOCK, path);
    check(id, 'static ' + path + ' 200 ' + type, r.status === 200
      && (r.headers.get('content-type') || '').includes(type)
      && (r.headers.get('x-content-type-options') === 'nosniff')
      && Boolean(r.headers.get('content-security-policy')),
      'status=' + r.status + ' type=' + r.headers.get('content-type') + ' len=' + r.text.length);
  }
  r = await req(MOCK, '/index.html', { method: 'HEAD' });
  check('A17', 'HEAD /index.html 200', r.status === 200, 'status=' + r.status);

  const traversals = ['/../server.js', '/%2e%2e/server.js', '/%2e%2e%2fserver.js', '/..%2fserver.js',
    '/%2e%2e%5cserver.js', '/public/../server.js', '/%2e%2e%2f.env'];
  for (let i = 0; i < traversals.length; i += 1) {
    r = await req(MOCK, traversals[i]);
    const leaked = /require\('node:http'\)|DEEPSEEK_API_KEY=/.test(r.text) || r.text.includes('process.env');
    check('A18.' + (i + 1), 'traversal blocked ' + traversals[i], r.status >= 400 && !leaked,
      'status=' + r.status + ' body=' + r.text.slice(0, 120));
  }

  const allBodies = [];
  for (const [base, label] of [[MOCK, 'mock'], [NOKEY, 'nokey'], [LIVE, 'live']]) {
    const h = await req(base, '/api/health');
    const s = await postJson(base, '/api/search', { query: 'key-leak-' + label, count: 1 });
    allBodies.push(h.text, s.text);
  }
  const leakedKey = allBodies.some((body) => body.includes('test-key') || /sk-[A-Za-z0-9]{8,}/.test(body)
    || body.includes('DEEPSEEK_API_KEY='));
  check('A19', 'no API key value in health/search responses', !leakedKey,
    'bodies=' + allBodies.map((b) => b.slice(0, 80)).join(' | '));

  /* ---------------- B. Live proxy via stub ---------------- */
  await req(STUB, '/__reset');
  r = await postJson(LIVE, '/api/search', { query: 'stub-normal', count: 10 });
  let stubLog = await req(STUB, '/__requests');
  let last = stubLog.json && stubLog.json.requests && stubLog.json.requests[stubLog.json.requests.length - 1];
  check('B1', 'live proxy forwards auth header + need_content false + count',
    r.status === 200 && last && last.headers.authorization === 'Bearer test-key'
    && last.body && last.body.need_content === false && last.body.count === 10 && last.body.query === 'stub-normal',
    'status=' + r.status + ' upstream=' + JSON.stringify(last && { auth: last.headers.authorization, body: last.body }));

  r = await postJson(LIVE, '/api/search', { query: 'stub-badurls', count: 10 });
  const badItems = (r.json && r.json.results) || [];
  const urls = badItems.map((it) => it.url);
  const icons = badItems.map((it) => it.site_icon);
  const onlyHttp = urls.every((u) => /^https?:\/\//.test(u));
  const iconsSafe = icons.every((i) => i === null || /^https?:\/\//.test(i));
  check('B2', 'live proxy sanitizes unsafe result URLs/icons', r.status === 200 && onlyHttp && iconsSafe
    && badItems.length === 2, 'urls=' + JSON.stringify(urls) + ' icons=' + JSON.stringify(icons)
    + ' len=' + badItems.length);

  r = await postJson(LIVE, '/api/search', { query: 'stub-401', count: 5 });
  check('B3', 'upstream 401 -> invalid_api_key', r.status === 502 && r.json && r.json.error.code === 'invalid_api_key',
    'status=' + r.status + ' body=' + r.text);
  r = await postJson(LIVE, '/api/search', { query: 'stub-429', count: 5 });
  check('B4', 'upstream 429 -> rate_limited', r.status === 429 && r.json && r.json.error.code === 'rate_limited',
    'status=' + r.status + ' body=' + r.text);
  r = await postJson(LIVE, '/api/search', { query: 'stub-500', count: 5 });
  check('B5', 'upstream 500 -> upstream_error', r.status === 502 && r.json && r.json.error.code === 'upstream_error',
    'status=' + r.status + ' body=' + r.text);
  r = await postJson(LIVE, '/api/search', { query: 'stub-malformed-200', count: 5 });
  check('B6', 'malformed upstream (HTTP 200 non-JSON) -> upstream_error',
    r.status === 502 && r.json && r.json.error.code === 'upstream_error',
    'ACTUAL status=' + r.status + ' body=' + r.text.slice(0, 200));
  r = await postJson(LIVE, '/api/search', { query: 'stub-empty', count: 5 });
  check('B7', 'upstream empty results -> 200 []', r.status === 200 && r.json && Array.isArray(r.json.results)
    && r.json.results.length === 0, 'status=' + r.status + ' body=' + r.text);
  r = await req(LIVE, '/api/health');
  check('B8', 'live health apiKeyConfigured true mock false', r.status === 200 && r.json
    && r.json.apiKeyConfigured === true && r.json.mock === false, 'body=' + r.text);

  const liveSearch = await postJson(LIVE, '/api/search', { query: 'stub-browser-key', count: 2 });
  const liveHealth = await req(LIVE, '/api/health');
  check('B9', 'browser payload/health never contains key', !liveSearch.text.includes('test-key')
    && !liveHealth.text.includes('test-key') && !liveSearch.headers.get('authorization'),
    'search headers=' + JSON.stringify([...liveSearch.headers].filter(([k]) => /key|auth/i.test(k)))
    + ' searchBody=' + liveSearch.text.slice(0, 120));
  const index = await req(LIVE, '/');
  check('B10', 'served HTML/JS does not embed key', !index.text.includes('test-key')
    && !(await req(LIVE, '/app.js')).text.includes('test-key'),
    'index contains key=' + index.text.includes('test-key'));

  const passed = results.filter((x) => x.pass).length;
  const failed = results.filter((x) => !x.pass);
  console.log('\nAPI SUMMARY: ' + passed + ' pass / ' + failed.length + ' fail / ' + results.length + ' total');
  if (failed.length) console.log('FAILED: ' + failed.map((f) => f.id).join(', '));
  const fs = await import('node:fs/promises');
  await fs.writeFile(new URL('./api-results.json', import.meta.url),
    JSON.stringify({ generatedAt: new Date().toISOString(), results }, null, 2));
}

main().catch((error) => {
  console.error('HARNESS ERROR', error);
  process.exitCode = 1;
});
