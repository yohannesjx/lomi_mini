#!/bin/bash

# Run onboarding migration
# Execute this ON THE SERVER

echo "🔧 Running Onboarding Migration"
echo "==============================="
echo ""

# Check if migration file exists
if [ ! -f "backend/database/migrations/001_add_onboarding_fields.sql" ]; then
    echo "❌ Migration file not found!"
    echo "   Expected: backend/database/migrations/001_add_onboarding_fields.sql"
    exit 1
fi

echo "✅ Migration file found"
echo ""

# Run migration
echo "📤 Running migration..."
docker exec -i lomi_postgres psql -U lomi -d lomi_db < backend/database/migrations/001_add_onboarding_fields.sql

if [ $? -eq 0 ]; then
    echo "✅ Migration completed successfully"
else
    echo "❌ Migration failed!"
    exit 1
fi

echo ""
echo "🔍 Verifying migration..."

# Verify columns exist
docker exec -i lomi_postgres psql -U lomi -d lomi_db -c "
SELECT column_name, data_type, column_default 
FROM information_schema.columns 
WHERE table_name = 'users' 
AND column_name IN ('onboarding_step', 'onboarding_completed')
ORDER BY column_name;
"

echo ""
echo "✅ Migration complete!"
echo ""
echo "Next steps:"
echo "1. Restart backend: docker-compose -f docker-compose.prod.yml restart backend"
echo "2. Test onboarding flow in Telegram"
