'use strict';
/*
 * QA-only stub of the DeepSeek Search upstream.
 * Listens on 4323. Records every request so the QA harness can assert
 * the Authorization header, body shape and count forwarding.
 * Behavior is selected by a marker inside the query:
 *   stub-401 / stub-429 / stub-500 -> corresponding upstream status
 *   stub-malformed -> HTTP 200 with non-JSON body
 *   stub-empty -> HTTP 200 with empty results
 *   stub-badurls -> HTTP 200 with javascript:/data: URLs and XSS payloads
 * Everything else -> normal 3-result JSON.
 */
const http = require('node:http');

const requests = [];

const NORMAL_RESULTS = [
  {
    rerank_score: 2.91,
    title: 'Stub result one: DeepSeek Search docs',
    url: 'https://example.com/docs/one',
    snippet: 'First stub snippet about the DeepSeek Search API.',
    summary: 'First stub long summary.',
    site_name: 'Example Docs',
    site_icon: 'https://example.com/favicon.ico',
    date: '2026-10-18T09:00:00.000Z',
    authority: 4
  },
  {
    rerank_score: 2.1,
    title: 'Stub result two',
    url: 'https://example.org/two',
    snippet: 'Second stub snippet.',
    summary: 'Second stub long summary.',
    site_name: 'Example Org',
    site_icon: null,
    date: '2026-10-16T06:30:00.000Z',
    authority: 3
  },
  {
    rerank_score: 1.2,
    title: 'Stub result three',
    url: 'http://example.net/three',
    snippet: 'Third stub snippet.',
    summary: '',
    site_name: 'Example Net',
    site_icon: null,
    date: null,
    authority: 1
  }
];

function sendJson(res, status, payload, raw) {
  const body = raw !== undefined ? raw : JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body)
  });
  res.end(body);
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url || '/', 'http://127.0.0.1:4323');

  if (url.pathname === '/__requests') {
    return sendJson(res, 200, { requests });
  }
  if (url.pathname === '/__reset') {
    requests.length = 0;
    return sendJson(res, 200, { ok: true });
  }
  if (url.pathname !== '/v1/tools/search' || req.method !== 'POST') {
    return sendJson(res, 404, { error: { message: 'stub: not found' } });
  }

  let raw = '';
  req.on('data', (c) => { raw += c; });
  req.on('end', () => {
    let body = null;
    try { body = raw ? JSON.parse(raw) : null; } catch { body = null; }
    const query = body && typeof body.query === 'string' ? body.query : '';
    requests.push({
      method: req.method,
      url: req.url,
      headers: {
        authorization: req.headers.authorization || null,
        'content-type': req.headers['content-type'] || null,
        'user-agent': req.headers['user-agent'] || null,
        accept: req.headers.accept || null
      },
      body
    });

    if (query.includes('stub-402')) {
      return sendJson(res, 402, { error: { message: 'stub insufficient balance' } });
    }
    if (query.includes('stub-403')) {
      return sendJson(res, 403, { error: { message: 'stub forbidden' } });
    }
    if (query.includes('stub-malformed-500')) {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      return res.end('<html>upstream exploded</html>');
    }
    if (query.includes('stub-notarray')) {
      return sendJson(res, 200, { results: 'not-an-array', query });
    }
    if (query.includes('stub-401')) {
      return sendJson(res, 401, { error: { message: 'stub unauthorized' } });
    }
    if (query.includes('stub-429')) {
      return sendJson(res, 429, { error: { message: 'stub rate limited' } });
    }
    if (query.includes('stub-500')) {
      return sendJson(res, 500, { error: { message: 'stub exploded' } });
    }
    if (query.includes('stub-malformed')) {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      return res.end('<html>not json at all</html>');
    }
    if (query.includes('stub-empty')) {
      return sendJson(res, 200, { results: [], query });
    }
    if (query.includes('stub-badurls')) {
      return sendJson(res, 200, {
        results: [
          {
            title: '<img src=x onerror=window.__pwned=1>Bad title</img>',
            url: 'javascript:window.__pwned=2',
            snippet: '<svg onload=window.__pwned=3>',
            summary: '<script>window.__pwned=4<\/script>',
            site_name: '<img src=x onerror=window.__pwned=5>',
            site_icon: 'data:text/html,<script>window.__pwned=6<\/script>',
            date: '2026-10-01T00:00:00.000Z',
            authority: 4,
            rerank_score: 2
          },
          {
            title: 'Valid https result',
            url: 'https://example.com/safe',
            snippet: 'safe snippet',
            summary: 'safe summary',
            site_name: 'Safe',
            site_icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" onload="window.__pwned=7"></svg>',
            date: '2026-10-01T00:00:00.000Z',
            authority: 2,
            rerank_score: 1
          },
          {
            title: 'Valid http result with </p> markup',
            url: 'http://example.com/plain',
            snippet: '<p>hello</p>',
            summary: '',
            site_name: 'Plain',
            site_icon: 'https://example.com/icon.png',
            date: null,
            authority: 1,
            rerank_score: 0.5
          }
        ],
        query
      });
    }

    return sendJson(res, 200, { results: NORMAL_RESULTS, query });
  });
});

server.listen(4323, '127.0.0.1', () => {
  console.log('stub upstream listening on http://127.0.0.1:4323');
});
