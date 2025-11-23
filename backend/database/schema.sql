-- Lomi Social Database Schema
-- PostgreSQL 15+

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Enable PostGIS for location features (optional, for future geo queries)
-- CREATE EXTENSION IF NOT EXISTS postgis;

-- ============================================================================
-- ENUMS
-- ============================================================================

CREATE TYPE gender_type AS ENUM ('male', 'female', 'other');
CREATE TYPE relationship_goal AS ENUM ('friends', 'dating', 'serious');
CREATE TYPE religion_type AS ENUM ('orthodox', 'muslim', 'protestant', 'catholic', 'other', 'none');
CREATE TYPE verification_status AS ENUM ('pending', 'approved', 'rejected');
CREATE TYPE media_type AS ENUM ('photo', 'video');
CREATE TYPE swipe_action AS ENUM ('like', 'pass', 'super_like');
CREATE TYPE message_type AS ENUM ('text', 'photo', 'video', 'voice', 'sticker', 'gift', 'buna_invite');
CREATE TYPE transaction_type AS ENUM ('purchase', 'gift_sent', 'gift_received', 'boost', 'refund', 'channel_subscription_reward', 'reveal');
CREATE TYPE payment_method AS ENUM ('telebirr', 'cbe_birr', 'hellocash', 'amole');
CREATE TYPE payment_status AS ENUM ('pending', 'completed', 'failed', 'refunded');
CREATE TYPE payout_status AS ENUM ('pending', 'processing', 'completed', 'rejected');
CREATE TYPE report_reason AS ENUM ('inappropriate_content', 'fake_profile', 'harassment', 'scam', 'other');

-- ============================================================================
-- USERS TABLE
-- ============================================================================

CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Telegram Integration
    telegram_id BIGINT UNIQUE NOT NULL,
    telegram_username VARCHAR(255),
    telegram_first_name VARCHAR(255),
    telegram_last_name VARCHAR(255),
    
    -- Profile Information
    name VARCHAR(255) NOT NULL,
    age INTEGER NOT NULL CHECK (age >= 18 AND age <= 100),
    gender gender_type NOT NULL,
    city VARCHAR(255) NOT NULL,
    bio TEXT,
    relationship_goal relationship_goal NOT NULL DEFAULT 'dating',
    religion religion_type,
    
    -- Languages (stored as JSON array: ["amharic", "english", "oromo"])
    languages JSONB DEFAULT '[]',
    
    -- Interests (stored as JSON array: ["buna_lover", "music", "travel"])
    interests JSONB DEFAULT '[]',
    
    -- Location (latitude, longitude for matching)
    latitude DECIMAL(10, 8),
    longitude DECIMAL(11, 8),
    
    -- Verification
    is_verified BOOLEAN DEFAULT FALSE,
    verification_status verification_status,
    
    -- Settings
    is_active BOOLEAN DEFAULT TRUE,
    is_online BOOLEAN DEFAULT FALSE,
    last_seen_at TIMESTAMP WITH TIME ZONE,
    show_online_status BOOLEAN DEFAULT TRUE,
    
    -- Preferences (stored as JSON)
    preferences JSONB DEFAULT '{}',
    -- Example: {"min_age": 20, "max_age": 35, "max_distance": 50, "religions": ["orthodox", "protestant"]}
    
    -- Coins & Economy
    coin_balance INTEGER DEFAULT 0 CHECK (coin_balance >= 0),
    gift_balance DECIMAL(10, 2) DEFAULT 0.00 CHECK (gift_balance >= 0),
    
    -- Onboarding Progress
    onboarding_step INTEGER DEFAULT 0 CHECK (onboarding_step >= 0 AND onboarding_step <= 8),
    onboarding_completed BOOLEAN DEFAULT FALSE,
    
    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    deleted_at TIMESTAMP WITH TIME ZONE
);

-- Indexes for users
CREATE INDEX idx_users_telegram_id ON users(telegram_id);
CREATE INDEX idx_users_city ON users(city);
CREATE INDEX idx_users_gender ON users(gender);
CREATE INDEX idx_users_age ON users(age);
CREATE INDEX idx_users_is_active ON users(is_active);
CREATE INDEX idx_users_location ON users(latitude, longitude);
CREATE INDEX idx_users_created_at ON users(created_at);

-- ============================================================================
-- PHOTOS & VIDEOS TABLE
-- ============================================================================

