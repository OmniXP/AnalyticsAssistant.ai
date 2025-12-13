#!/bin/bash
# ChatGPT Integration Setup Script
# This script helps you set up the ChatGPT integration step by step

set -e

echo "🚀 ChatGPT Integration Setup"
echo "============================"
echo ""

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Check if we're in the right directory
if [ ! -f "prisma/schema.prisma" ]; then
    echo -e "${RED}❌ Error: Please run this script from the project root directory${NC}"
    exit 1
fi

echo "Step 1: Database Migration"
echo "--------------------------"
echo "This will add chatgptUserId and chatgptConnectedAt fields to the User table."
read -p "Continue? (y/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Skipping migration..."
else
    echo "Running migration..."
    npx prisma migrate dev --name add_chatgpt_fields
    echo -e "${GREEN}✅ Migration completed${NC}"
    
    echo ""
    echo "Generating Prisma client..."
    npx prisma generate
    echo -e "${GREEN}✅ Prisma client generated${NC}"
fi

echo ""
echo "Step 2: Environment Variables"
echo "------------------------------"
echo "You need to add these to your .env file:"
echo ""
echo "CHATGPT_CLIENT_ID=your_client_id_here"
echo "CHATGPT_CLIENT_SECRET=your_client_secret_here"
echo "CHATGPT_REDIRECT_URI=https://analyticsassistant.ai/api/chatgpt/oauth/callback"
echo "PREMIUM_URL=https://analyticsassistant.ai/premium"
echo ""
read -p "Have you added these to your .env file? (y/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo -e "${YELLOW}⚠️  Please add the environment variables before continuing${NC}"
    echo "You can find detailed instructions in docs/chatgpt-integration-setup.md"
    exit 1
fi

echo ""
echo "Step 3: Verify Environment Variables"
echo "-------------------------------------"
if [ -f "web/.env.local" ]; then
    echo "Checking web/.env.local..."
    if grep -q "CHATGPT_CLIENT_ID" web/.env.local; then
        echo -e "${GREEN}✅ CHATGPT_CLIENT_ID found${NC}"
    else
        echo -e "${YELLOW}⚠️  CHATGPT_CLIENT_ID not found in web/.env.local${NC}"
    fi
    if grep -q "CHATGPT_CLIENT_SECRET" web/.env.local; then
        echo -e "${GREEN}✅ CHATGPT_CLIENT_SECRET found${NC}"
    else
        echo -e "${YELLOW}⚠️  CHATGPT_CLIENT_SECRET not found in web/.env.local${NC}"
    fi
else
    echo -e "${YELLOW}⚠️  web/.env.local not found. Make sure to set environment variables.${NC}"
fi

echo ""
echo "Step 4: Next Steps"
echo "-------------------"
echo "1. Configure your ChatGPT app in OpenAI platform:"
echo "   - Go to https://platform.openai.com"
echo "   - Set OAuth URLs (see docs/chatgpt-integration-setup.md)"
echo "   - Upload openapi.json from web/pages/api/chatgpt/openapi.json"
echo ""
echo "2. Test locally:"
echo "   - Start your dev server: cd web && npm run dev"
echo "   - Run test scripts: node scripts/test-chatgpt-auth.js"
echo ""
echo "3. Deploy to production:"
echo "   - Push your changes to git"
echo "   - Set environment variables in Vercel"
echo "   - Run migration in production: npx prisma migrate deploy"
echo ""
echo -e "${GREEN}✅ Setup script completed!${NC}"
echo ""
echo "For detailed instructions, see: docs/chatgpt-integration-setup.md"
