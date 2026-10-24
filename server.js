'use strict';

/**
 * DeepSeek Search — tiny dependency-free web app.
 *
 * Serves the static UI from ./public and proxies search requests to the
 * DeepSeek Search API. The API key never leaves the server process.
 *
 * Usage:
 *   DEEPSEEK_API_KEY=sk-... npm start
 *   MOCK_SEARCH=1 npm start            # demo mode, no API key needed
 */

const http = require('node:http');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const { URL } = require('node:url');

const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, 'public');
const VERSION = '1.0.0';

// ---------------------------------------------------------------------------
// Environment
// ---------------------------------------------------------------------------

/** Minimal .env reader so the app stays dependency-free. */
function loadEnvFile(file) {
  let raw;
  try {
    raw = fs.readFileSync(file, 'utf8');
  } catch {
    return;
  }

  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const match = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(trimmed);
    if (!match) continue;

    const key = match[1];
    let value = match[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    } else {
      const comment = value.indexOf(' #');
      if (comment !== -1) value = value.slice(0, comment).trim();
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

// .env.local takes precedence over .env; real process env always wins.
loadEnvFile(path.join(ROOT, '.env.local'));
loadEnvFile(path.join(ROOT, '.env'));

function booleanEnv(value) {
  return /^(1|true|yes|on)$/i.test(String(value || '').trim());
}

const PORT = Number.parseInt(process.env.PORT || '3000', 10);
const HOST = process.env.HOST || '127.0.0.1';
const API_KEY = (process.env.DEEPSEEK_API_KEY || '').trim();
const API_BASE = (process.env.DEEPSEEK_API_BASE || 'https://api.deepseek.com').replace(/\/+$/, '');
const MOCK = booleanEnv(process.env.MOCK_SEARCH);
const UPSTREAM_TIMEOUT_MS = Number.parseInt(process.env.UPSTREAM_TIMEOUT_MS || '20000', 10);
const RATE_LIMIT = Number.parseInt(process.env.RATE_LIMIT_PER_MIN || '60', 10);
const CACHE_TTL_MS = Number.parseInt(process.env.CACHE_TTL_SECONDS || '60', 10) * 1000;

// ---------------------------------------------------------------------------
// Tiny helpers
// ---------------------------------------------------------------------------

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Frame-Options': 'DENY',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Content-Security-Policy': [
    "default-src 'self'",
    "img-src 'self' data:",
    "style-src 'self' 'unsafe-inline'",
    "script-src 'self' 'unsafe-inline'",
    "connect-src 'self'",
    "font-src 'self'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'"
  ].join('; ')
};

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json'
};

class ApiError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

function isAllowedCorsOrigin(origin) {
  if (!origin) return false;
  if (origin === 'null') return true;
  try {
    const parsed = new URL(origin);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
    return (
      parsed.hostname === '127.0.0.1' ||
      parsed.hostname === 'localhost' ||
      parsed.hostname === '::1' ||
      parsed.hostname === '[::1]'
    );
  } catch {
    return false;
  }
}

/** Allow local preview surfaces (file://, another localhost port) to call the API. */
function applyCors(req, res) {
  const origin = req.headers.origin;
  if (!isAllowedCorsOrigin(origin)) return;
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');
  res.setHeader('Access-Control-Allow-Private-Network', 'true');
  res.setHeader('Access-Control-Max-Age', '600');
}

function sendJson(res, status, payload, extraHeaders = {}) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    ...SECURITY_HEADERS,
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
    ...extraHeaders
  });
  res.end(body);
}

function sendError(res, error) {
  const status = error instanceof ApiError ? error.status : 500;
  const code = error instanceof ApiError ? error.code : 'internal_error';
  const message =
    error instanceof ApiError
      ? error.message
      : 'Something went wrong on the server. Please try again.';
  if (!(error instanceof ApiError)) console.error('[error]', error);
  sendJson(res, status, { error: { code, message } });
}

function readJsonBody(req, limitBytes = 64 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    let tooLarge = false;
    const chunks = [];

    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limitBytes) {
        tooLarge = true;
        return;
      }
      chunks.push(chunk);
    });

    req.on('end', () => {
      if (tooLarge) {
        reject(new ApiError(413, 'payload_too_large', 'Request body is too large.'));
        return;
      }
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw.trim()) {
        reject(new ApiError(400, 'invalid_request', 'Request body must be valid JSON.'));
        return;
      }
      try {
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
          reject(new ApiError(400, 'invalid_request', 'Request body must be a JSON object.'));
          return;
        }
        resolve(parsed);
      } catch {
        reject(new ApiError(400, 'invalid_request', 'Request body must be valid JSON.'));
      }
    });

    req.on('error', () => {
      reject(new ApiError(400, 'invalid_request', 'Could not read the request body.'));
    });
  });
}

