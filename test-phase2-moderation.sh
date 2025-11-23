#!/bin/bash

# Phase 2: End-to-End Photo Moderation Test
# Tests the complete flow: Upload → Queue → Worker → DB → Notifications

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🧪 Phase 2: End-to-End Photo Moderation Test${NC}"
echo "=============================================="
echo ""

# Load environment variables
if [ -f ".env.production" ]; then
    set -a
    source .env.production
    set +a
fi

# Configuration
API_BASE="${API_BASE:-http://localhost}"
NUM_PHOTOS="${1:-5}"  # Default to 5 photos, can override: ./test-phase2-moderation.sh 9
NUM_PHOTOS=$((NUM_PHOTOS > 9 ? 9 : NUM_PHOTOS))  # Max 9 photos per batch

echo -e "${YELLOW}📸 Testing with $NUM_PHOTOS photos${NC}"
echo ""

# Step 1: Authenticate
echo -e "${BLUE}Step 1: Authentication${NC}"
echo "─────────────────────────────────"
read -p "Enter JWT token (or press Enter to use initData): " TOKEN

if [ -z "$TOKEN" ]; then
    read -p "Enter Telegram initData: " INIT_DATA
    if [ -z "$INIT_DATA" ]; then
        echo -e "${RED}❌ Need either JWT token or initData${NC}"
        exit 1
    fi
    
    echo "Authenticating with initData..."
    AUTH_RESPONSE=$(curl -s -X POST "$API_BASE/api/v1/auth/telegram" \
        -H "Authorization: tma $INIT_DATA")
    
    # Extract access_token (works without jq)
    TOKEN=$(echo "$AUTH_RESPONSE" | grep -o '"access_token":"[^"]*"' | cut -d'"' -f4)
    if [ -z "$TOKEN" ] || [ "$TOKEN" = "null" ]; then
        echo -e "${RED}❌ Authentication failed${NC}"
        echo "Response: $AUTH_RESPONSE"
        exit 1
    fi
    echo -e "${GREEN}✅ Authenticated${NC}"
fi

echo "Token: ${TOKEN:0:30}..."
echo ""

# Step 2: Upload photos to R2 and collect file keys
echo -e "${BLUE}Step 2: Uploading $NUM_PHOTOS photos to R2${NC}"
echo "─────────────────────────────────"

PHOTOS_JSON="["
TEMP_DIR="/tmp/phase2_test_photos"
mkdir -p "$TEMP_DIR"

# Create a simple test image (1x1 pixel PNG)
TEST_IMAGE_B64="iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
echo "$TEST_IMAGE_B64" | base64 -d > "$TEMP_DIR/test_base.jpg"

