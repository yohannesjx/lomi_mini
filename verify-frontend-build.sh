#!/bin/bash

# Verify frontend build includes upload-complete endpoint
# Run this ON THE SERVER

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}🔍 Verifying Frontend Build${NC}"
echo "======================================"
echo ""

FRONTEND_DIR="/var/www/lomi-frontend"
BUILD_DIR="frontend/dist"

echo -e "${YELLOW}Step 1: Check if frontend is deployed${NC}"
echo "─────────────────────────────────"
if [ ! -d "$FRONTEND_DIR" ]; then
    echo -e "${RED}❌ Frontend directory not found: $FRONTEND_DIR${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Frontend directory exists${NC}"
echo ""

echo -e "${YELLOW}Step 2: Check build files${NC}"
echo "─────────────────────────────────"
if [ ! -d "$BUILD_DIR" ]; then
    echo -e "${YELLOW}⚠️  Build directory not found: $BUILD_DIR${NC}"
    echo "   This means frontend hasn't been built yet."
    echo "   Run: ./rebuild-frontend.sh"
    exit 1
fi

echo -e "${GREEN}✅ Build directory exists${NC}"
echo ""

echo -e "${YELLOW}Step 3: Search for upload-complete in built files${NC}"
echo "─────────────────────────────────"

# Search in built JS files
FOUND_COUNT=0
if [ -d "$BUILD_DIR/_expo/static/js/web" ]; then
    # Expo web build structure
    JS_FILES=$(find "$BUILD_DIR/_expo/static/js/web" -name "*.js" 2>/dev/null | head -5)
elif [ -d "$BUILD_DIR/static/js" ]; then
    # Standard React build
    JS_FILES=$(find "$BUILD_DIR/static/js" -name "*.js" 2>/dev/null | head -5)
else
    # Try to find any JS files
    JS_FILES=$(find "$BUILD_DIR" -name "*.js" -type f 2>/dev/null | head -5)
fi

if [ -z "$JS_FILES" ]; then
    echo -e "${YELLOW}⚠️  No JS files found in build${NC}"
else
    echo "Searching in JS files..."
    for file in $JS_FILES; do
        if grep -q "upload-complete\|uploadComplete" "$file" 2>/dev/null; then
            echo -e "  ${GREEN}✅ Found in: $(basename $file)${NC}"
            FOUND_COUNT=$((FOUND_COUNT + 1))
        fi
    done
    
    if [ $FOUND_COUNT -eq 0 ]; then
        echo -e "${RED}❌ upload-complete NOT found in built files!${NC}"
        echo "   The build doesn't include the new endpoint."
        echo "   Frontend needs to be rebuilt."
    else
        echo -e "${GREEN}✅ Found upload-complete in $FOUND_COUNT file(s)${NC}"
    fi
fi
echo ""

echo -e "${YELLOW}Step 4: Check deployed files${NC}"
echo "─────────────────────────────────"
DEPLOYED_JS=$(find "$FRONTEND_DIR" -name "*.js" -type f 2>/dev/null | head -3)
if [ -z "$DEPLOYED_JS" ]; then
    echo -e "${RED}❌ No JS files found in deployed directory${NC}"
else
    echo "Checking deployed files..."
    FOUND_DEPLOYED=0
    for file in $DEPLOYED_JS; do
        if grep -q "upload-complete\|uploadComplete" "$file" 2>/dev/null; then
            echo -e "  ${GREEN}✅ Found in deployed: $(basename $file)${NC}"
            FOUND_DEPLOYED=$((FOUND_DEPLOYED + 1))
        fi
    done
    
    if [ $FOUND_DEPLOYED -eq 0 ]; then
        echo -e "${RED}❌ upload-complete NOT found in deployed files!${NC}"
        echo "   Deployed files are outdated."
        echo "   Run: ./rebuild-frontend.sh"
    else
        echo -e "${GREEN}✅ Found upload-complete in $FOUND_DEPLOYED deployed file(s)${NC}"
    fi
fi
echo ""

echo -e "${YELLOW}Step 5: Check file timestamps${NC}"
echo "─────────────────────────────────"
if [ -d "$FRONTEND_DIR" ]; then
    LATEST_FILE=$(find "$FRONTEND_DIR" -type f -exec stat -c '%Y %n' {} \; 2>/dev/null | sort -rn | head -1 | cut -d' ' -f2-)
    if [ -n "$LATEST_FILE" ]; then
        LATEST_TIME=$(stat -c '%y' "$LATEST_FILE" 2>/dev/null || stat -f '%Sm' "$LATEST_FILE" 2>/dev/null || echo "unknown")
        echo "Latest file: $(basename $LATEST_FILE)"
        echo "Modified: $LATEST_TIME"
    fi
fi
echo ""

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
if [ $FOUND_COUNT -gt 0 ] && [ $FOUND_DEPLOYED -gt 0 ]; then
    echo -e "${GREEN}✅ Frontend build looks correct${NC}"
    echo ""
    echo -e "${BLUE}If photos still use old endpoint:${NC}"
    echo "  1. Clear browser cache completely"
    echo "  2. Use incognito/private mode"
    echo "  3. Hard refresh (Ctrl+Shift+R or Cmd+Shift+R)"
    echo "  4. Check browser console for errors"
else
    echo -e "${RED}❌ Frontend build is missing upload-complete${NC}"
    echo ""
    echo "Run: ./rebuild-frontend.sh"
fi
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