function isHttpUrl(value) {
  try {
    const url = new URL(String(value));
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

function safeText(value, maxLength) {
  return typeof value === 'string' ? value.slice(0, maxLength) : '';
}

function normalizeDate(value) {
  if (typeof value !== 'string' || !value) return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

function normalizeResult(result) {
  if (!result || typeof result !== 'object') return null;
  if (!isHttpUrl(result.url)) return null;

  const authorityValue = Number(result.authority);
  const authority = Number.isFinite(authorityValue)
    ? Math.round(clampNumber(authorityValue, -1, 4, -1))
    : -1;

  return {
    rerank_score: Number(clampNumber(result.rerank_score, 0, 3, 0).toFixed(3)),
    title: safeText(result.title, 500).trim() || String(result.url),
    url: String(result.url),
    snippet: safeText(result.snippet, 2000),
    summary: safeText(result.summary, 4000),
    content: '',
    site_name: safeText(result.site_name, 200).trim() || null,
    site_icon: isHttpUrl(result.site_icon) ? String(result.site_icon) : null,
    date: normalizeDate(result.date),
    authority
  };
}

// ---------------------------------------------------------------------------
// Rate limiting and response cache (single-process, in-memory)
// ---------------------------------------------------------------------------

const rateBuckets = new Map();
const WINDOW_MS = 60_000;

function checkRateLimit(ip) {
  const now = Date.now();
  const bucket = rateBuckets.get(ip);
  if (!bucket || bucket.resetAt <= now) {
    rateBuckets.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return { allowed: true, retryAfter: 0 };
  }
  if (bucket.count >= RATE_LIMIT) {
    return { allowed: false, retryAfter: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)) };
  }
  bucket.count += 1;
  return { allowed: true, retryAfter: 0 };
}

setInterval(() => {
  const now = Date.now();
  for (const [ip, bucket] of rateBuckets) {
    if (bucket.resetAt <= now) rateBuckets.delete(ip);
  }
}, 5 * 60_000).unref();

const searchCache = new Map();
const CACHE_MAX_ENTRIES = 200;

function getCached(key) {
  const entry = searchCache.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    searchCache.delete(key);
    return null;
  }
  return entry.payload;
}

