#!/bin/bash

# Quick script to update backend code and restart
# Run this ON THE SERVER via SSH

set -e

echo "🔄 Updating backend code..."

cd /opt/lomi_mini || cd ~/lomi_mini || (echo "❌ Could not find project directory" && exit 1)

echo "📥 Pulling latest code from GitHub..."
git fetch origin
git reset --hard origin/main

echo "🛑 Stopping backend container..."
docker-compose -f docker-compose.prod.yml stop backend

echo "🔨 Rebuilding backend (code changes require rebuild)..."
docker-compose -f docker-compose.prod.yml build backend

echo "🚀 Starting backend container..."
docker-compose -f docker-compose.prod.yml up -d backend

echo "⏳ Waiting for backend to be ready..."
sleep 5

echo "🏥 Checking backend health..."
for i in {1..10}; do
    if curl -s http://localhost:8080/api/v1/health > /dev/null; then
        echo "✅ Backend is healthy!"
        break
    fi
    if [ $i -eq 10 ]; then
        echo "⚠️  Backend health check failed"
        echo "Checking logs..."
        docker-compose -f docker-compose.prod.yml logs --tail=20 backend
    else
        echo "Waiting... ($i/10)"
        sleep 2
    fi
done

echo ""
echo "✅ Backend updated and restarted!"
echo ""
echo "Test the endpoint:"
echo "  curl -v -X POST http://localhost/api/v1/auth/telegram -H 'Authorization: tma test'"
echo ""
echo "Expected: HTTP 401 with error message (this is correct for invalid data)"

