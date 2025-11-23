#!/bin/bash

# Quick Caddy Fix Script
# Run this ON THE SERVER to fix Caddy immediately

echo "🔧 Quick Caddy Fix"
echo "=================="
echo ""

# 1. Stop Caddy
echo "1️⃣ Stopping Caddy..."
sudo systemctl stop caddy 2>/dev/null || true
sleep 2

# 2. Check current Caddyfile
echo "2️⃣ Checking current Caddyfile..."
if [ -f "/etc/caddy/Caddyfile" ]; then
    echo "Current Caddyfile exists"
    # Show first few lines to see what's there
    echo "First 10 lines:"
    sudo head -10 /etc/caddy/Caddyfile
else
    echo "No Caddyfile found!"
fi

# 3. Create minimal working Caddyfile
echo ""
echo "3️⃣ Creating minimal working Caddyfile..."
sudo tee /etc/caddy/Caddyfile > /dev/null <<'EOF'
# Minimal working Caddyfile - no logging, no SSL delays
:80 {
    # Handle OPTIONS preflight
    @options {
        method OPTIONS
        path /api/*
    }
    handle @options {
        header {
            Access-Control-Allow-Origin "*"
            Access-Control-Allow-Methods "GET, POST, PUT, DELETE, OPTIONS, PATCH"
            Access-Control-Allow-Headers "Content-Type, Authorization, X-Requested-With"
            Access-Control-Max-Age "3600"
        }
        respond 204
    }
    
    # API routes
    handle /api/* {
        reverse_proxy localhost:8080 {
            header_up Host {host}
            header_up X-Real-IP {remote}
        }
    }
    
    # WebSocket
    handle /ws {
        reverse_proxy localhost:8080 {
            header_up Host {host}
        }
    }
    
    # Frontend
    handle {
        root * /var/www/lomi-frontend
        try_files {path} /index.html
        file_server
    }
    
    # CORS headers
    header {
        Access-Control-Allow-Origin "*"
        Access-Control-Allow-Methods "GET, POST, PUT, DELETE, OPTIONS, PATCH"
        Access-Control-Allow-Headers "Content-Type, Authorization, X-Requested-With"
    }
}

# HTTPS domain (with local_certs to avoid Let's Encrypt delays)
lomi.social {
    local_certs
    
    # Handle OPTIONS preflight
    @options {
        method OPTIONS
        path /api/*
    }
    handle @options {
        header {
            Access-Control-Allow-Origin "*"
            Access-Control-Allow-Methods "GET, POST, PUT, DELETE, OPTIONS, PATCH"
            Access-Control-Allow-Headers "Content-Type, Authorization, X-Requested-With"
            Access-Control-Max-Age "3600"
        }
        respond 204
    }
    
    # API routes
    handle /api/* {
        reverse_proxy localhost:8080 {
            header_up Host {host}
            header_up X-Real-IP {remote}
        }
    }
    
    # WebSocket
    handle /ws {
        reverse_proxy localhost:8080 {
            header_up Host {host}
        }
    }
    
    # Frontend
    handle {
        root * /var/www/lomi-frontend
        try_files {path} /index.html
        file_server
    }
    
    # CORS headers
    header {
        Access-Control-Allow-Origin "*"
        Access-Control-Allow-Methods "GET, POST, PUT, DELETE, OPTIONS, PATCH"
        Access-Control-Allow-Headers "Content-Type, Authorization, X-Requested-With"
    }
}
EOF

# 4. Validate
echo ""
echo "4️⃣ Validating Caddyfile..."
if sudo caddy validate --config /etc/caddy/Caddyfile; then
    echo "✅ Caddyfile is valid"
else
    echo "❌ Validation failed!"
    sudo caddy validate --config /etc/caddy/Caddyfile
    exit 1
fi

# 5. Start Caddy
echo ""
echo "5️⃣ Starting Caddy..."
sudo systemctl start caddy
sleep 3

# 6. Check status
echo ""
echo "6️⃣ Checking Caddy status..."
if sudo systemctl is-active --quiet caddy; then
    echo "✅ Caddy is running!"
    sudo systemctl status caddy --no-pager -l | head -5
else
    echo "❌ Caddy failed to start!"
    echo ""
    echo "Recent logs:"
    sudo journalctl -u caddy -n 30 --no-pager | tail -20
fi

echo ""
echo "Done! Test with: curl http://152.53.87.200/api/v1/health"