function setCached(key, payload) {
  if (searchCache.size >= CACHE_MAX_ENTRIES) {
    searchCache.delete(searchCache.keys().next().value);
  }
  searchCache.set(key, { payload, expiresAt: Date.now() + CACHE_TTL_MS });
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

const MOCK_RESULTS = [
  {
    rerank_score: 2.91,
    title: 'DeepSeek Search API: real-time web results for agents',
    url: 'https://api-docs.deepseek.com/guides/search',
    snippet:
      'The Search endpoint returns structured web results with snippets, summaries, publication dates and authority scores — built for agents and RAG applications.',
    summary:
      'DeepSeek Search is a read-only JSON API with the same Bearer authentication as the DeepSeek API. Results include title, URL, snippet, long summary, site metadata, publication date and two quality signals: rerank_score and authority.',
    site_name: 'DeepSeek API Docs',
    site_icon: 'https://api-docs.deepseek.com/favicon.ico',
    date: '2026-10-18T09:00:00.000Z',
    authority: 4
  },
  {
    rerank_score: 2.74,
    title: 'DeepSeek V4 model release: tools, long context, and what changes',
    url: 'https://techcrunch.com/2026/10/16/deepseek-v4-release/',
    snippet:
      'DeepSeek has released V4, its latest flagship model, with stronger tool use, longer context and a refreshed API surface for agent workflows.',
    summary:
      'The release focuses on reliable tool calling, a larger context window and lower latency. Developers can try it through the existing DeepSeek API without changing their integration.',
    site_name: 'TechCrunch',
    site_icon: 'https://techcrunch.com/favicon.ico',
    date: '2026-10-16T06:30:00.000Z',
    authority: 3
  },
  {
    rerank_score: 2.58,
    title: 'deepseek-ai / DeepSeek-V4 — model card and benchmarks',
    url: 'https://github.com/deepseek-ai/DeepSeek-V4',
    snippet:
      'Official model card, evaluation results, deployment notes and an example application that pairs DeepSeek V4 with the Search API.',
    summary:
      'The repository includes benchmark tables, recommended sampling parameters, an OpenAI-compatible quickstart and a small agent demo that cites web sources returned by DeepSeek Search.',
    site_name: 'GitHub',
    site_icon: 'https://github.com/favicon.ico',
    date: '2026-10-15T12:00:00.000Z',
    authority: 4
  },
  {
    rerank_score: 2.22,
    title: 'Ask HN: How are you using DeepSeek Search in production?',
    url: 'https://news.ycombinator.com/item?id=42881001',
    snippet:
      'Teams share how they combine query rewriting, search counts and rerank scores to build citation-first assistants without sacrificing latency.',
    summary:
      'A community thread covering practical patterns: caching frequent queries, preferring high-authority results, and showing snippets rather than full page content when a compact answer is enough.',
    site_name: 'Hacker News',
    site_icon: 'https://news.ycombinator.com/favicon.ico',
    date: '2026-10-14T18:45:00.000Z',
    authority: 2
  },
  {
    rerank_score: 1.98,
    title: 'A practical guide to agentic search with citation-ready results',
    url: 'https://thegradient.pub/agentic-search-guide/',
    snippet:
      'How to design a retrieval loop that searches, reads and cites — including when to use Search versus Fetch and how to present provenance.',
    summary:
      'This guide walks through intent detection, query construction and result selection, with examples of surfacing source quality to users instead of relying on a single relevance score.',
    site_name: 'The Gradient',
    site_icon: null,
    date: '2026-10-11T08:15:00.000Z',
    authority: 2
  },
  {
    rerank_score: 1.71,
    title: 'Building RAG pipelines with the Search and Fetch APIs',
    url: 'https://medium.com/@datascience/building-rag-with-deepseek-search-9f3c2a1',
    snippet:
      'A hands-on walkthrough: call Search for candidate URLs, fetch Markdown with Fetch, chunk responsibly and keep citations attached through the pipeline.',
    summary:
      'Includes a small TypeScript example, notes on timeout and 429 handling, and advice on when full page content is worth the additional request.',
    site_name: 'Medium',
    site_icon: 'https://medium.com/favicon.ico',
    date: '2026-10-08T14:20:00.000Z',
    authority: 1
  },
  {
    rerank_score: 1.44,
    title: 'DeepSeek search benchmark: relevance, freshness and latency',
    url: 'https://huggingface.co/blog/deepseek-search-benchmark',
    snippet:
      'An independent benchmark of search APIs across news, documentation and long-tail queries, measuring result quality and time to first useful result.',
    summary:
      'The evaluation highlights strong performance on fresh news and technical documentation, with authority scores useful for filtering low-quality pages.',
    site_name: 'Hugging Face',
    site_icon: 'https://huggingface.co/favicon.ico',
    date: '2026-10-05T10:10:00.000Z',
    authority: 2
  },
  {
    rerank_score: 1.12,
    title: 'Search syntax cheat sheet: site, lang, after and before',
    url: 'https://example.com/deepseek-search-syntax',
    snippet:
      'Copy-ready examples for narrowing results by domain, language and date, plus how to exclude words and match exact phrases.',
    summary:
      'A compact reference for the query operators supported by DeepSeek Search, with tips on combining multiple operators in one query.',
    site_name: 'Example',
    site_icon: null,
    date: '2026-09-28T16:00:00.000Z',
    authority: 1
  }
];

function mockSearch(query, count) {
  const results = MOCK_RESULTS.slice(0, Math.min(count, MOCK_RESULTS.length));
  return { results, query: query.trim(), count, mock: true, cached: false };
}

function mapUpstreamError(status, data) {
  const upstreamMessage =
    data && data.error && typeof data.error.message === 'string'
      ? data.error.message.slice(0, 500)
      : '';

  switch (status) {
    case 400:
      return new ApiError(400, 'invalid_request', upstreamMessage || 'The search query was rejected.');
    case 401:
      return new ApiError(502, 'invalid_api_key', 'The DeepSeek API key is invalid. Update DEEPSEEK_API_KEY and restart the server.');
    case 402:
      return new ApiError(502, 'insufficient_balance', 'The DeepSeek account has insufficient balance.');
    case 403:
      return new ApiError(502, 'forbidden', 'The request was rejected by the search service.');
    case 404:
      return new ApiError(404, 'not_found', 'The search service could not find a result.');
    case 408:
      return new ApiError(504, 'timeout', 'The search request timed out. Please try again.');
    case 413:
      return new ApiError(502, 'upstream_error', 'The search request was too large.');
    case 429:
      return new ApiError(429, 'rate_limited', 'Search is momentarily rate limited. Please wait a moment and try again.');
    default:
      if (status >= 500) {
        return new ApiError(502, 'upstream_error', 'The search service is temporarily unavailable. Please try again.');
      }
      return new ApiError(502, 'upstream_error', upstreamMessage || 'The search request failed.');
  }
}

async function searchUpstream(query, count) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);

  try {
    const response = await fetch(API_BASE + '/v1/tools/search', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + API_KEY,
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'User-Agent': 'deepseek-search-web/' + VERSION
      },
      body: JSON.stringify({
        query,
        count,
        need_content: false
      }),
      signal: controller.signal
    });

    const text = await response.text();
    let data = null;
    let parsed = false;
    if (text) {
      try {
        data = JSON.parse(text);
        parsed = true;
      } catch {
        parsed = false;
      }
    }

    if (!response.ok) throw mapUpstreamError(response.status, data);

    if (!parsed || !data || typeof data !== 'object' || !Array.isArray(data.results)) {
      throw new ApiError(
        502,
        'upstream_error',
        'The search service returned an unreadable response. Please try again.'
      );
    }

    const results = data.results.map(normalizeResult).filter(Boolean);
    return { results, query, count, mock: false };
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (error && error.name === 'AbortError') {
      throw new ApiError(504, 'timeout', 'The search request timed out. Please try again.');
    }
    throw new ApiError(502, 'upstream_error', 'Could not reach the DeepSeek Search API. Check your connection and try again.');
  } finally {
    clearTimeout(timer);
  }
}

