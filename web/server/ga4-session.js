// Shim to satisfy legacy imports from files that still reference "server/ga4-session"
// Forwards to the canonical implementation under /web/pages/api/_core
module.exports = require('./web/pages/api/_core/ga4-session');
