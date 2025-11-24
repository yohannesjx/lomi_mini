#!/bin/bash

# Simple CompreFace test from host

set -e

echo "🔍 Quick CompreFace Test"
echo "======================="
echo ""

# Test 1: Check if port is listening
echo "1. Checking if port 8000 is open..."
if nc -z localhost 8000 2>/dev/null || timeout 2 bash -c "cat < /dev/null > /dev/tcp/localhost/8000" 2>/dev/null; then
    echo "✅ Port 8000 is open"
else
    echo "❌ Port 8000 is not accessible"
    echo "   CompreFace might not be running or port is not exposed"
    exit 1
fi

echo ""

# Test 2: Test health endpoint from host
echo "2. Testing health endpoint from host..."
HEALTH=$(curl -s --connect-timeout 5 "http://localhost:8000/api/v1/health" 2>&1 || echo "FAILED")

if echo "$HEALTH" | grep -q "FAILED\|Connection refused\|timeout"; then
    echo "❌ Cannot reach CompreFace from host"
    echo "   This is OK - workers connect via Docker network"
else
    echo "✅ CompreFace is responding!"
    echo "   Response: $HEALTH"
fi

echo ""

# Test 3: Test from worker container (what actually matters)
echo "3. Testing from worker container (this is what matters)..."
WORKER_TEST=$(docker-compose -f docker-compose.prod.yml --env-file .env.production exec -T moderator-worker python3 << 'PYTHON'
import requests
import sys
try:
    r = requests.get('http://compreface:8000/api/v1/health', timeout=10)
    print(f"HTTP_CODE:{r.status_code}")
    print(r.text[:200])
    sys.exit(0 if r.status_code == 200 else 1)
except Exception as e:
    print(f"ERROR:{str(e)}")
    sys.exit(1)
PYTHON
2>&1 || echo "FAILED")

if echo "$WORKER_TEST" | grep -q "HTTP_CODE:200"; then
    echo "✅ Workers CAN reach CompreFace!"
    echo "   This means moderation should work!"
    WORKER_RESPONSE=$(echo "$WORKER_TEST" | grep -v "HTTP_CODE")
    echo "   Response: $WORKER_RESPONSE"
elif echo "$WORKER_TEST" | grep -q "ERROR"; then
    echo "❌ Workers CANNOT reach CompreFace"
    ERROR_MSG=$(echo "$WORKER_TEST" | grep "ERROR:" | cut -d: -f2-)
    echo "   Error: $ERROR_MSG"
    echo ""
    echo "💡 Check:"
    echo "   - Are both containers on same network?"
    echo "   - Is CompreFace actually listening? Check logs:"
    echo "     docker-compose -f docker-compose.prod.yml --env-file .env.production logs compreface | tail -20"
else
    echo "⚠️  Could not test from worker (script issue)"
    echo "   Output: $WORKER_TEST"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📋 Summary:"
if echo "$WORKER_TEST" | grep -q "HTTP_CODE:200"; then
    echo "   ✅ CompreFace is working! Face detection should work now."
    echo ""
    echo "   Next: Restart workers and test moderation:"
    echo "   docker-compose -f docker-compose.prod.yml --env-file .env.production restart moderator-worker"
else
    echo "   ⚠️  CompreFace connectivity issue - check logs above"
fi
echo ""

