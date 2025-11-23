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
git fetch origin
git reset --hard origin/main
echo "✅ Code updated (reset to match GitHub exactly)"
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
docker-compose -f docker-compose.prod.yml ps
echo ""
echo "✅ All done! Your app is live 🚀"

