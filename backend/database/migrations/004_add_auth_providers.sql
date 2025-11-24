-- Migration: Add auth_providers table and email support
-- Date: 2025-11-24

-- 1. Create auth_providers table
CREATE TABLE IF NOT EXISTS auth_providers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider VARCHAR(32) NOT NULL,
    provider_id VARCHAR(255) NOT NULL,
    email VARCHAR(255),
    linked_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Unique constraint for provider/provider_id pair
CREATE UNIQUE INDEX IF NOT EXISTS idx_auth_providers_provider_id
    ON auth_providers (provider, provider_id);

CREATE INDEX IF NOT EXISTS idx_auth_providers_user_id
    ON auth_providers (user_id);

-- 2. Add email column to users table if missing
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'users' AND column_name = 'email'
    ) THEN
        ALTER TABLE users ADD COLUMN email VARCHAR(255);
    END IF;
END $$;

-- Ensure email uniqueness (case-insensitive) when present
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_unique
    ON users (LOWER(email))
    WHERE email IS NOT NULL;

-- 3. Allow telegram_id to be nullable and only unique when set
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'users_telegram_id_key'
    ) THEN
        ALTER TABLE users DROP CONSTRAINT users_telegram_id_key;
    END IF;
END $$;

ALTER TABLE users ALTER COLUMN telegram_id DROP NOT NULL;

DROP INDEX IF EXISTS idx_users_telegram_id_unique;
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_telegram_id_unique
    ON users (telegram_id)
    WHERE telegram_id IS NOT NULL;

