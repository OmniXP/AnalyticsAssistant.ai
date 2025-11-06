// Shim to satisfy legacy imports from files that still reference "lib/cookies"
// Forwards to the canonical implementation under /web/pages/api/_core
module.exports = require('./web/pages/api/_core/cookies');
