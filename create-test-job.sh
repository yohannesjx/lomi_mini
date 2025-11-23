#!/bin/bash

# Create a test moderation job in Redis for testing
# This simulates what happens when upload-complete is called

set -e

echo "🔧 Creating test moderation job in Redis"
echo "=========================================="

# Load environment variables
if [ -f ".env.production" ]; then
    set -a
    source .env.production
    set +a
fi

# You need to provide:
# 1. A real presigned download URL (from R2)
# 2. A media_id (UUID)
# 3. A user_id (UUID)

if [ -z "$1" ]; then
    echo ""
    echo "Usage: $0 <presigned_r2_url> [media_id] [user_id]"
    echo ""
    echo "Example:"
    echo "  $0 'https://xxx.r2.dev/bucket/key?X-Amz-Algorithm=...' '550e8400-e29b-41d4-a716-446655440000' '660e8400-e29b-41d4-a716-446655440001'"
    echo ""
    echo "To get a presigned URL, you can:"
    echo "  1. Upload a photo via the API (POST /api/v1/users/media/upload-complete)"
    echo "  2. Check the job in Redis: docker-compose exec redis redis-cli -a \$REDIS_PASSWORD LRANGE photo_moderation_queue 0 0"
    echo ""
    exit 1
fi

R2_URL="$1"
MEDIA_ID="${2:-$(uuidgen 2>/dev/null || python3 -c 'import uuid; print(uuid.uuid4())')}"
USER_ID="${3:-$(uuidgen 2>/dev/null || python3 -c 'import uuid; print(uuid.uuid4())')}"
BATCH_ID=$(uuidgen 2>/dev/null || python3 -c 'import uuid; print(uuid.uuid4())')
JOB_ID=$(uuidgen 2>/dev/null || python3 -c 'import uuid; print(uuid.uuid4())')

# Create test job JSON
JOB_JSON=$(python3 -c "
import json
import sys
from datetime import datetime

job = {
    'job_id': '$JOB_ID',
    'batch_id': '$BATCH_ID',
    'user_id': '$USER_ID',
    'telegram_id': 123456789,
    'photos': [
        {
            'media_id': '$MEDIA_ID',
            'r2_url': '$R2_URL',
            'r2_key': 'test/photo.jpg',
            'bucket': 'lomi-photos'
        }
    ],
    'created_at': datetime.utcnow().isoformat() + 'Z',
    'retry_count': 0,
    'priority': 1
}

print(json.dumps(job))
")

echo ""
echo "Job details:"
echo "  Job ID: $JOB_ID"
echo "  Batch ID: $BATCH_ID"
echo "  Media ID: $MEDIA_ID"
echo "  R2 URL: ${R2_URL:0:80}..."
echo ""

# Push to Redis queue
echo "Pushing job to Redis queue..."
docker-compose -f docker-compose.prod.yml --env-file .env.production exec -T redis redis-cli -a "${REDIS_PASSWORD}" LPUSH photo_moderation_queue "$JOB_JSON" > /dev/null

if [ $? -eq 0 ]; then
    echo "✅ Test job created successfully!"
    echo ""
    echo "Queue length:"
    docker-compose -f docker-compose.prod.yml --env-file .env.production exec -T redis redis-cli -a "${REDIS_PASSWORD}" LLEN photo_moderation_queue
    echo ""
    echo "Now run: ./test-r2-download.sh"
else
    echo "❌ Failed to create test job"
    exit 1
fi

