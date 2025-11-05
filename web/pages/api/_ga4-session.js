// pages/api/_ga4-session.js
// Resilient re-export for server/ga4-session regardless of where you've put it.
// Tries common locations: /server/ga4-session.js, /web/server/ga4-session.js.

function tryRequire(p) {
  try { return require(p); } catch (_) { return null; }
}

let mod =
  tryRequire('../../server/ga4-session') ||
  tryRequire('../../../server/ga4-session') ||          // alt depth
  tryRequire('../../../../server/ga4-session') ||      // monorepo-ish
  tryRequire('../../web/server/ga4-session') ||
  tryRequire('../../../web/server/ga4-session') ||
  tryRequire('../../../../web/server/ga4-session');

if (!mod) {
  throw new Error('Cannot locate server/ga4-session. Expected at /server/ga4-session.js or /web/server/ga4-session.js');
}

// If someone used default export, normalise to named.
if (mod.default && typeof mod.getBearerForRequest !== 'function' && typeof mod.default.getBearerForRequest === 'function') {
  mod = mod.default;
}

module.exports = mod;