CREATE TABLE media (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    media_type media_type NOT NULL,
    url TEXT NOT NULL,
    thumbnail_url TEXT,
    
    -- For videos
    duration_seconds INTEGER,
    
    -- Display order (1-9 for photos, 1 for video intro)
    display_order INTEGER NOT NULL DEFAULT 1,
    
    -- Moderation
    is_approved BOOLEAN DEFAULT FALSE,
    moderation_notes TEXT,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_media_user_id ON media(user_id);
CREATE INDEX idx_media_type ON media(media_type);
CREATE INDEX idx_media_display_order ON media(user_id, display_order);

-- ============================================================================
-- VERIFICATIONS TABLE
-- ============================================================================

CREATE TABLE verifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    selfie_url TEXT NOT NULL,
    id_document_url TEXT NOT NULL,
    
    status verification_status DEFAULT 'pending',
    reviewed_by UUID REFERENCES users(id),
    reviewed_at TIMESTAMP WITH TIME ZONE,
    rejection_reason TEXT,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_verifications_user_id ON verifications(user_id);
CREATE INDEX idx_verifications_status ON verifications(status);

-- ============================================================================
-- SWIPES TABLE
-- ============================================================================

CREATE TABLE swipes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    swiper_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    swiped_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    action swipe_action NOT NULL,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    UNIQUE(swiper_id, swiped_id)
);

CREATE INDEX idx_swipes_swiper_id ON swipes(swiper_id);
CREATE INDEX idx_swipes_swiped_id ON swipes(swiped_id);
CREATE INDEX idx_swipes_action ON swipes(action);
CREATE INDEX idx_swipes_created_at ON swipes(created_at);

-- ============================================================================
-- MATCHES TABLE
-- ============================================================================

CREATE TABLE matches (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    user1_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    user2_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    -- Track who initiated (for analytics)
    initiated_by UUID NOT NULL REFERENCES users(id),
    
    -- Unmatching
    is_active BOOLEAN DEFAULT TRUE,
    unmatched_by UUID REFERENCES users(id),
    unmatched_at TIMESTAMP WITH TIME ZONE,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    UNIQUE(user1_id, user2_id),
    CHECK (user1_id < user2_id)  -- Ensure consistent ordering
);

CREATE INDEX idx_matches_user1_id ON matches(user1_id);
CREATE INDEX idx_matches_user2_id ON matches(user2_id);
CREATE INDEX idx_matches_is_active ON matches(is_active);
CREATE INDEX idx_matches_created_at ON matches(created_at);

-- ============================================================================
-- MESSAGES TABLE
-- ============================================================================

CREATE TABLE messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    match_id UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
    sender_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    receiver_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    message_type message_type NOT NULL DEFAULT 'text',
    
    -- Content
    content TEXT,  -- For text messages
    media_url TEXT,  -- For photo/video/voice
    gift_id UUID REFERENCES gifts(id),  -- For gift messages
    
    -- Metadata (for buna invites, stickers, etc.)
    metadata JSONB DEFAULT '{}',
    
    -- Read status
    is_read BOOLEAN DEFAULT FALSE,
    read_at TIMESTAMP WITH TIME ZONE,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_messages_match_id ON messages(match_id);
CREATE INDEX idx_messages_sender_id ON messages(sender_id);
CREATE INDEX idx_messages_receiver_id ON messages(receiver_id);
CREATE INDEX idx_messages_created_at ON messages(match_id, created_at);
CREATE INDEX idx_messages_is_read ON messages(receiver_id, is_read);

-- ============================================================================
-- GIFTS CATALOG TABLE
-- ============================================================================

CREATE TABLE gifts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    name_en VARCHAR(255) NOT NULL,
    name_am VARCHAR(255) NOT NULL,  -- Amharic name
    description_en TEXT,
    description_am TEXT,
    
    -- Pricing
    coin_price INTEGER NOT NULL CHECK (coin_price > 0),
    birr_value DECIMAL(10, 2) NOT NULL CHECK (birr_value > 0),
    
    -- Media
    icon_url TEXT NOT NULL,
    animation_url TEXT NOT NULL,
    sound_url TEXT,
    
    -- Special effects (e.g., Habesha dress avatar effect)
    has_special_effect BOOLEAN DEFAULT FALSE,
    special_effect_duration_days INTEGER,
    
    -- Availability
    is_active BOOLEAN DEFAULT TRUE,
    is_featured BOOLEAN DEFAULT FALSE,
    
    -- Display order
    display_order INTEGER DEFAULT 0,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_gifts_is_active ON gifts(is_active);
