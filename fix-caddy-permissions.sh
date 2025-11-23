#!/bin/bash

# Fix Caddy Permissions and Configuration
# Run this on your server

echo "🔧 Fixing Caddy permissions and config..."

# Create log directory with proper permissions
echo "📁 Creating log directory..."
sudo mkdir -p /var/log/caddy
sudo chown -R caddy:caddy /var/log/caddy 2>/dev/null || sudo chown -R www-data:www-data /var/log/caddy 2>/dev/null || sudo chmod 777 /var/log/caddy

# Pull latest code
echo "📥 Pulling latest code..."
git fetch origin
git reset --hard origin/main

# Use simple Caddyfile (no log files, works without DNS)
echo "📝 Using simple Caddyfile (works without DNS)..."
sudo cp Caddyfile.simple /etc/caddy/Caddyfile

# Or if DNS is ready, use main Caddyfile (but fix logs)
# Uncomment below if DNS is configured:
# sudo cp Caddyfile /etc/caddy/Caddyfile
# sudo sed -i 's|output file /var/log/caddy|# output file /var/log/caddy|g' /etc/caddy/Caddyfile

# Validate
echo "✅ Validating Caddyfile..."
if sudo caddy validate --config /etc/caddy/Caddyfile; then
    echo "Caddyfile is valid!"
else
    echo "❌ Caddyfile has errors, using minimal config..."
    sudo tee /etc/caddy/Caddyfile > /dev/null <<'EOF'
:80 {
    handle /api/* {
        reverse_proxy localhost:8080
    }
    handle /ws {
        reverse_proxy localhost:8080
    }
    handle {
        root * /var/www/lomi-frontend
        try_files {path} /index.html
        file_server
    }
}
EOF
fi

# Restart Caddy
echo "🔄 Restarting Caddy..."
sudo systemctl restart caddy
sleep 2

# Check status
echo ""
echo "📊 Caddy status:"
sudo systemctl status caddy --no-pager -l | head -20

echo ""
echo "✅ Done!"
echo ""
echo "Test backend: curl http://localhost:8080/api/v1/health"
echo "Test via Caddy: curl http://152.53.87.200/api/v1/health"

