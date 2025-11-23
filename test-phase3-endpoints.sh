#!/bin/bash

# Test Phase 3 Monitoring Endpoints
# Tests the new admin endpoints for queue stats and moderation dashboard

set -e

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${BLUE}🧪 Testing Phase 3 Monitoring Endpoints${NC}"
echo "=========================================="
echo ""

# Load environment variables
if [ -f ".env.production" ]; then
    set -a
    source .env.production
    set +a
fi

API_BASE="${API_BASE:-http://localhost}"

# Get JWT token
echo -e "${YELLOW}Step 1: Getting JWT Token${NC}"
echo "─────────────────────────────────"
read -p "Enter JWT token: " TOKEN

if [ -z "$TOKEN" ]; then
    echo -e "${RED}❌ JWT token required${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Token provided${NC}"
echo ""

# Test 1: Queue Stats
echo -e "${BLUE}Test 1: GET /admin/queue-stats${NC}"
echo "─────────────────────────────────"
QUEUE_STATS=$(curl -s -X GET "$API_BASE/api/v1/admin/queue-stats" \
    -H "Authorization: Bearer $TOKEN")

echo "Response:"
echo "$QUEUE_STATS" | grep -o '"[^"]*":"[^"]*"' | head -20 || echo "$QUEUE_STATS"
echo ""

# Check if successful
if echo "$QUEUE_STATS" | grep -q "queue"; then
    echo -e "${GREEN}✅ Queue stats endpoint working!${NC}"
else
    echo -e "${RED}❌ Queue stats endpoint failed${NC}"
    echo "Full response: $QUEUE_STATS"
fi
echo ""

# Test 2: Moderation Dashboard - Pending
echo -e "${BLUE}Test 2: GET /admin/moderation/dashboard?status=pending${NC}"
echo "─────────────────────────────────"
DASHBOARD_PENDING=$(curl -s -X GET "$API_BASE/api/v1/admin/moderation/dashboard?status=pending&limit=5" \
    -H "Authorization: Bearer $TOKEN")

echo "Response preview:"
echo "$DASHBOARD_PENDING" | head -c 500
echo "..."
echo ""

if echo "$DASHBOARD_PENDING" | grep -q "media\|pagination"; then
    echo -e "${GREEN}✅ Dashboard endpoint working!${NC}"
else
    echo -e "${RED}❌ Dashboard endpoint failed${NC}"
    echo "Full response: $DASHBOARD_PENDING"
fi
echo ""

# Test 3: Moderation Dashboard - All
echo -e "${BLUE}Test 3: GET /admin/moderation/dashboard?status=all${NC}"
echo "─────────────────────────────────"
DASHBOARD_ALL=$(curl -s -X GET "$API_BASE/api/v1/admin/moderation/dashboard?status=all&limit=5" \
    -H "Authorization: Bearer $TOKEN")

echo "Response preview:"
echo "$DASHBOARD_ALL" | head -c 500
echo "..."
echo ""

if echo "$DASHBOARD_ALL" | grep -q "media\|pagination"; then
    echo -e "${GREEN}✅ Dashboard (all) endpoint working!${NC}"
else
    echo -e "${YELLOW}⚠️  Dashboard (all) may have no data yet${NC}"
fi
echo ""

# Summary
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "${GREEN}✅ Phase 3 Endpoint Tests Complete!${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Next steps:"
echo "  1. Check queue stats regularly: curl -X GET \"$API_BASE/api/v1/admin/queue-stats\" -H \"Authorization: Bearer \$TOKEN\""
echo "  2. Monitor dashboard: curl -X GET \"$API_BASE/api/v1/admin/moderation/dashboard?status=pending\" -H \"Authorization: Bearer \$TOKEN\""
echo "  3. Use monitoring scripts: ./monitor-moderation.sh"
echo ""

