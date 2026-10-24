/*
 * Fallback runtime configuration for direct static previews (file:// or a
 * plain static server). When the app is served by server.js, that server
 * overrides this route with { servedByApp: true } so API calls stay same-origin.
 */
window.__DS_RUNTIME__ = {
  servedByApp: false,
  apiBase: 'http://127.0.0.1:3000'
};
