#!/bin/bash

# Fix Caddy Service
# Run this on your server

echo "🔧 Fixing Caddy..."

# Check Caddy logs
echo "📋 Checking Caddy logs..."
sudo journalctl -u caddy -n 50 --no-pager | tail -20

# Validate Caddyfile
echo ""
echo "✅ Validating Caddyfile..."
if sudo caddy validate --config /etc/caddy/Caddyfile 2>&1; then
    echo "Caddyfile is valid"
else
    echo "❌ Caddyfile has errors!"
    echo "Using simple Caddyfile instead..."
    sudo cp Caddyfile.simple /etc/caddy/Caddyfile
fi

# Check if DNS is configured
echo ""
echo "🔍 Checking DNS..."
LOMI_DNS=$(dig +short lomi.social 2>/dev/null)
API_DNS=$(dig +short api.lomi.social 2>/dev/null)

if [ -z "$LOMI_DNS" ] || [ -z "$API_DNS" ]; then
    echo "⚠️  DNS not configured yet"
    echo "Using IP-based Caddyfile (no SSL for now)"
    sudo cp Caddyfile.simple /etc/caddy/Caddyfile
else
    echo "✅ DNS is configured"
    echo "Using domain-based Caddyfile"
    sudo cp Caddyfile /etc/caddy/Caddyfile
fi

# Restart Caddy
echo ""
echo "🔄 Restarting Caddy..."
sudo systemctl restart caddy
sleep 2

# Check status
echo ""
echo "📊 Caddy status:"
sudo systemctl status caddy --no-pager -l | head -15

echo ""
echo "✅ Done! Check status above."

