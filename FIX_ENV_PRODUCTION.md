# Fix .env.production File

The error `line 7: Social: command not found` happens because values with spaces need to be quoted.

## Fixed .env.production Content

Copy this to your server at `/opt/lomi_mini/.env.production`:

```bash
# Lomi Social - Production Environment Variables

# Application
APP_ENV=production
APP_PORT=8080
APP_NAME="Lomi Social API"

# Database (PostgreSQL)
DB_USER=lomi
DB_PASSWORD=d5YhNXB5zXhT7bkbbQ7
DB_NAME=lomi_db
DB_HOST=postgres
DB_PORT=5432
DB_SSL_MODE=disable
DB_MAX_OPEN_CONNS=25
DB_MAX_IDLE_CONNS=5

# Redis
REDIS_HOST=redis
REDIS_PORT=6379
REDIS_PASSWORD=r5YhNXB5zXhT7bkbbQ7
REDIS_DB=0

# JWT Authentication
JWT_SECRET=q9cN7w2Lk1xV4pF8eR0tS3zH6mJbYaUdPiGoTnW5Cs0
JWT_ACCESS_EXPIRY=24h
JWT_REFRESH_EXPIRY=168h

# Telegram Bot
TELEGRAM_BOT_TOKEN=8453633918:AAE6UxkHrplAxyKXXBLt56bQufhZpH-rVEM
TELEGRAM_BOT_USERNAME=lomi_social_bot

# Cloudflare R2 Storage (S3-compatible)
S3_ENDPOINT=https://a53cdfc7c678dac2a028159bcd178da2.r2.cloudflarestorage.com
S3_ACCESS_KEY=d46ab6ad318b1127d061533769bce800
S3_SECRET_KEY=2f1a730b2b691e8fbc5a33a8595132846cb335c19c523b90a2de173705285c20
S3_USE_SSL=true
S3_REGION=auto
S3_BUCKET_PHOTOS=lomi-photos
S3_BUCKET_VIDEOS=lomi-videos
S3_BUCKET_GIFTS=lomi-gifts
S3_BUCKET_VERIFICATIONS=lomi-verifications

# Payment Gateways (Optional)
TELEBIRR_API_KEY=
CBE_BIRR_API_KEY=
HELLOCASH_API_KEY=
AMOLE_API_KEY=

# Platform Settings
PLATFORM_FEE_PERCENTAGE=25
MIN_PAYOUT_AMOUNT=1000
COIN_TO_BIRR_RATE=0.10

# Push Notifications (Optional)
ONESIGNAL_APP_ID=
ONESIGNAL_API_KEY=
FIREBASE_SERVER_KEY=
```

## Key Fix

**Line 7** changed from:
```bash
APP_NAME=Lomi Social API
```

To:
```bash
APP_NAME="Lomi Social API"
```

The quotes are required when values contain spaces.

## Quick Fix on Server

```bash
# SSH to server
ssh root@lomi.social

# Edit the file
cd /opt/lomi_mini
nano .env.production

# Change line 7 from:
# APP_NAME=Lomi Social API
# To:
# APP_NAME="Lomi Social API"

# Save and exit (Ctrl+X, Y, Enter)
```

Or use sed to fix it automatically:
```bash
cd /opt/lomi_mini
sed -i 's/^APP_NAME=Lomi Social API$/APP_NAME="Lomi Social API"/' .env.production
```

