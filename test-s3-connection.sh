#!/bin/bash

# Test S3/R2 Connection Script
# Run this ON THE SERVER to test bucket connectivity

set -e

echo "🧪 Testing S3/R2 Connection"
echo "============================"
echo ""

# Load environment variables
if [ -f ".env.production" ]; then
    echo "📋 Loading environment variables from .env.production..."
    set -a
    source .env.production
    set +a
    echo "✅ Environment variables loaded"
else
    echo "⚠️  .env.production not found, using environment variables"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📊 Configuration"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "S3_ENDPOINT: ${S3_ENDPOINT:-not set}"
echo "S3_ACCESS_KEY: ${S3_ACCESS_KEY:0:10}... (first 10 chars)"
echo "S3_SECRET_KEY: ${S3_SECRET_KEY:0:10}... (first 10 chars)"
echo "S3_USE_SSL: ${S3_USE_SSL:-not set}"
echo "S3_REGION: ${S3_REGION:-not set}"
echo "S3_BUCKET_PHOTOS: ${S3_BUCKET_PHOTOS:-not set}"
echo ""

# Test 1: Check if backend is running
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Test 1: Backend Health Check"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
if curl -s http://localhost:8080/api/v1/health > /dev/null; then
    echo "✅ Backend is running"
else
    echo "❌ Backend is not running"
    echo "   Start backend: docker-compose -f docker-compose.prod.yml up -d backend"
    exit 1
fi
echo ""

# Test 2: Get a test JWT token (you'll need to authenticate first)
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Test 2: Get Upload URL (requires authentication)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "To test upload URL generation, you need a JWT token."
echo "First, authenticate via Telegram, then run:"
echo ""
echo "  TOKEN='your-jwt-token-here'"
echo "  curl -X GET 'http://localhost:8080/api/v1/users/media/upload-url?media_type=photo' \\"
echo "    -H \"Authorization: Bearer \$TOKEN\""
echo ""

# Test 3: Test S3 connection using AWS CLI (if available)
if command -v aws > /dev/null 2>&1; then
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "Test 3: AWS CLI Connection Test"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    
    # Configure AWS CLI for R2
    export AWS_ACCESS_KEY_ID="${S3_ACCESS_KEY}"
    export AWS_SECRET_ACCESS_KEY="${S3_SECRET_KEY}"
    export AWS_DEFAULT_REGION="${S3_REGION:-auto}"
    
    # Test endpoint
    ENDPOINT="${S3_ENDPOINT}"
    if [[ ! "$ENDPOINT" =~ ^https?:// ]]; then
        if [ "${S3_USE_SSL}" = "true" ]; then
            ENDPOINT="https://${ENDPOINT}"
        else
            ENDPOINT="http://${ENDPOINT}"
        fi
    fi
    
    echo "Testing endpoint: $ENDPOINT"
    echo "Bucket: ${S3_BUCKET_PHOTOS}"
    echo ""
    
    # Try to list buckets (R2 specific)
    echo "Attempting to list buckets..."
    if aws s3 ls --endpoint-url "$ENDPOINT" 2>&1; then
        echo "✅ Successfully connected to R2/S3"
    else
        echo "❌ Failed to connect to R2/S3"
        echo "   Check your credentials and endpoint"
    fi
    echo ""
    
    # Try to list objects in photos bucket
    if [ -n "${S3_BUCKET_PHOTOS}" ]; then
        echo "Attempting to list objects in bucket: ${S3_BUCKET_PHOTOS}"
        if aws s3 ls "s3://${S3_BUCKET_PHOTOS}" --endpoint-url "$ENDPOINT" 2>&1 | head -5; then
            echo "✅ Bucket is accessible"
        else
            echo "❌ Cannot access bucket (might not exist or wrong permissions)"
        fi
    fi
else
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "Test 3: AWS CLI not installed"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "Install AWS CLI to test S3 connection:"
    echo "  apt-get install awscli  # Debian/Ubuntu"
    echo "  yum install awscli       # CentOS/RHEL"
fi
echo ""

# Test 4: Check backend logs for S3 connection
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Test 4: Backend S3 Connection Logs"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Checking backend logs for S3 connection status..."
docker-compose -f docker-compose.prod.yml logs backend 2>/dev/null | grep -i "s3\|r2\|storage" | tail -10 || echo "No S3 logs found"
echo ""

# Test 5: Test with curl (if we have credentials)
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Test 5: Direct Endpoint Test"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
ENDPOINT="${S3_ENDPOINT}"
if [[ ! "$ENDPOINT" =~ ^https?:// ]]; then
    if [ "${S3_USE_SSL}" = "true" ]; then
        ENDPOINT="https://${ENDPOINT}"
    else
        ENDPOINT="http://${ENDPOINT}"
    fi
fi

echo "Testing endpoint connectivity: $ENDPOINT"
if curl -s -o /dev/null -w "%{http_code}" --max-time 5 "$ENDPOINT" > /dev/null 2>&1; then
    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 "$ENDPOINT" 2>&1)
    echo "Response code: $HTTP_CODE"
    if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "403" ] || [ "$HTTP_CODE" = "400" ]; then
        echo "✅ Endpoint is reachable"
    else
        echo "⚠️  Endpoint returned: $HTTP_CODE"
    fi
else
    echo "❌ Cannot reach endpoint (might be firewall or DNS issue)"
fi
echo ""

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Testing Complete"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "💡 Next steps:"
echo "   1. Check backend logs: docker-compose -f docker-compose.prod.yml logs backend"
echo "   2. Verify buckets exist in Cloudflare R2 dashboard"
echo "   3. Check CORS settings for buckets"
echo "   4. Test upload URL generation with a valid JWT token"

