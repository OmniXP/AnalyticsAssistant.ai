// prisma.config.js
const path = require('path');

// Load .env files from multiple locations (root and web/.env.local)
try {
  require('dotenv').config({ path: path.join(__dirname, '.env') });
} catch (e) {
  // .env doesn't exist in root
}

try {
  require('dotenv').config({ path: path.join(__dirname, 'web/.env.local') });
} catch (e) {
  // web/.env.local doesn't exist
}

module.exports = {
  schema: 'prisma/schema.prisma',    // Point to your schema file
};
