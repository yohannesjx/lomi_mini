#!/bin/bash

# Debug Photo Moderation Flow
# Checks each step of the moderation pipeline

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}🔍 Debugging Photo Moderation Flow${NC}"
echo "======================================"
echo ""

# Load environment variables
if [ -f ".env.production" ]; then
    set -a
    source .env.production
    set +a
fi

# Step 1: Check recent media records
echo -e "${YELLOW}Step 1: Recent Media Records (last 10)${NC}"
echo "─────────────────────────────────"
docker-compose -f docker-compose.prod.yml --env-file .env.production exec -T postgres psql -U "${DB_USER:-lomi}" -d "${DB_NAME:-lomi_db}" -c "
SELECT 
    id,
    user_id,
    moderation_status,
    moderation_reason,
    batch_id,
    created_at,
    moderated_at
FROM media 
ORDER BY created_at DESC 
LIMIT 10;
" 2>/dev/null || echo "Failed to query database"
echo ""

# Step 2: Check pending media
echo -e "${YELLOW}Step 2: Pending Media (waiting for moderation)${NC}"
echo "─────────────────────────────────"
PENDING_COUNT=$(docker-compose -f docker-compose.prod.yml --env-file .env.production exec -T postgres psql -U "${DB_USER:-lomi}" -d "${DB_NAME:-lomi_db}" -t -c "SELECT COUNT(*) FROM media WHERE moderation_status = 'pending';" 2>/dev/null | tr -d ' \r\n' || echo "0")
echo "Pending photos: $PENDING_COUNT"
echo ""

# Step 3: Check Redis queue
echo -e "${YELLOW}Step 3: Redis Queue Status${NC}"
echo "─────────────────────────────────"
# Try with password, if fails try without
if [ -n "${REDIS_PASSWORD}" ]; then
    QUEUE_LEN=$(docker-compose -f docker-compose.prod.yml --env-file .env.production exec -T redis redis-cli -a "${REDIS_PASSWORD}" LLEN photo_moderation_queue 2>/dev/null | tr -d '\r\n' || echo "0")
else
    QUEUE_LEN=$(docker-compose -f docker-compose.prod.yml --env-file .env.production exec -T redis redis-cli LLEN photo_moderation_queue 2>/dev/null | tr -d '\r\n' || echo "0")
fi

if [ "$QUEUE_LEN" = "0" ] || [ -z "$QUEUE_LEN" ]; then
    # Try without password
    QUEUE_LEN=$(docker-compose -f docker-compose.prod.yml --env-file .env.production exec -T redis redis-cli LLEN photo_moderation_queue 2>/dev/null | tr -d '\r\n' || echo "0")
fi

echo "Queue length: $QUEUE_LEN"

if [ "$QUEUE_LEN" -gt 0 ] && [ "$QUEUE_LEN" != "0" ]; then
    echo "Recent jobs in queue:"
    if [ -n "${REDIS_PASSWORD}" ]; then
        docker-compose -f docker-compose.prod.yml --env-file .env.production exec -T redis redis-cli -a "${REDIS_PASSWORD}" LRANGE photo_moderation_queue 0 2 2>/dev/null | head -3 || \
        docker-compose -f docker-compose.prod.yml --env-file .env.production exec -T redis redis-cli LRANGE photo_moderation_queue 0 2 2>/dev/null | head -3
    else
        docker-compose -f docker-compose.prod.yml --env-file .env.production exec -T redis redis-cli LRANGE photo_moderation_queue 0 2 2>/dev/null | head -3
    fi
else
    echo "Queue is empty"
fi
echo ""

# Step 4: Check worker status
echo -e "${YELLOW}Step 4: Worker Status${NC}"
echo "─────────────────────────────────"
WORKER_COUNT=$(docker-compose -f docker-compose.prod.yml --env-file .env.production ps moderator-worker 2>/dev/null | grep -c "Up" || echo "0")
echo "Running workers: $WORKER_COUNT"
echo ""

