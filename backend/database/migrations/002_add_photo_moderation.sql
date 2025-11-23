-- Migration: Add photo moderation columns to media table
-- Date: 2025-11-23

-- Add moderation columns if they don't exist
DO $$ 
BEGIN
    -- Add moderation_status column
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'media' AND column_name = 'moderation_status'
    ) THEN
        ALTER TABLE media ADD COLUMN moderation_status VARCHAR(20) DEFAULT 'pending';
    END IF;

    -- Add moderation_reason column
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'media' AND column_name = 'moderation_reason'
    ) THEN
        ALTER TABLE media ADD COLUMN moderation_reason TEXT;
    END IF;

    -- Add moderated_at column
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'media' AND column_name = 'moderated_at'
    ) THEN
        ALTER TABLE media ADD COLUMN moderated_at TIMESTAMP WITH TIME ZONE;
    END IF;

    -- Add moderation_scores column (JSONB)
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'media' AND column_name = 'moderation_scores'
    ) THEN
        ALTER TABLE media ADD COLUMN moderation_scores JSONB;
    END IF;

    -- Add retry_count column
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'media' AND column_name = 'retry_count'
    ) THEN
        ALTER TABLE media ADD COLUMN retry_count INTEGER DEFAULT 0;
    END IF;

    -- Add batch_id column (for batch processing)
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'media' AND column_name = 'batch_id'
    ) THEN
        ALTER TABLE media ADD COLUMN batch_id UUID;
    END IF;

    -- Create indexes for fast queries
    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes 
        WHERE indexname = 'idx_media_moderation_status'
    ) THEN
        CREATE INDEX idx_media_moderation_status ON media(moderation_status) 
        WHERE moderation_status = 'pending';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes 
        WHERE indexname = 'idx_media_batch_id'
    ) THEN
        CREATE INDEX idx_media_batch_id ON media(batch_id);
    END IF;
END $$;

-- Update existing media records to have 'pending' status if is_approved is false
UPDATE media 
SET moderation_status = 'pending' 
WHERE moderation_status IS NULL AND is_approved = FALSE;

-- Update existing media records to have 'approved' status if is_approved is true
UPDATE media 
SET moderation_status = 'approved' 
WHERE moderation_status IS NULL AND is_approved = TRUE;

