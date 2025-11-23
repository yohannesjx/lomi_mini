#!/bin/bash

# Test Telegram Users - List all users registered via Telegram

set -e

echo "🔍 Testing Telegram User Registration"
echo "======================================"
echo ""

# Load environment variables
if [ -f ".env.production" ]; then
    set -a
    source .env.production
    set +a
fi

# Step 1: Authenticate to get token
echo "Step 1: Authenticating..."
read -p "Enter Telegram initData (or press Enter to use existing token): " INIT_DATA

if [ -n "$INIT_DATA" ]; then
    echo "Authenticating with initData..."
    AUTH_RESPONSE=$(curl -s -X POST http://localhost/api/v1/auth/telegram \
        -H "Authorization: tma $INIT_DATA")
    
    TOKEN=$(echo $AUTH_RESPONSE | jq -r '.access_token' 2>/dev/null || echo "")
    if [ -z "$TOKEN" ] || [ "$TOKEN" = "null" ]; then
        echo "❌ Authentication failed"
        echo "Response: $AUTH_RESPONSE"
        exit 1
    fi
    echo "✅ Authenticated"
else
    read -p "Enter JWT token: " TOKEN
    if [ -z "$TOKEN" ]; then
        echo "❌ Need either initData or JWT token"
        exit 1
    fi
fi

echo "Token: ${TOKEN:0:30}..."
echo ""

# Step 2: Get all users (Telegram only)
echo "Step 2: Fetching all Telegram users..."
echo ""

USERS_RESPONSE=$(curl -s -X GET "http://localhost/api/v1/users?telegram_only=true" \
    -H "Authorization: Bearer $TOKEN")

echo "Response:"
echo "$USERS_RESPONSE" | jq '.' 2>/dev/null || echo "$USERS_RESPONSE"
echo ""

# Extract count
COUNT=$(echo $USERS_RESPONSE | jq -r '.count' 2>/dev/null || echo "0")
TOTAL=$(echo $USERS_RESPONSE | jq -r '.total_count' 2>/dev/null || echo "0")

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📊 Summary:"
echo "   Users in this page: $COUNT"
echo "   Total Telegram users: $TOTAL"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Show user details
echo "👥 User Details:"
echo "$USERS_RESPONSE" | jq -r '.users[] | "  • Telegram ID: \(.telegram_id // "N/A") | Username: @\(.telegram_username // "N/A") | Name: \(.telegram_first_name // "N/A") \(.telegram_last_name // "") | Created: \(.created_at)"' 2>/dev/null || echo "   (Could not parse user details)"

echo ""
echo "✅ Test complete!"

