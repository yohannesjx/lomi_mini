#!/bin/bash

# Test R2 Download Access - Complete Test Script
# This script will:
# 1. Create a test job in Redis (or use existing)
# 2. Extract presigned URL from the job
# 3. Test download from worker container

set -e

echo "🧪 Testing R2 Download Access for Workers"
echo "=========================================="

# Load environment variables
if [ -f ".env.production" ]; then
    set -a
    source .env.production
    set +a
fi

# Check if Redis has any jobs
echo ""
echo "Step 1: Checking Redis queue for jobs..."
QUEUE_LENGTH=$(docker-compose -f docker-compose.prod.yml --env-file .env.production exec -T redis redis-cli -a "${REDIS_PASSWORD}" LLEN photo_moderation_queue 2>/dev/null | tr -d '\r\n' || echo "0")

if [ "$QUEUE_LENGTH" == "0" ] || [ -z "$QUEUE_LENGTH" ]; then
    echo "⚠️  No jobs in queue. You need to upload photos first via the API."
    echo ""
    echo "To create a test job, call:"
    echo "  POST /api/v1/users/media/upload-complete"
    echo "  with JWT token and photos array"
    echo ""
    echo "Or manually create a test job in Redis (see below)"
    exit 1
fi

echo "✅ Found $QUEUE_LENGTH job(s) in queue"

# Get first job from queue (without removing it)
echo ""
echo "Step 2: Extracting presigned URL from first job..."
JOB_JSON=$(docker-compose -f docker-compose.prod.yml --env-file .env.production exec -T redis redis-cli -a "${REDIS_PASSWORD}" LRANGE photo_moderation_queue 0 0 2>/dev/null | tail -1)

if [ -z "$JOB_JSON" ] || [ "$JOB_JSON" == "(nil)" ]; then
    echo "❌ Failed to get job from queue"
    exit 1
fi

# Extract first photo's r2_url using Python (more reliable than jq)
R2_URL=$(echo "$JOB_JSON" | python3 -c "
import json
import sys
try:
    job = json.load(sys.stdin)
    if 'photos' in job and len(job['photos']) > 0:
        print(job['photos'][0]['r2_url'])
    else:
        print('')
except:
    print('')
" 2>/dev/null)

if [ -z "$R2_URL" ]; then
    echo "❌ Failed to extract r2_url from job"
    echo "Job JSON (first 200 chars):"
    echo "$JOB_JSON" | head -c 200
    exit 1
fi

echo "✅ Found presigned URL:"
echo "   ${R2_URL:0:100}..."

# Test download from worker container
echo ""
echo "Step 3: Testing download from worker container..."
WORKER_CONTAINER=$(docker-compose -f docker-compose.prod.yml --env-file .env.production ps -q moderator-worker | head -1)

if [ -z "$WORKER_CONTAINER" ]; then
    echo "❌ No worker container found"
    exit 1
fi

echo "Using container: $WORKER_CONTAINER"

# Test with curl
HTTP_CODE=$(docker exec "$WORKER_CONTAINER" curl -s -o /tmp/test_image.jpg -w "%{http_code}" "$R2_URL" 2>/dev/null || echo "000")

if [ "$HTTP_CODE" == "200" ]; then
    FILE_SIZE=$(docker exec "$WORKER_CONTAINER" stat -c%s /tmp/test_image.jpg 2>/dev/null || echo "0")
    echo "✅ SUCCESS: Downloaded image (HTTP $HTTP_CODE, Size: $FILE_SIZE bytes)"
    
    # Verify it's a valid image
    echo ""
    echo "Step 4: Verifying image validity..."
    docker exec "$WORKER_CONTAINER" python3 -c "
from PIL import Image
import sys
try:
    img = Image.open('/tmp/test_image.jpg')
    print(f'✅ Image is valid: {img.size[0]}x{img.size[1]}, format: {img.format}')
    sys.exit(0)
except Exception as e:
    print(f'❌ Image is invalid: {e}')
    sys.exit(1)
" 2>/dev/null && echo "✅ Image verification passed!" || echo "⚠️  Image verification failed (but download worked)"
    
    echo ""
    echo "🎉 R2 Download Test: PASSED"
else
    echo "❌ FAILED: HTTP $HTTP_CODE"
    echo "Response:"
    docker exec "$WORKER_CONTAINER" cat /tmp/test_image.jpg 2>/dev/null | head -c 200 || echo "(no response body)"
    echo ""
    echo "❌ R2 Download Test: FAILED"
    exit 1
fi