CREATE INDEX idx_gifts_is_featured ON gifts(is_featured);
CREATE INDEX idx_gifts_display_order ON gifts(display_order);

-- ============================================================================
-- GIFT TRANSACTIONS TABLE
-- ============================================================================

CREATE TABLE gift_transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    sender_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    receiver_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    gift_id UUID NOT NULL REFERENCES gifts(id),
    
    coin_amount INTEGER NOT NULL,
    birr_value DECIMAL(10, 2) NOT NULL,
    
    -- Link to message if sent in chat
    message_id UUID REFERENCES messages(id),
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_gift_transactions_sender_id ON gift_transactions(sender_id);
CREATE INDEX idx_gift_transactions_receiver_id ON gift_transactions(receiver_id);
CREATE INDEX idx_gift_transactions_gift_id ON gift_transactions(gift_id);
CREATE INDEX idx_gift_transactions_created_at ON gift_transactions(created_at);

-- ============================================================================
-- COIN TRANSACTIONS TABLE
-- ============================================================================

CREATE TABLE coin_transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    transaction_type transaction_type NOT NULL,
    coin_amount INTEGER NOT NULL,
    
    -- For purchases
    birr_amount DECIMAL(10, 2),
    payment_method payment_method,
    payment_reference VARCHAR(255),
    payment_status payment_status DEFAULT 'pending',
    
    -- For gifts
    gift_transaction_id UUID REFERENCES gift_transactions(id),
    
    -- Balance after transaction
    balance_after INTEGER NOT NULL,
    
    -- Metadata
    metadata JSONB DEFAULT '{}',
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_coin_transactions_user_id ON coin_transactions(user_id);
CREATE INDEX idx_coin_transactions_type ON coin_transactions(transaction_type);
CREATE INDEX idx_coin_transactions_payment_status ON coin_transactions(payment_status);
CREATE INDEX idx_coin_transactions_created_at ON coin_transactions(created_at);

-- ============================================================================
-- PAYOUTS TABLE
-- ============================================================================

CREATE TABLE payouts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    -- Amount
    gift_balance_amount DECIMAL(10, 2) NOT NULL,
    platform_fee_percentage INTEGER NOT NULL DEFAULT 25,
    platform_fee_amount DECIMAL(10, 2) NOT NULL,
    net_amount DECIMAL(10, 2) NOT NULL,
    
    -- Payment details
    payment_method payment_method NOT NULL,
    payment_account VARCHAR(255) NOT NULL,  -- Phone number or account number
    payment_account_name VARCHAR(255),
    
    -- Status
    status payout_status DEFAULT 'pending',
    processed_by UUID REFERENCES users(id),
    processed_at TIMESTAMP WITH TIME ZONE,
    payment_reference VARCHAR(255),
    
    -- Notes
    admin_notes TEXT,
    rejection_reason TEXT,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_payouts_user_id ON payouts(user_id);
CREATE INDEX idx_payouts_status ON payouts(status);
CREATE INDEX idx_payouts_created_at ON payouts(created_at);

-- ============================================================================
-- REPORTS TABLE
-- ============================================================================

CREATE TABLE reports (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    reporter_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    reported_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    reason report_reason NOT NULL,
    description TEXT,
    
    -- Evidence
    screenshot_urls JSONB DEFAULT '[]',
    
    -- Status
    is_reviewed BOOLEAN DEFAULT FALSE,
    reviewed_by UUID REFERENCES users(id),
    reviewed_at TIMESTAMP WITH TIME ZONE,
    action_taken TEXT,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_reports_reporter_id ON reports(reporter_id);
CREATE INDEX idx_reports_reported_user_id ON reports(reported_user_id);
CREATE INDEX idx_reports_is_reviewed ON reports(is_reviewed);
CREATE INDEX idx_reports_created_at ON reports(created_at);

-- ============================================================================
-- BLOCKS TABLE
-- ============================================================================

CREATE TABLE blocks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    blocker_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    blocked_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    UNIQUE(blocker_id, blocked_id)
);

CREATE INDEX idx_blocks_blocker_id ON blocks(blocker_id);
CREATE INDEX idx_blocks_blocked_id ON blocks(blocked_id);

-- ============================================================================
-- DISCOVER FEED TABLE (for explore feed algorithm)
-- ============================================================================

