#!/bin/bash

# Run migration to add has_seen_swipe_tutorial column

set -e

echo "🔄 Running migration: Add has_seen_swipe_tutorial column..."

# Load environment variables
if [ -f ".env.production" ]; then
    set -a
    source .env.production
    set +a
fi

# Run migration
docker-compose -f docker-compose.prod.yml --env-file .env.production exec -T postgres psql -U "${DB_USER:-lomi}" -d "${DB_NAME:-lomi_db}" < backend/database/migrations/003_add_has_seen_swipe_tutorial.sql

echo "✅ Migration completed!"

