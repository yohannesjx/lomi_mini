-- Migration: Add onboarding fields to users table
-- Date: 2025-11-23

-- Add onboarding columns if they don't exist
DO $$ 
BEGIN
    -- Add onboarding_step column
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'users' AND column_name = 'onboarding_step'
    ) THEN
        ALTER TABLE users ADD COLUMN onboarding_step INTEGER DEFAULT 0 CHECK (onboarding_step >= 0 AND onboarding_step <= 8);
    END IF;

    -- Add onboarding_completed column
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'users' AND column_name = 'onboarding_completed'
    ) THEN
        ALTER TABLE users ADD COLUMN onboarding_completed BOOLEAN DEFAULT FALSE;
    END IF;

    -- Create index for faster onboarding queries
    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes 
        WHERE indexname = 'idx_users_onboarding'
    ) THEN
        CREATE INDEX idx_users_onboarding ON users(onboarding_completed, onboarding_step);
    END IF;
END $$;

-- Update existing users: if they have profile data, mark onboarding as completed
UPDATE users 
SET onboarding_completed = TRUE, 
    onboarding_step = 8
WHERE city IS NOT NULL 
  AND city != '' 
  AND city != 'Not Set'
  AND onboarding_completed = FALSE;