CREATE TABLE discover_feed (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    media_id UUID NOT NULL REFERENCES media(id) ON DELETE CASCADE,
    
    -- Engagement metrics
    views_count INTEGER DEFAULT 0,
    likes_count INTEGER DEFAULT 0,
    
    -- Algorithm score (updated periodically)
    score DECIMAL(10, 4) DEFAULT 0,
    
    -- Boosted content
    is_boosted BOOLEAN DEFAULT FALSE,
    boost_expires_at TIMESTAMP WITH TIME ZONE,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_discover_feed_user_id ON discover_feed(user_id);
CREATE INDEX idx_discover_feed_media_id ON discover_feed(media_id);
CREATE INDEX idx_discover_feed_score ON discover_feed(score DESC);
CREATE INDEX idx_discover_feed_is_boosted ON discover_feed(is_boosted, boost_expires_at);


-- ============================================================================
-- REWARD CHANNELS TABLE (Earn Coins)
-- ============================================================================

CREATE TABLE reward_channels (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    channel_username VARCHAR(255) NOT NULL, -- e.g., "lomi_updates" (without @)
    channel_name VARCHAR(255) NOT NULL,
    channel_link VARCHAR(255) NOT NULL, -- https://t.me/lomi_updates
    
    coin_reward INTEGER NOT NULL DEFAULT 50,
    
    icon_url TEXT,
    
    is_active BOOLEAN DEFAULT TRUE,
    display_order INTEGER DEFAULT 0,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_reward_channels_is_active ON reward_channels(is_active);
CREATE INDEX idx_reward_channels_display_order ON reward_channels(display_order);

-- ============================================================================
-- USER CHANNEL REWARDS TABLE (Track claims)
-- ============================================================================

CREATE TABLE user_channel_rewards (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    channel_id UUID NOT NULL REFERENCES reward_channels(id) ON DELETE CASCADE,
    
    reward_amount INTEGER NOT NULL,
    
    claimed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    UNIQUE(user_id, channel_id) -- User can only claim once per channel
);

CREATE INDEX idx_user_channel_rewards_user_id ON user_channel_rewards(user_id);

-- ============================================================================
-- ADMIN USERS TABLE
-- ============================================================================

CREATE TABLE admin_users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    
    full_name VARCHAR(255) NOT NULL,
    role VARCHAR(50) DEFAULT 'moderator',  -- moderator, admin, super_admin
    
    is_active BOOLEAN DEFAULT TRUE,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_admin_users_email ON admin_users(email);
CREATE INDEX idx_admin_users_role ON admin_users(role);

-- ============================================================================
-- FUNCTIONS & TRIGGERS
-- ============================================================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply updated_at trigger to all relevant tables
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_media_updated_at BEFORE UPDATE ON media FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_verifications_updated_at BEFORE UPDATE ON verifications FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_messages_updated_at BEFORE UPDATE ON messages FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_gifts_updated_at BEFORE UPDATE ON gifts FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_coin_transactions_updated_at BEFORE UPDATE ON coin_transactions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_payouts_updated_at BEFORE UPDATE ON payouts FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_reports_updated_at BEFORE UPDATE ON reports FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_discover_feed_updated_at BEFORE UPDATE ON discover_feed FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_reward_channels_updated_at BEFORE UPDATE ON reward_channels FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_admin_users_updated_at BEFORE UPDATE ON admin_users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- INITIAL DATA COMMENTS
-- ============================================================================

COMMENT ON TABLE users IS 'Main user profiles with Telegram integration';
COMMENT ON TABLE media IS 'User photos and videos for profiles and discover feed';
COMMENT ON TABLE verifications IS 'ID verification submissions for Lomi Verified badge';
COMMENT ON TABLE swipes IS 'User swipe actions (like, pass, super_like)';
COMMENT ON TABLE matches IS 'Mutual matches between users';
COMMENT ON TABLE messages IS 'Chat messages between matched users';
COMMENT ON TABLE gifts IS 'Catalog of purchasable gifts';
COMMENT ON TABLE gift_transactions IS 'History of gifts sent between users';
COMMENT ON TABLE coin_transactions IS 'All coin-related transactions (purchases, spending)';
COMMENT ON TABLE payouts IS 'Cashout requests from users converting gifts to Birr';
COMMENT ON TABLE reports IS 'User reports for inappropriate content or behavior';
COMMENT ON TABLE blocks IS 'User blocking relationships';
COMMENT ON TABLE discover_feed IS 'Algorithm-driven explore feed content';
COMMENT ON TABLE admin_users IS 'Admin panel users for moderation';