# Step 5: Check recent backend logs
echo -e "${YELLOW}Step 5: Recent Backend Logs (upload-complete calls)${NC}"
echo "─────────────────────────────────"
docker-compose -f docker-compose.prod.yml --env-file .env.production logs --tail 50 backend 2>/dev/null | grep -i "upload-complete\|moderation\|batch" | tail -10 || echo "No relevant logs found"
echo ""

# Step 6: Check recent worker logs
echo -e "${YELLOW}Step 6: Recent Worker Logs${NC}"
echo "─────────────────────────────────"
docker-compose -f docker-compose.prod.yml --env-file .env.production logs --tail 30 moderator-worker 2>/dev/null | tail -15 || echo "No worker logs"
echo ""

# Step 7: Check moderation subscriber logs
echo -e "${YELLOW}Step 7: Moderation Subscriber Activity${NC}"
echo "─────────────────────────────────"
docker-compose -f docker-compose.prod.yml --env-file .env.production logs --tail 100 backend 2>/dev/null | grep -i "moderation\|subscriber\|received\|published" | tail -10 || echo "No subscriber activity"
echo ""

# Step 8: Check for photos with zero batch_id (created via old endpoint)
echo -e "${YELLOW}Step 8: Photos Created via OLD Endpoint (no batch_id)${NC}"
echo "─────────────────────────────────"
OLD_COUNT=$(docker-compose -f docker-compose.prod.yml --env-file .env.production exec -T postgres psql -U "${DB_USER:-lomi}" -d "${DB_NAME:-lomi_db}" -t -c "SELECT COUNT(*) FROM media WHERE batch_id = '00000000-0000-0000-0000-000000000000' AND moderation_status = 'pending';" 2>/dev/null | tr -d ' \r\n' || echo "0")
if [ "$OLD_COUNT" -gt 0 ] && [ "$OLD_COUNT" != "0" ]; then
    echo -e "${RED}⚠️  Found $OLD_COUNT photos created via OLD endpoint (no batch_id)${NC}"
    echo "   These photos were NOT created through upload-complete endpoint."
    echo "   Frontend is likely still using the old individual upload endpoint."
    echo "   These photos will NOT be moderated automatically!"
else
    echo "No photos found with zero batch_id"
fi
echo ""

# Summary
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "${BLUE}Summary:${NC}"
echo "  Pending photos: $PENDING_COUNT"
echo "  Queue length: $QUEUE_LEN"
echo "  Workers running: $WORKER_COUNT"
echo ""

if [ "$OLD_COUNT" -gt 0 ] && [ "$OLD_COUNT" != "0" ]; then
    echo -e "${RED}🚨 CRITICAL: Frontend is using OLD endpoint!${NC}"
    echo "   Photos are being created without batch_id."
    echo "   Frontend needs to call upload-complete endpoint instead."
    echo "   Rebuild and deploy frontend with latest code."
elif [ "$PENDING_COUNT" -gt 0 ] && [ "$QUEUE_LEN" = "0" ]; then
    echo -e "${RED}⚠️  ISSUE: Photos are pending but queue is empty!${NC}"
    echo "   This means upload-complete was called but job wasn't enqueued."
    echo "   Check backend logs for errors."
elif [ "$PENDING_COUNT" = "0" ] && [ "$QUEUE_LEN" = "0" ]; then
    echo -e "${YELLOW}⚠️  No pending photos found.${NC}"
    echo "   Either:"
    echo "   1. Upload-complete endpoint wasn't called"
    echo "   2. Photos were already processed"
    echo "   3. No photos were uploaded"
elif [ "$QUEUE_LEN" -gt 0 ] && [ "$QUEUE_LEN" != "0" ]; then
    echo -e "${YELLOW}⚠️  Jobs in queue but not processing.${NC}"
    echo "   Check worker logs for errors."
else
    echo -e "${GREEN}✅ System appears healthy${NC}"
fi
echo ""

