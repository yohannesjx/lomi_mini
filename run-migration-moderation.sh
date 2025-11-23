#!/bin/bash

# Run photo moderation migration on production database

set -e

echo "🔄 Running photo moderation migration..."

# Load environment variables
if [ -f ".env.production" ]; then
    set -a
    source .env.production
    set +a
fi

# Run migration
docker-compose -f docker-compose.prod.yml exec -T postgres psql -U "${DB_USER:-lomi}" -d "${DB_NAME:-lomi_db}" < backend/database/migrations/002_add_photo_moderation.sql

echo "✅ Migration completed!"