for i in $(seq 1 $NUM_PHOTOS); do
    echo "  📤 Uploading photo $i/$NUM_PHOTOS..."
    
    # Get presigned upload URL
    UPLOAD_RESPONSE=$(curl -s -X GET "$API_BASE/api/v1/users/media/upload-url?media_type=photo" \
        -H "Authorization: Bearer $TOKEN")
    
    # Check for errors in response
    if echo "$UPLOAD_RESPONSE" | grep -q '"error"'; then
        echo -e "    ${RED}❌ Error getting upload URL: $UPLOAD_RESPONSE${NC}"
        continue
    fi
    
    # Extract upload_url and file_key (works without jq)
    UPLOAD_URL=$(echo "$UPLOAD_RESPONSE" | grep -o '"upload_url":"[^"]*"' | cut -d'"' -f4)
    FILE_KEY=$(echo "$UPLOAD_RESPONSE" | grep -o '"file_key":"[^"]*"' | cut -d'"' -f4)
    
    if [ -z "$UPLOAD_URL" ] || [ "$UPLOAD_URL" = "null" ]; then
        echo -e "    ${RED}❌ Failed to get upload URL for photo $i${NC}"
        echo "    Response: $UPLOAD_RESPONSE"
        continue
    fi
    
    # Upload to R2
    UPLOAD_RESPONSE_FILE="/tmp/upload_response_$i.txt"
    UPLOAD_STATUS=$(curl -s -o "$UPLOAD_RESPONSE_FILE" -w "%{http_code}" -X PUT "$UPLOAD_URL" \
        -H "Content-Type: image/jpeg" \
        --data-binary @"$TEMP_DIR/test_base.jpg")
    
    if [ "$UPLOAD_STATUS" = "200" ] || [ "$UPLOAD_STATUS" = "204" ]; then
        echo -e "    ${GREEN}✅ Photo $i uploaded (key: ${FILE_KEY:0:40}...)${NC}"
        
        # Add to photos array
        if [ "$i" -gt 1 ]; then
            PHOTOS_JSON+=","
        fi
        PHOTOS_JSON+="{\"file_key\":\"$FILE_KEY\",\"media_type\":\"photo\"}"
    else
        UPLOAD_ERROR=$(cat "$UPLOAD_RESPONSE_FILE" 2>/dev/null || echo "")
        echo -e "    ${RED}❌ Upload failed with status: $UPLOAD_STATUS${NC}"
        if [ -n "$UPLOAD_ERROR" ]; then
            echo "    Error: $UPLOAD_ERROR"
        fi
    fi
    rm -f "$UPLOAD_RESPONSE_FILE"
    
    # Small delay to avoid rate limiting
    sleep 0.5
done

PHOTOS_JSON+="]"

# Wrap in proper request format: {"photos": [...]}
if [ "$PHOTOS_JSON" = "[]" ]; then
    echo -e "${RED}❌ No photos were uploaded successfully${NC}"
    exit 1
fi

UPLOAD_COMPLETE_BODY="{\"photos\":$PHOTOS_JSON}"
echo ""

# Step 3: Call upload-complete endpoint
echo -e "${BLUE}Step 3: Calling upload-complete endpoint${NC}"
echo "─────────────────────────────────"

UPLOAD_COMPLETE_RESPONSE=$(curl -s -X POST "$API_BASE/api/v1/users/media/upload-complete" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d "$UPLOAD_COMPLETE_BODY")

echo "Response:"
echo "$UPLOAD_COMPLETE_RESPONSE"
echo ""

# Extract batch_id (works without jq)
BATCH_ID=$(echo "$UPLOAD_COMPLETE_RESPONSE" | grep -o '"batch_id":"[^"]*"' | cut -d'"' -f4)
HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$API_BASE/api/v1/users/media/upload-complete" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d "$UPLOAD_COMPLETE_BODY")

if [ "$HTTP_STATUS" = "200" ] && [ -n "$BATCH_ID" ] && [ "$BATCH_ID" != "null" ]; then
    echo -e "${GREEN}✅ Upload-complete successful!${NC}"
    echo "   Batch ID: $BATCH_ID"
else
    echo -e "${RED}❌ Upload-complete failed${NC}"
    echo "   HTTP Status: $HTTP_STATUS"
    exit 1
fi
echo ""

# Step 4: Monitor the queue and workers
echo -e "${BLUE}Step 4: Monitoring Queue & Workers${NC}"
echo "─────────────────────────────────"
echo ""
echo -e "${YELLOW}📊 Initial Queue Status:${NC}"

QUEUE_LEN=$(docker-compose -f docker-compose.prod.yml --env-file .env.production exec -T redis redis-cli -a "${REDIS_PASSWORD}" LLEN photo_moderation_queue 2>/dev/null | tr -d '\r\n' || echo "0")
echo "   Queue length: $QUEUE_LEN"

PENDING_COUNT=$(docker-compose -f docker-compose.prod.yml --env-file .env.production exec -T postgres psql -U "${DB_USER:-lomi}" -d "${DB_NAME:-lomi_db}" -t -c "SELECT COUNT(*) FROM media WHERE batch_id = '$BATCH_ID' AND moderation_status = 'pending';" 2>/dev/null | tr -d ' \r\n' || echo "0")
echo "   Pending photos in batch: $PENDING_COUNT"
echo ""

