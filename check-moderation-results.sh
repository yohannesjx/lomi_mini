#!/bin/bash

# Check moderation results in database
# Shows: media records with moderation status, scores, reasons

set -e

# Load environment variables
if [ -f ".env.production" ]; then
    set -a
    source .env.production
    set +a
fi

echo "📊 Photo Moderation Results"
echo "============================"
echo ""

# Show all moderated media (last 20)
echo "Recent Moderation Results (last 20):"
echo ""

docker-compose -f docker-compose.prod.yml --env-file .env.production exec -T postgres psql -U "${DB_USER:-lomi}" -d "${DB_NAME:-lomi_db}" -c "
SELECT 
    id,
    user_id,
    moderation_status,
    moderation_reason,
    moderated_at,
    CASE 
        WHEN moderation_scores IS NOT NULL THEN 
            jsonb_pretty(moderation_scores)
        ELSE '{}'::jsonb
    END as scores
FROM media 
WHERE moderation_status IN ('approved', 'rejected', 'failed')
ORDER BY moderated_at DESC
LIMIT 20;
" 2>/dev/null

echo ""
echo "Summary by Status:"
docker-compose -f docker-compose.prod.yml --env-file .env.production exec -T postgres psql -U "${DB_USER:-lomi}" -d "${DB_NAME:-lomi_db}" -c "
SELECT 
    moderation_status,
    COUNT(*) as count,
    COUNT(CASE WHEN moderation_reason = 'blurry' THEN 1 END) as blurry,
    COUNT(CASE WHEN moderation_reason = 'no_face' THEN 1 END) as no_face,
    COUNT(CASE WHEN moderation_reason = 'underage' THEN 1 END) as underage,
    COUNT(CASE WHEN moderation_reason = 'nsfw' THEN 1 END) as nsfw
FROM media 
WHERE moderation_status IN ('approved', 'rejected', 'failed')
GROUP BY moderation_status;
" 2>/dev/null

echo ""
echo "Pending Media:"
docker-compose -f docker-compose.prod.yml --env-file .env.production exec -T postgres psql -U "${DB_USER:-lomi}" -d "${DB_NAME:-lomi_db}" -c "
SELECT COUNT(*) as pending_count, 
       COUNT(DISTINCT batch_id) as pending_batches
FROM media 
WHERE moderation_status = 'pending';
" 2>/dev/null

