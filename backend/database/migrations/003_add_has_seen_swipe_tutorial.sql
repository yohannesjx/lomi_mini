-- Migration: Add has_seen_swipe_tutorial column to users table
-- Date: 2025-11-24

-- Add column if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'users' AND column_name = 'has_seen_swipe_tutorial'
    ) THEN
        ALTER TABLE users ADD COLUMN has_seen_swipe_tutorial BOOLEAN DEFAULT FALSE;
        CREATE INDEX IF NOT EXISTS idx_users_has_seen_swipe_tutorial ON users(has_seen_swipe_tutorial);
    END IF;
END $$;

