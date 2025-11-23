#!/bin/bash

# Simple Deployment Script
# Run this on your server after pulling code

set -e

echo "🚀 Deploying Lomi Social..."
echo ""

# Check if .env.production exists
if [ ! -f .env.production ]; then
    echo "❌ Error: .env.production not found!"
    echo "Create it with: nano .env.production"
    exit 1
fi

# Load environment variables
export $(cat .env.production | grep -v '^#' | xargs)

echo "📦 Pulling latest code..."
git fetch origin
git reset --hard origin/main || git reset --hard origin/master

echo "🛑 Stopping old containers..."
docker-compose -f docker-compose.prod.yml down

echo "🔨 Building backend..."
docker-compose -f docker-compose.prod.yml build backend

echo "🚀 Starting services..."
docker-compose -f docker-compose.prod.yml up -d

echo "⏳ Waiting for services..."
sleep 15

echo "🏥 Checking health..."
for i in {1..20}; do
    if curl -f http://localhost:8080/api/v1/health > /dev/null 2>&1; then
        echo "✅ Backend is healthy!"
        break
    fi
    if [ $i -eq 20 ]; then
        echo "❌ Health check failed"
        docker-compose -f docker-compose.prod.yml logs backend
        exit 1
    fi
    sleep 2
done

echo ""
echo "✅ Deployment complete!"
echo ""
echo "📊 Status:"
docker-compose -f docker-compose.prod.yml ps