async function handleSearch(req, res) {
  const ip = req.socket.remoteAddress || 'unknown';
  const rate = checkRateLimit(ip);
  if (!rate.allowed) {
    sendError(
      res,
      new ApiError(429, 'rate_limited', 'Too many searches from this browser. Please wait a few seconds.')
    );
    return;
  }

  const body = await readJsonBody(req);
  const query = typeof body.query === 'string' ? body.query.trim() : '';
  const queryLength = [...query].length;
  if (queryLength < 1 || queryLength > 128) {
    throw new ApiError(400, 'invalid_request', 'Query must be between 1 and 128 characters.');
  }

  const count = body.count === undefined ? 10 : body.count;
  if (!Number.isInteger(count) || count < 1 || count > 50) {
    throw new ApiError(400, 'invalid_request', 'Count must be an integer between 1 and 50.');
  }

  if (!MOCK && !API_KEY) {
    throw new ApiError(
      503,
      'missing_api_key',
      'The server is missing DEEPSEEK_API_KEY. Add it to .env and restart, or start with MOCK_SEARCH=1.'
    );
  }

  const cacheKey = JSON.stringify({ query, count });
  const cached = getCached(cacheKey);
  if (cached) {
    sendJson(res, 200, { ...cached, cached: true });
    return;
  }

  const startedAt = Date.now();
  let payload;
  if (MOCK) {
    await new Promise((resolve) => setTimeout(resolve, 380));
    payload = mockSearch(query, count);
  } else {
    payload = await searchUpstream(query, count);
  }

  payload = {
    ...payload,
    tookMs: Date.now() - startedAt
  };
  setCached(cacheKey, payload);
  sendJson(res, 200, payload);
}

// ---------------------------------------------------------------------------
// Static files
// ---------------------------------------------------------------------------

