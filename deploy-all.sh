#!/bin/bash

# Complete Deployment Script
# Pulls updates, restarts backend, and builds/deploys frontend
# Run this ON THE SERVER

set -e

echo "🚀 Starting complete deployment..."
echo ""

# Get project directory
if [ -d "/opt/lomi_mini" ]; then
    PROJECT_DIR="/opt/lomi_mini"
elif [ -d "~/lomi_mini" ]; then
    PROJECT_DIR="~/lomi_mini"
elif [ -d "." ] && [ -f "docker-compose.prod.yml" ]; then
    PROJECT_DIR="."
else
    echo "❌ Error: Could not find project directory"
    exit 1
fi

cd "$PROJECT_DIR"
echo "📁 Project directory: $PROJECT_DIR"
echo ""

# Check for .env.production
if [ ! -f ".env.production" ]; then
    echo "❌ Error: .env.production not found!"
    echo "Create it with your environment variables"
    exit 1
fi

# Load environment variables
echo "📋 Loading environment variables..."
export $(cat .env.production | grep -v '^#' | grep -v '^$' | xargs)
echo "✅ Environment variables loaded"
echo ""

# Step 1: Pull latest code
echo "📥 Step 1: Pulling latest code from GitHub..."
git pull origin main
echo "✅ Code updated"
echo ""

# Step 2: Restart backend (Docker containers)
echo "🔄 Step 2: Restarting backend..."
echo "Stopping old containers..."
docker-compose -f docker-compose.prod.yml down

# Free port 8080 if needed
echo "Freeing port 8080..."
if command -v lsof > /dev/null 2>&1; then
    sudo kill -9 $(sudo lsof -ti:8080) 2>/dev/null || true
elif command -v fuser > /dev/null 2>&1; then
    sudo fuser -k 8080/tcp 2>/dev/null || true
fi
sleep 2

echo "Building backend (if needed)..."
docker-compose -f docker-compose.prod.yml build backend

echo "Starting backend services..."
docker-compose -f docker-compose.prod.yml up -d

echo "Waiting for services to be healthy..."
sleep 5

# Check backend health
echo "Checking backend health..."
for i in {1..10}; do
    if curl -s http://localhost:8080/api/v1/health > /dev/null; then
        echo "✅ Backend is healthy"
        break
    fi
    if [ $i -eq 10 ]; then
        echo "⚠️  Backend health check failed, but continuing..."
    else
        echo "Waiting for backend... ($i/10)"
        sleep 2
    fi
done
echo ""

# Step 3: Build and deploy frontend
echo "📦 Step 3: Building and deploying frontend..."
cd frontend

# Install dependencies
echo "Installing dependencies..."
npm install

# Build
echo "Building Expo web..."
npx expo export -p web

if [ ! -d "dist" ]; then
    echo "❌ Error: Build failed - dist directory not found"
    exit 1
fi

# Deploy
echo "Deploying to /var/www/lomi-frontend..."
sudo mkdir -p /var/www/lomi-frontend
sudo cp -r dist/* /var/www/lomi-frontend/
sudo chown -R www-data:www-data /var/www/lomi-frontend
sudo chmod -R 755 /var/www/lomi-frontend

echo "✅ Frontend deployed"
echo ""

# Step 4: Reload Caddy
echo "🔄 Step 4: Reloading Caddy..."
sudo systemctl reload caddy
echo "✅ Caddy reloaded"
echo ""

# Summary
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Deployment Complete!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "📊 Status:"
echo "  Backend:  http://localhost:8080/api/v1/health"
echo "  Frontend: http://152.53.87.200"
echo "  API:      https://api.lomi.social/api/v1/health"
echo ""
echo "🐳 Docker containers:"
docker-compose -f docker-compose.prod.yml ps
echo ""
echo "✅ All done! Your app is live 🚀"

