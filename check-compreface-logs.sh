#!/bin/bash

# Check CompreFace logs in detail

set -e

# Load environment variables
if [ -f ".env.production" ]; then
    set -a
    source .env.production
    set +a
fi

echo "📋 CompreFace Logs Analysis"
echo "==========================="
echo ""

echo "1. Last 50 lines of logs:"
docker-compose -f docker-compose.prod.yml --env-file .env.production logs --tail=50 compreface
echo ""

echo "2. Looking for errors:"
docker-compose -f docker-compose.prod.yml --env-file .env.production logs compreface 2>&1 | grep -i "error\|failed\|exception\|fatal" | tail -20 || echo "   No obvious errors found"
echo ""

echo "3. Looking for startup messages:"
docker-compose -f docker-compose.prod.yml --env-file .env.production logs compreface 2>&1 | grep -i "start\|listen\|ready\|running\|port" | tail -20 || echo "   No startup messages found"
echo ""

echo "4. Container resource usage:"
docker stats lomi_compreface --no-stream --format "table {{.Container}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.NetIO}}" 2>/dev/null || echo "   Could not get stats"
echo ""

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "💡 If CompreFace is not starting, we might need to:"
echo "   1. Use a different CompreFace image (compreface-api instead of compreface-core)"
echo "   2. Use a simpler face detection solution"
echo "   3. Check if CompreFace needs additional services"
echo ""

