#!/bin/bash

# Run onboarding migration on production database

set -e

echo "🔄 Running onboarding migration..."

# Load environment variables
if [ -f ".env.production" ]; then
    set -a
    source .env.production
    set +a
fi

# Run migration
docker-compose -f docker-compose.prod.yml exec -T postgres psql -U "$DB_USER" -d "$DB_NAME" < backend/database/migrations/001_add_onboarding_fields.sql

echo "✅ Migration completed!"

