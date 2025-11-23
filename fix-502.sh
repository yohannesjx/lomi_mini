#!/bin/bash

# Fix 502 Bad Gateway - Backend not reachable
# Run this ON THE SERVER via SSH

set -e

echo "🔍 Diagnosing 502 Bad Gateway error..."
echo ""

cd /opt/lomi_mini || cd ~/lomi_mini || (echo "❌ Could not find project directory" && exit 1)

# Step 1: Check if backend container is running
echo "📊 Step 1: Checking Docker containers..."
docker-compose -f docker-compose.prod.yml ps

echo ""
echo "📊 All Docker containers:"
docker ps -a | grep lomi || echo "No lomi containers found"

echo ""
echo "🔍 Step 2: Checking if backend is listening on port 8080..."
if curl -s http://localhost:8080/api/v1/health > /dev/null; then
    echo "✅ Backend is responding on port 8080"
    curl http://localhost:8080/api/v1/health
else
    echo "❌ Backend is NOT responding on port 8080"
    echo ""
    echo "Checking what's using port 8080..."
    sudo lsof -i :8080 || echo "Nothing listening on port 8080"
fi

echo ""
echo "🔍 Step 3: Checking backend logs..."
echo "Last 30 lines of backend logs:"
docker-compose -f docker-compose.prod.yml logs --tail=30 backend

echo ""
echo "🔍 Step 4: Checking Caddy configuration..."
if [ -f "/etc/caddy/Caddyfile" ]; then
    echo "Caddyfile reverse_proxy configuration:"
    grep -A 5 "reverse_proxy" /etc/caddy/Caddyfile || echo "No reverse_proxy found"
else
    echo "⚠️  Caddyfile not found at /etc/caddy/Caddyfile"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🔧 Attempting to fix..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Try to restart backend
echo "🔄 Restarting backend container..."
docker-compose -f docker-compose.prod.yml restart backend

echo "⏳ Waiting for backend to start..."
sleep 10

# Check again
echo ""
echo "🔍 Checking backend health again..."
for i in {1..10}; do
    if curl -s http://localhost:8080/api/v1/health > /dev/null; then
        echo "✅ Backend is now healthy!"
        curl http://localhost:8080/api/v1/health
        break
    fi
    if [ $i -eq 10 ]; then
        echo "❌ Backend still not responding"
        echo ""
        echo "Trying to rebuild backend..."
        docker-compose -f docker-compose.prod.yml stop backend
        docker-compose -f docker-compose.prod.yml build backend
        docker-compose -f docker-compose.prod.yml up -d backend
        echo "⏳ Waiting for rebuild..."
        sleep 15
        if curl -s http://localhost:8080/api/v1/health > /dev/null; then
            echo "✅ Backend is now healthy after rebuild!"
        else
            echo "❌ Backend still failing. Check logs:"
            docker-compose -f docker-compose.prod.yml logs --tail=50 backend
        fi
    else
        echo "Waiting... ($i/10)"
        sleep 2
    fi
done

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Diagnosis complete!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Test the endpoint:"
echo "  curl -v http://localhost:8080/api/v1/health"
echo "  curl -v -X POST http://localhost/api/v1/auth/telegram -H 'Authorization: tma test'"

