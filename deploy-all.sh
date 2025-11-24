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
elif [ -d "/root/lomi_mini" ]; then
    PROJECT_DIR="/root/lomi_mini"
elif [ -d "$HOME/lomi_mini" ]; then
    PROJECT_DIR="$HOME/lomi_mini"
elif [ -d "." ] && [ -f "docker-compose.prod.yml" ]; then
    PROJECT_DIR="."
else
    echo "❌ Error: Could not find project directory"
    echo "   Checked: /opt/lomi_mini, /root/lomi_mini, $HOME/lomi_mini, ."
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
echo "📋 Loading environment variables from .env.production..."
set -a  # Automatically export all variables
source .env.production
set +a  # Stop automatically exporting

# Validate required environment variables
echo "🔍 Validating required environment variables..."
REQUIRED_VARS=("DB_PASSWORD" "REDIS_PASSWORD" "JWT_SECRET" "TELEGRAM_BOT_TOKEN")
MISSING_VARS=()

for var in "${REQUIRED_VARS[@]}"; do
    if [ -z "${!var}" ]; then
        MISSING_VARS+=("$var")
    fi
done

if [ ${#MISSING_VARS[@]} -gt 0 ]; then
    echo "❌ Error: Missing required environment variables:"
    for var in "${MISSING_VARS[@]}"; do
        echo "   - $var"
    done
    echo ""
    echo "Please set these in .env.production"
    exit 1
fi

echo "✅ Environment variables loaded and validated"
echo ""

# Step 1: Pull latest code
echo "📥 Step 1: Pulling latest code from GitHub..."
git fetch origin
git reset --hard origin/main
echo "✅ Code updated (reset to match GitHub exactly)"
echo ""

# Step 2: Restart backend (Docker containers)
echo "🔄 Step 2: Restarting backend..."
echo "Stopping old containers and removing orphans..."
docker-compose -f docker-compose.prod.yml --env-file .env.production down --remove-orphans

# Free port 8080 if needed
echo "Freeing port 8080..."
if command -v lsof > /dev/null 2>&1; then
    sudo kill -9 $(sudo lsof -ti:8080) 2>/dev/null || true
elif command -v fuser > /dev/null 2>&1; then
    sudo fuser -k 8080/tcp 2>/dev/null || true
fi
sleep 2

echo "Building backend (if needed)..."
docker-compose -f docker-compose.prod.yml --env-file .env.production build backend

echo "Starting backend services..."
docker-compose -f docker-compose.prod.yml --env-file .env.production up -d

echo "Waiting for services to start..."
sleep 10

# Check container status
echo "Checking container status..."
docker-compose -f docker-compose.prod.yml ps

# Wait for containers to be healthy
echo "Waiting for containers to be healthy..."
MAX_WAIT=60
WAITED=0
while [ $WAITED -lt $MAX_WAIT ]; do
    # Check if postgres is healthy
    POSTGRES_HEALTH=$(docker inspect --format='{{.State.Health.Status}}' lomi_postgres 2>/dev/null || echo "unknown")
    # Check if redis is healthy
    REDIS_HEALTH=$(docker inspect --format='{{.State.Health.Status}}' lomi_redis 2>/dev/null || echo "unknown")
    # Check if backend is running
    BACKEND_STATUS=$(docker inspect --format='{{.State.Status}}' lomi_backend 2>/dev/null || echo "unknown")
    
    if [ "$POSTGRES_HEALTH" = "healthy" ] && [ "$REDIS_HEALTH" = "healthy" ] && [ "$BACKEND_STATUS" = "running" ]; then
        echo "✅ All containers are healthy/running"
        break
    fi
    
    echo "Waiting... (Postgres: $POSTGRES_HEALTH, Redis: $REDIS_HEALTH, Backend: $BACKEND_STATUS) - ${WAITED}s/${MAX_WAIT}s"
    sleep 5
    WAITED=$((WAITED + 5))
done

# Check backend health endpoint
echo ""
echo "Checking backend health endpoint..."
for i in {1..15}; do
    if curl -s -f http://localhost:8080/api/v1/health > /dev/null 2>&1; then
        echo "✅ Backend is responding on port 8080"
        curl -s http://localhost:8080/api/v1/health | head -1
        break
    fi
    if [ $i -eq 15 ]; then
        echo "❌ Backend health check failed after 30 seconds"
        echo ""
        echo "Checking backend logs..."
        docker-compose -f docker-compose.prod.yml logs --tail=50 backend
        echo ""
        echo "⚠️  Backend may still be starting. Check logs above."
    else
        echo "Waiting for backend to respond... ($i/15)"
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

# Go back to project root
cd "$PROJECT_DIR"

# Step 4: Update and reload Caddy
echo "🔄 Step 4: Updating Caddy configuration..."

# Use main Caddyfile (not .fixed version which has logging issues)
if [ -f "Caddyfile" ]; then
    echo "📝 Using Caddyfile from repo"
    sudo cp Caddyfile /etc/caddy/Caddyfile
else
    echo "⚠️  No Caddyfile found in repo, keeping existing configuration"
fi

if [ -f "/etc/caddy/Caddyfile" ]; then
    echo "Validating Caddyfile..."
    if timeout 10 sudo caddy validate --config /etc/caddy/Caddyfile 2>/dev/null; then
        echo "✅ Caddyfile is valid"
        echo "Creating backup of current Caddyfile..."
        sudo cp /etc/caddy/Caddyfile /etc/caddy/Caddyfile.backup 2>/dev/null || true
        
        echo "Stopping Caddy first..."
        sudo systemctl stop caddy 2>/dev/null || true
        sleep 2
        
        echo "Starting Caddy with new configuration..."
        # Use start instead of restart to avoid issues
        if timeout 20 sudo systemctl start caddy; then
            sleep 3
            # Verify Caddy is running
            if sudo systemctl is-active --quiet caddy; then
                echo "✅ Caddy started successfully"
            else
                echo "❌ Caddy failed to start!"
                echo "Checking Caddy status and logs..."
                sudo systemctl status caddy --no-pager -l | head -20
                echo ""
                echo "Recent Caddy logs:"
                sudo journalctl -u caddy -n 30 --no-pager | tail -20
                echo ""
                echo "Attempting to restore backup..."
                if [ -f "/etc/caddy/Caddyfile.backup" ]; then
                    sudo cp /etc/caddy/Caddyfile.backup /etc/caddy/Caddyfile
                    sudo systemctl start caddy || true
                    sleep 2
                    if sudo systemctl is-active --quiet caddy; then
                        echo "✅ Restored backup and Caddy is running"
                    else
                        echo "❌ Caddy still failing even with backup"
                    fi
                fi
            fi
        else
            echo "❌ Caddy start timed out or failed"
            echo "Checking what went wrong..."
            sudo journalctl -u caddy -n 30 --no-pager | tail -20
            echo ""
            echo "Restoring backup..."
            if [ -f "/etc/caddy/Caddyfile.backup" ]; then
                sudo cp /etc/caddy/Caddyfile.backup /etc/caddy/Caddyfile
                sudo systemctl start caddy || true
            fi
        fi
    else
        echo "❌ Caddyfile validation failed or timed out!"
        echo "Showing validation errors:"
        timeout 10 sudo caddy validate --config /etc/caddy/Caddyfile 2>&1 || echo "Validation command timed out"
        echo ""
        echo "⚠️  Keeping old Caddyfile, restoring backup..."
        if [ -f "/etc/caddy/Caddyfile.backup" ]; then
            sudo cp /etc/caddy/Caddyfile.backup /etc/caddy/Caddyfile
            timeout 30 sudo systemctl reload caddy || true
            echo "✅ Restored previous working configuration"
        else
            echo "⚠️  No backup found, keeping current Caddyfile"
        fi
    fi
else
    echo "⚠️  No Caddyfile found, skipping Caddy update"
fi
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
if [ -f ".env.production" ]; then
    docker-compose -f docker-compose.prod.yml --env-file .env.production ps
else
    echo "⚠️  .env.production not found, using environment variables"
    docker-compose -f docker-compose.prod.yml ps
fi
echo ""

# Final health check
echo "🔍 Final health check..."
if curl -s -f http://localhost:8080/api/v1/health > /dev/null 2>&1; then
    echo "✅ Backend is healthy and responding"
else
    echo "⚠️  Backend health check failed - check logs:"
    echo "   docker-compose -f docker-compose.prod.yml logs backend"
fi

echo ""
echo "✅ All done! Your app is live 🚀"

