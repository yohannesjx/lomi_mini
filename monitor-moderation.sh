#!/bin/bash

# Monitor Photo Moderation System - Real-time monitoring
# Shows: Queue length, worker status, recent jobs, DB status

set -e

# Load environment variables
if [ -f ".env.production" ]; then
    set -a
    source .env.production
    set +a
fi

clear
echo "📊 Photo Moderation System - Real-time Monitor"
echo "=============================================="
echo ""

while true; do
    # Queue Status
    QUEUE_LEN=$(docker-compose -f docker-compose.prod.yml --env-file .env.production exec -T redis redis-cli -a "${REDIS_PASSWORD}" LLEN photo_moderation_queue 2>/dev/null | tr -d '\r\n' || echo "0")
    
    # Worker Status
    WORKER_COUNT=$(docker-compose -f docker-compose.prod.yml --env-file .env.production ps moderator-worker 2>/dev/null | grep -c "Up" || echo "0")
    
    # Pending Media Count
    PENDING_COUNT=$(docker-compose -f docker-compose.prod.yml --env-file .env.production exec -T postgres psql -U "${DB_USER:-lomi}" -d "${DB_NAME:-lomi_db}" -t -c "SELECT COUNT(*) FROM media WHERE moderation_status = 'pending';" 2>/dev/null | tr -d ' \r\n' || echo "0")
    
    # Approved Count (last hour)
    APPROVED_COUNT=$(docker-compose -f docker-compose.prod.yml --env-file .env.production exec -T postgres psql -U "${DB_USER:-lomi}" -d "${DB_NAME:-lomi_db}" -t -c "SELECT COUNT(*) FROM media WHERE moderation_status = 'approved' AND moderated_at > NOW() - INTERVAL '1 hour';" 2>/dev/null | tr -d ' \r\n' || echo "0")
    
    # Rejected Count (last hour)
    REJECTED_COUNT=$(docker-compose -f docker-compose.prod.yml --env-file .env.production exec -T postgres psql -U "${DB_USER:-lomi}" -d "${DB_NAME:-lomi_db}" -t -c "SELECT COUNT(*) FROM media WHERE moderation_status = 'rejected' AND moderated_at > NOW() - INTERVAL '1 hour';" 2>/dev/null | tr -d ' \r\n' || echo "0")
    
    # Clear and show status
    clear
    echo "📊 Photo Moderation System - Real-time Monitor"
    echo "=============================================="
    echo ""
    echo "⏰ $(date '+%Y-%m-%d %H:%M:%S')"
    echo ""
    echo "📦 Redis Queue:"
    echo "   Jobs waiting: $QUEUE_LEN"
    echo ""
    echo "👷 Workers:"
    echo "   Running: $WORKER_COUNT"
    echo ""
    echo "📸 Database Status (last hour):"
    echo "   Pending: $PENDING_COUNT"
    echo "   Approved: $APPROVED_COUNT"
    echo "   Rejected: $REJECTED_COUNT"
    echo ""
    echo "📋 Recent Jobs (last 3):"
    docker-compose -f docker-compose.prod.yml --env-file .env.production exec -T redis redis-cli -a "${REDIS_PASSWORD}" LRANGE photo_moderation_queue 0 2 2>/dev/null | python3 -c "
import json
import sys
try:
    for line in sys.stdin:
        line = line.strip()
        if line and line != '(nil)':
            try:
                job = json.loads(line)
                print(f\"   Batch: {job.get('batch_id', 'N/A')[:8]}... | Photos: {len(job.get('photos', []))} | User: {job.get('user_id', 'N/A')[:8]}...\")
            except:
                pass
except:
    pass
" 2>/dev/null || echo "   (no jobs)"
    
    echo ""
    echo "🔄 Refreshing every 3 seconds... (Ctrl+C to exit)"
    sleep 3
done

