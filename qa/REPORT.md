# QA Report — DeepSeek Search

**Date:** 2026-10-24  
**Verdict:** PASS — ready for local use.  
**Scope:** dependency-free Node server + flat minimal frontend, mock mode, stubbed live-proxy mode, and a final real-key live smoke test (the key is not included in the repo).

## Environment

- macOS, Node.js v24.19.0, Google Chrome 154 headless via `puppeteer-core`.
- App server: `MOCK_SEARCH=1 PORT=4321 node server.js`.
- Missing-key server: `PORT=4322 node server.js`.
- Live-proxy path: stub upstream on `4323`, app on `4324` with `DEEPSEEK_API_KEY=test-key` and `DEEPSEEK_API_BASE=http://127.0.0.1:4323`.

## Final checks

| Area | Result | Evidence |
| --- | --- | --- |
| Search API contract, validation, static routes, traversal protection | PASS | `api-results.json` plus final curl checks |
| Live proxy auth, payload shape, URL sanitisation, key never exposed | PASS | stub upstream + API tests |
| Real DeepSeek Search with configured key (`mock:false`, query-specific results) | PASS | two distinct live queries returned different result sets |
| Malformed upstream response (HTTP 200 non-JSON / missing `results`) | PASS | now returns `502 upstream_error` |
| Browser search flow: skeleton → results, URL state, clear, copy link, summary expand/collapse | PASS | final regression |
| Pagination: 10 results per page, up to 5 pages from one 50-result API request, localized controls, page reset on new search | PASS | live paging verified at 1440 and 390 widths |
| Help dialog: 8 operators, embedded scrolling, Escape/focus return, no setup section in demo mode | PASS | `screenshots/final-help-desktop-1000.png`, `final-help-mobile-1000.png` |
| Missing key: notice, setup help focused on setup, localized error | PASS | `screenshots/final-missing-key.png` |
| Themes: light/dark, persistence, system default, URL override | PASS | final regression |
| Languages: zh-CN / en / ja / ko, dates, HTML lang, title, URL state, persistence | PASS | final regression |
| Responsive: 1440×1000, 1024×768, 390×844, 360px, 320px, no horizontal overflow, theme toggle visible | PASS | final regression + screenshots |
| Accessibility: labels, headings, focus-visible, skip link, aria-live, reduced motion | PASS | manual DOM/keyboard/contrast checks |
| Security: text-only DOM rendering, http(s)-only links, `rel=noopener noreferrer`, CSP, no external HTTP requests | PASS | security suite; the only captured 'external' URLs were inline `data:image/svg+xml` background tiles |
| Performance: 5 local requests, no hanging network idle, no remote favicons | PASS | visual/perf suite |

Final browser regression: **18/19 product checks passed**; the single flagged check was a false positive in the test harness (it classified inline `data:` SVG backgrounds as external requests). No product failures.

## Design revision

- Removed the macOS-specific visual language (traffic lights, frosted window, translucency, app-window chrome) and replaced it with a flat product-style layout: solid backgrounds, restrained borders, flat controls, and a divider-based results list. Multi-language switching and light/dark mode are unchanged. Final screenshots were refreshed after this change.
- Header/footer refined again per feedback: removed the top rule, the "DeepSeek Search" wordmark and the brand dot. The top bar now contains only the language/theme controls. The footer rule and the right-side shortcut hint were removed; the footer keeps the API attribution on the left.

## Defects found during QA and fixed

1. **Malformed upstream 200 response was accepted as empty results.**
   - Repro: stub returns HTTP 200 with a non-JSON body.
   - Expected/actual now: `502 upstream_error` — fixed in `server.js`.
2. **Server-only error codes fell back to the generic network error.**
   - Repro: inject `invalid_api_key`, `insufficient_balance`, `forbidden`, `payload_too_large`, `internal_error`.
   - Fix: added localized titles/messages for all four languages and extended the client's known error codes.
3. **API setup section was always shown inside help, even in demo/configured mode.**
   - Fix: setup section is hidden unless the server reports a missing key; opening 'How to set up' reveals and scrolls to it.
4. **Help popover could extend past the app scroll area at short/mobile heights.**
   - Fix: dynamic max-height calculation on open/resize, `overscroll-behavior: contain`, visible scrollbar affordance.
5. **Responsive CSS tail was accidentally truncated during concurrent edits.**
   - Fix: restored the 760/560/380px media rules and reduced-motion/reduced-transparency blocks; verified 292/292 braces and browser layouts at 1440/1024/390/360/320. Theme toggle now stays visible at 390px in every language.
6. **Direct file/static preview showed "无法连接服务器".**
   - Cause: opening `public/index.html` via `file://` resolved `/api/search` to `file:///api/search`.
   - Fix: `runtime-config.js` provides a local API base for direct previews, the server exposes a same-origin config route when serving the app, and local-only CORS/preflight support was added. Verified file preview and normal served mode both return results.
7. **Remote favicons could render as empty transparent tiles.**
   - Fix: consistent monogram tiles; no third-party favicon requests.

## Screenshots

- `screenshots/final-desktop-light-empty.png`
- `screenshots/final-desktop-light-results.png`
- `screenshots/final-desktop-dark-results.png`
- `screenshots/final-help-desktop-1000.png`
- `screenshots/final-pagination.png`
- `screenshots/final-pagination-mobile.png`
- `screenshots/final-mobile-light-results.png`
- `screenshots/final-mobile-dark-results.png`
- `screenshots/final-help-mobile-1000.png`
- `screenshots/final-missing-key.png`

Earlier exploratory artifacts (`api-results.json`, `browser-*-results.json`, state screenshots) are kept beside this report as first-pass evidence.

## How to reproduce

```bash
# Demo mode (no key)
MOCK_SEARCH=1 PORT=4321 node server.js

# Missing-key UI
PORT=4322 node server.js

# Live mode (real key)
cp .env.example .env   # set DEEPSEEK_API_KEY
npm start
```

Automated harnesses live in `qa/` (`api-tests.mjs`, `browser-core.mjs`, `browser-visual.mjs`, `browser-states.mjs`, `browser-security.mjs`). The browser scripts expect `puppeteer-core` at `/tmp/ds-qa/node_modules/puppeteer-core` and Chrome at `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`.

## Residual risks

- Live search was verified with the user's configured key: `GET /api/health` reported `apiKeyConfigured:true, mock:false`, and distinct queries returned distinct real result sets. The key remains only in the git-ignored `.env` and is never sent to the browser.
- Results in mock mode are static sample data; the UI language does not translate publisher content.
- The upstream account QPS limit (100 Search/s) and per-request billing are documented in the project README.
- Help content scrolls on viewports shorter than ~900px; this is intentional and the scrollbar is visible.
- If deployed publicly, put the app behind authentication/reverse proxy; the built-in per-IP limit is a local safety net only.
