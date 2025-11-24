#!/bin/bash

# Fix CompreFace connectivity issues

set -e

# Load environment variables
if [ -f ".env.production" ]; then
    set -a
    source .env.production
    set +a
fi

echo "🔧 Fixing CompreFace Setup"
echo "=========================="
echo ""

# Check if container exists
echo "1. Checking CompreFace container..."
CONTAINER_EXISTS=$(docker-compose -f docker-compose.prod.yml --env-file .env.production ps compreface 2>/dev/null | grep -v "NAME" | wc -l || echo "0")

if [ "$CONTAINER_EXISTS" = "0" ]; then
    echo "❌ CompreFace container not found"
    echo ""
    echo "🚀 Starting CompreFace..."
    docker-compose -f docker-compose.prod.yml --env-file .env.production up -d compreface
    echo "⏳ Waiting for CompreFace to start (30 seconds)..."
    sleep 30
else
    echo "✅ CompreFace container exists"
    CONTAINER_STATUS=$(docker-compose -f docker-compose.prod.yml --env-file .env.production ps compreface 2>/dev/null | grep -v "NAME" | awk '{print $7}' || echo "unknown")
    echo "   Status: $CONTAINER_STATUS"
    
    if [ "$CONTAINER_STATUS" != "Up" ] && [ "$CONTAINER_STATUS" != "running" ]; then
        echo "🚀 Starting CompreFace container..."
        docker-compose -f docker-compose.prod.yml --env-file .env.production up -d compreface
        echo "⏳ Waiting for CompreFace to start (30 seconds)..."
        sleep 30
    fi
fi

echo ""

# Check container logs for errors
echo "2. Checking CompreFace logs for errors..."
RECENT_LOGS=$(docker-compose -f docker-compose.prod.yml --env-file .env.production logs --tail=30 compreface 2>/dev/null || echo "")

if echo "$RECENT_LOGS" | grep -qi "error\|failed\|exception"; then
    echo "⚠️  Found errors in logs:"
    echo "$RECENT_LOGS" | grep -i "error\|failed\|exception" | tail -5
else
    echo "✅ No obvious errors in recent logs"
fi

echo ""

# Test from within Docker network (this is what workers use)
echo "3. Testing from Docker network (what workers use)..."
# Try from backend container (has curl) or worker container (has python/requests)
if docker-compose -f docker-compose.prod.yml --env-file .env.production exec -T backend curl --version >/dev/null 2>&1; then
    NETWORK_TEST=$(docker-compose -f docker-compose.prod.yml --env-file .env.production exec -T backend curl -s -w "\nHTTP_CODE:%{http_code}" --connect-timeout 10 "http://compreface:8000/api/v1/health" 2>&1 || echo "FAILED")
elif docker-compose -f docker-compose.prod.yml --env-file .env.production exec -T moderator-worker python3 -c "import requests; r=requests.get('http://compreface:8000/api/v1/health', timeout=10); print(r.text); print(f'HTTP_CODE:{r.status_code}')" 2>&1; then
    NETWORK_TEST=$(docker-compose -f docker-compose.prod.yml --env-file .env.production exec -T moderator-worker python3 -c "import requests; r=requests.get('http://compreface:8000/api/v1/health', timeout=10); print(r.text); print(f'HTTP_CODE:{r.status_code}')" 2>&1 || echo "FAILED")
else
    # Fallback: test from host
    NETWORK_TEST=$(curl -s -w "\nHTTP_CODE:%{http_code}" --connect-timeout 10 "http://localhost:8000/api/v1/health" 2>&1 || echo "FAILED")
fi
NETWORK_HTTP=$(echo "$NETWORK_TEST" | grep "HTTP_CODE:" | cut -d: -f2 || echo "000")
NETWORK_BODY=$(echo "$NETWORK_TEST" | grep -v "HTTP_CODE:" | head -1)

if [ "$NETWORK_HTTP" = "200" ]; then
    echo "✅ Workers CAN reach CompreFace via Docker network!"
    echo "   Response: $NETWORK_BODY"
    echo ""
    echo "🎉 CompreFace is working! The issue was likely that it wasn't running."
else
    echo "❌ Workers still cannot reach CompreFace (HTTP $NETWORK_HTTP)"
    echo "   Error: $NETWORK_BODY"
    echo ""
    echo "💡 Troubleshooting steps:"
    echo "   1. Check if CompreFace is on the same network:"
    echo "      docker network inspect lomi_mini_lomi_network | grep compreface"
    echo ""
    echo "   2. Check CompreFace logs:"
    echo "      docker-compose -f docker-compose.prod.yml --env-file .env.production logs compreface"
    echo ""
    echo "   3. Try restarting CompreFace:"
    echo "      docker-compose -f docker-compose.prod.yml --env-file .env.production restart compreface"
    echo ""
    echo "   4. Check if port 8000 is accessible inside container:"
    echo "      docker-compose -f docker-compose.prod.yml --env-file .env.production exec compreface curl http://localhost:8000/api/v1/health"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📋 Next Steps:"
echo "   1. If CompreFace is working, restart workers to pick up the fix:"
echo "      docker-compose -f docker-compose.prod.yml --env-file .env.production restart moderator-worker"
echo ""
echo "   2. Test moderation again by uploading photos"
echo ""
echo "   3. Check worker logs to see if face detection is working:"
echo "      docker-compose -f docker-compose.prod.yml --env-file .env.production logs -f moderator-worker"
echo ""