# Wait and monitor
echo -e "${YELLOW}⏳ Waiting for moderation to complete (max 30 seconds)...${NC}"
MAX_WAIT=30
ELAPSED=0
CHECK_INTERVAL=2

while [ $ELAPSED -lt $MAX_WAIT ]; do
    sleep $CHECK_INTERVAL
    ELAPSED=$((ELAPSED + CHECK_INTERVAL))
    
    # Check if still pending
    PENDING_COUNT=$(docker-compose -f docker-compose.prod.yml --env-file .env.production exec -T postgres psql -U "${DB_USER:-lomi}" -d "${DB_NAME:-lomi_db}" -t -c "SELECT COUNT(*) FROM media WHERE batch_id = '$BATCH_ID' AND moderation_status = 'pending';" 2>/dev/null | tr -d ' \r\n' || echo "0")
    
    if [ "$PENDING_COUNT" = "0" ]; then
        echo -e "${GREEN}✅ All photos processed!${NC}"
        break
    fi
    
    # Show progress
    PROCESSED=$((NUM_PHOTOS - PENDING_COUNT))
    echo "   Progress: $PROCESSED/$NUM_PHOTOS processed (${ELAPSED}s elapsed)"
done

if [ "$PENDING_COUNT" -gt 0 ]; then
    echo -e "${YELLOW}⚠️  Still $PENDING_COUNT photos pending after $MAX_WAIT seconds${NC}"
fi
echo ""

# Step 5: Check results
echo -e "${BLUE}Step 5: Checking Moderation Results${NC}"
echo "─────────────────────────────────"
echo ""

# Get results for this batch
echo "📊 Results for batch: $BATCH_ID"
echo ""

docker-compose -f docker-compose.prod.yml --env-file .env.production exec -T postgres psql -U "${DB_USER:-lomi}" -d "${DB_NAME:-lomi_db}" -c "
SELECT 
    id,
    moderation_status,
    moderation_reason,
    moderated_at,
    CASE 
        WHEN moderation_scores IS NOT NULL THEN 
            jsonb_pretty(moderation_scores)
        ELSE '{}'::jsonb
    END as scores
FROM media 
WHERE batch_id = '$BATCH_ID'
ORDER BY display_order;
" 2>/dev/null || echo "Failed to query database"

echo ""
echo "📈 Summary:"
docker-compose -f docker-compose.prod.yml --env-file .env.production exec -T postgres psql -U "${DB_USER:-lomi}" -d "${DB_NAME:-lomi_db}" -c "
SELECT 
    moderation_status,
    COUNT(*) as count,
    COUNT(CASE WHEN moderation_reason = 'blurry' THEN 1 END) as blurry,
    COUNT(CASE WHEN moderation_reason = 'no_face' THEN 1 END) as no_face,
    COUNT(CASE WHEN moderation_reason = 'underage' THEN 1 END) as underage,
    COUNT(CASE WHEN moderation_reason = 'nsfw' THEN 1 END) as nsfw
FROM media 
WHERE batch_id = '$BATCH_ID'
GROUP BY moderation_status;
" 2>/dev/null || echo "Failed to get summary"

echo ""

# Check queue status
QUEUE_LEN=$(docker-compose -f docker-compose.prod.yml --env-file .env.production exec -T redis redis-cli -a "${REDIS_PASSWORD}" LLEN photo_moderation_queue 2>/dev/null | tr -d '\r\n' || echo "0")
echo "📦 Final Queue Status: $QUEUE_LEN jobs remaining"
echo ""

# Cleanup
rm -rf "$TEMP_DIR"

# Final summary
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "${GREEN}✅ Phase 2 Test Complete!${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Next steps:"
echo "  1. Check worker logs: ./watch-worker-logs.sh"
echo "  2. Monitor in real-time: ./monitor-moderation.sh"
echo "  3. Check all results: ./check-moderation-results.sh"
echo ""