async function serveStatic(req, res, pathname) {
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    sendJson(res, 400, { error: { code: 'invalid_request', message: 'Malformed URL.' } });
    return;
  }

  if (decoded === '/' || decoded === '') decoded = '/index.html';

  const normalized = path.posix.normalize(decoded);
  let target = path.resolve(PUBLIC_DIR, '.' + normalized);
  if (target !== PUBLIC_DIR && !target.startsWith(PUBLIC_DIR + path.sep)) {
    sendJson(res, 403, { error: { code: 'forbidden', message: 'Forbidden.' } });
    return;
  }

  let stat;
  try {
    stat = await fsp.stat(target);
    if (stat.isDirectory()) {
      target = path.join(target, 'index.html');
      stat = await fsp.stat(target);
    }
  } catch {
    sendJson(res, 404, { error: { code: 'not_found', message: 'Not found.' } });
    return;
  }

  if (!stat.isFile()) {
    sendJson(res, 404, { error: { code: 'not_found', message: 'Not found.' } });
    return;
  }

  const extension = path.extname(target).toLowerCase();
  const contentType = MIME_TYPES[extension] || 'application/octet-stream';
  const cacheControl = extension === '.html' ? 'no-cache' : 'public, max-age=3600';

  res.writeHead(200, {
    ...SECURITY_HEADERS,
    'Content-Type': contentType,
    'Content-Length': stat.size,
    'Cache-Control': cacheControl
  });

  if (req.method === 'HEAD') {
    res.end();
    return;
  }

  const stream = fs.createReadStream(target);
  stream.on('error', () => res.destroy());
  stream.pipe(res);
}

// ---------------------------------------------------------------------------
// HTTP server
// ---------------------------------------------------------------------------

const server = http.createServer(async (req, res) => {
  let pathname = '/';
  try {
    const requestUrl = new URL(req.url || '/', 'http://localhost');
    pathname = requestUrl.pathname;
  } catch {
    pathname = '/';
  }

  try {
    if (pathname.startsWith('/api/')) applyCors(req, res);

    if (req.method === 'OPTIONS' && pathname.startsWith('/api/')) {
      res.writeHead(204, { ...SECURITY_HEADERS, 'Content-Length': '0' });
      res.end();
      return;
    }

    /* Dynamic config for pages served by this server: use same-origin APIs. */
    if (pathname === '/runtime-config.js') {
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        sendJson(res, 405, { error: { code: 'method_not_allowed', message: 'Use GET.' } }, { Allow: 'GET, HEAD' });
        return;
      }
      const body = 'window.__DS_RUNTIME__={servedByApp:true,apiBase:""};\n';
      res.writeHead(200, {
        ...SECURITY_HEADERS,
        'Content-Type': 'text/javascript; charset=utf-8',
        'Content-Length': Buffer.byteLength(body),
        'Cache-Control': 'no-store'
      });
      res.end(req.method === 'HEAD' ? undefined : body);
      return;
    }

    if (pathname === '/api/health') {
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        sendJson(res, 405, { error: { code: 'method_not_allowed', message: 'Use GET.' } }, { Allow: 'GET, HEAD' });
        return;
      }
      sendJson(res, 200, {
        ok: true,
        apiKeyConfigured: Boolean(API_KEY),
        mock: MOCK,
        version: VERSION
      });
      return;
    }

    if (pathname === '/api/search') {
      if (req.method !== 'POST') {
        sendJson(res, 405, { error: { code: 'method_not_allowed', message: 'Use POST.' } }, { Allow: 'POST' });
        return;
      }
      await handleSearch(req, res);
      return;
    }

    if (pathname.startsWith('/api/')) {
      sendJson(res, 404, { error: { code: 'not_found', message: 'Unknown API route.' } });
      return;
    }

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      sendJson(res, 405, { error: { code: 'method_not_allowed', message: 'Use GET.' } }, { Allow: 'GET, HEAD' });
      return;
    }

    await serveStatic(req, res, pathname);
  } catch (error) {
    if (!res.headersSent) {
      sendError(res, error);
    } else {
      res.destroy();
    }
  }
});

server.on('clientError', (error, socket) => {
  if (socket.writable) socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n');
});

server.listen(PORT, HOST, () => {
  const address = 'http://' + (HOST === '0.0.0.0' ? '127.0.0.1' : HOST) + ':' + PORT;
  let mode = 'live · API key configured';
  if (MOCK) mode = 'demo · mock results (no API calls)';
  else if (!API_KEY) mode = 'live · API key MISSING (set DEEPSEEK_API_KEY)';
  console.log('');
  console.log('  DeepSeek Search  ' + VERSION);
  console.log('  ' + address);
  console.log('  mode: ' + mode);
  console.log('');
});

function shutdown(signal) {
  console.log('\n  ' + signal + ' received, shutting down…');
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 3000).unref();
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('unhandledRejection', (error) => {
  console.error('[unhandledRejection]', error);
});