#!/bin/bash

# Quick script to rebuild and deploy frontend on server
# Run this ON THE SERVER

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}🔨 Rebuilding Frontend${NC}"
echo "======================================"
echo ""

# Find project directory
if [ -d "~/lomi_mini/frontend" ]; then
    PROJECT_DIR="~/lomi_mini"
elif [ -d "./frontend" ]; then
    PROJECT_DIR="."
else
    echo -e "${RED}❌ Error: Could not find frontend directory${NC}"
    echo "Please run this script from the project root"
    exit 1
fi

cd "$PROJECT_DIR/frontend"
echo -e "${BLUE}📁 Using directory: $(pwd)${NC}"
echo ""

# Pull latest code
echo -e "${YELLOW}Step 1: Pulling latest code...${NC}"
cd ..
git pull origin main
cd frontend
echo ""

# Install dependencies (if needed)
if [ ! -d "node_modules" ] || [ "package.json" -nt "node_modules" ]; then
    echo -e "${YELLOW}Step 2: Installing dependencies...${NC}"
    npm install
    echo ""
else
    echo -e "${GREEN}✅ Dependencies already installed${NC}"
    echo ""
fi

# Build
echo -e "${YELLOW}Step 3: Building frontend (Expo web export)...${NC}"
npm run build
echo ""

# Check if build succeeded
if [ ! -d "dist" ]; then
    echo -e "${RED}❌ Error: Build failed - dist directory not found${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Build complete!${NC}"
echo ""

# Deploy
echo -e "${YELLOW}Step 4: Deploying to /var/www/lomi-frontend...${NC}"
sudo mkdir -p /var/www/lomi-frontend
sudo cp -r dist/* /var/www/lomi-frontend/
sudo chown -R www-data:www-data /var/www/lomi-frontend
sudo chmod -R 755 /var/www/lomi-frontend
echo ""

# Reload Caddy
echo -e "${YELLOW}Step 5: Reloading Caddy...${NC}"
sudo systemctl reload caddy
echo ""

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "${GREEN}✅ Frontend rebuilt and deployed!${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo -e "${BLUE}Next steps:${NC}"
echo "  1. Clear browser cache or use incognito mode"
echo "  2. Upload photos again"
echo "  3. Check browser console for: '📤 Calling upload-complete endpoint'"
echo "  4. Run ./debug-moderation-flow.sh to verify moderation is working"
echo ""

