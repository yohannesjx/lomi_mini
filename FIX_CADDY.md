# Fix Caddy Service Failure

## Caddy is failing - let's fix it

Run these commands on your server:

```bash
# 1. Check Caddy logs to see the error
sudo journalctl -u caddy -n 100 --no-pager

# 2. Validate Caddyfile
sudo caddy validate --config /etc/caddy/Caddyfile

# 3. Check if Caddyfile exists and is correct
sudo cat /etc/caddy/Caddyfile

# 4. If DNS isn't set up yet, use a temporary Caddyfile
# (See below for IP-based config)
```

## Common Issues:

### Issue 1: DNS Not Configured
If `lomi.social` DNS isn't pointing to your server yet, Caddy can't get SSL certificates.

**Solution:** Use IP-based config temporarily OR wait for DNS.

### Issue 2: Caddyfile Syntax Error
Check the Caddyfile for errors.

### Issue 3: Port Already in Use
Caddy might be trying to use port 80/443 that's already taken.

## Quick Fix Commands:

```bash
# Check full error
sudo journalctl -u caddy -n 100

# Validate config
sudo caddy validate --config /etc/caddy/Caddyfile

# If validation fails, check the file
sudo cat /etc/caddy/Caddyfile | head -20

# Restart Caddy
sudo systemctl restart caddy

# Check status
sudo systemctl status caddy
```

