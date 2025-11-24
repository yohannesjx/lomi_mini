#!/bin/bash

# Fix pending photos that were created via old endpoint (no batch_id)
# This script will manually enqueue them for moderation

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}🔧 Fix Pending Photos (Old Endpoint)${NC}"
echo "======================================"
echo ""

# Load environment variables
if [ -f ".env.production" ]; then
    set -a
    source .env.production
    set +a
fi

DB_USER="${DB_USER:-lomi}"
DB_NAME="${DB_NAME:-lomi_db}"
POSTGRES_CONTAINER="postgres"

echo -e "${YELLOW}Step 1: Finding photos with zero batch_id${NC}"
echo "─────────────────────────────────"

# Find photos with zero batch_id that are pending
PENDING_PHOTOS=$(docker-compose -f docker-compose.prod.yml --env-file .env.production exec -T "$POSTGRES_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -A -t -F ',' -c "
SELECT 
    id,
    user_id,
    url,
    media_type
FROM media 
WHERE batch_id = '00000000-0000-0000-0000-000000000000' 
  AND moderation_status = 'pending'
ORDER BY created_at DESC;
" 2>/dev/null)

if [ -z "$PENDING_PHOTOS" ]; then
    echo -e "${GREEN}✅ No pending photos with zero batch_id found.${NC}"
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo -e "${GREEN}Nothing to fix.${NC}"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    exit 0
fi

echo "Found the following photos:"
echo "ID, User ID, File Key, Media Type"
echo "--------------------------------------------------------------------------------"
echo "$PENDING_PHOTOS" | while IFS=, read -r id user_id url media_type; do
    echo -e "${YELLOW}  - ID: $id | User: $user_id | File: $url | Type: $media_type${NC}"
done
echo "--------------------------------------------------------------------------------"
echo ""

echo -e "${RED}WARNING: These photos were created via the OLD endpoint and won't be moderated automatically.${NC}"
echo ""
echo "Options:"
echo "  1. Delete these photos (user can re-upload via new endpoint)"
echo "  2. Manually trigger moderation (requires backend API call)"
echo "  3. Exit (do nothing)"
echo ""
read -p "Choose option (1/2/3): " OPTION

case $OPTION in
    1)
        echo ""
        echo -e "${YELLOW}Deleting photos...${NC}"
        echo "$PENDING_PHOTOS" | while IFS=, read -r id user_id url media_type; do
            DELETE_CMD="DELETE FROM media WHERE id = '$id';"
            if docker-compose -f docker-compose.prod.yml --env-file .env.production exec -T "$POSTGRES_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -c "$DELETE_CMD" 2>/dev/null; then
                echo -e "  ${GREEN}✅ Deleted photo: $id${NC}"
            else
                echo -e "  ${RED}❌ Failed to delete photo: $id${NC}"
            fi
        done
        echo ""
        echo -e "${GREEN}✅ Deletion complete. User should re-upload photos via the new frontend.${NC}"
        ;;
    2)
        echo ""
        echo -e "${YELLOW}To manually trigger moderation, you need to:${NC}"
        echo "  1. Group photos by user_id"
        echo "  2. Generate a batch_id for each user"
        echo "  3. Update batch_id in database"
        echo "  4. Call the moderation queue API"
        echo ""
        echo -e "${BLUE}This requires backend API access.${NC}"
        echo "You can use the admin endpoint or directly call the queue service."
        ;;
    3)
        echo -e "${BLUE}Exiting without changes.${NC}"
        exit 0
        ;;
    *)
        echo -e "${RED}Invalid option. Exiting.${NC}"
        exit 1
        ;;
esac

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "${GREEN}Script finished.${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

