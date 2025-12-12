#!/usr/bin/env node
/**
 * Manual checklist to ensure web app is unaffected by ChatGPT integration.
 * Run: `node scripts/test-web-app-isolation.js`
 */

console.log("Web App Isolation Checklist");
console.log("- Web endpoints still work: /api/ga4/query, /api/ga4/properties, /api/insights/summarise");
console.log("- Web usage tracking unchanged (keys: usage:user:<email>:YYYY-MM)");
console.log("- ChatGPT usage keys are separate (usage:chatgpt:user:<email>:YYYY-MM)");
console.log("- GA4 tokens remain separate: ga4_tokens:<sid> vs chatgpt_ga4_tokens:<chatgptUserId>");
console.log("- No shared cookies required for ChatGPT endpoints");
console.log("- Rate limits on ChatGPT do NOT affect web app, and vice versa");
