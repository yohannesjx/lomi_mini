# Fix Error 522 - Connection Timed Out

## Error 522 means:
- Cloudflare/Caddy can't reach your backend
- Backend might be crashing
- Backend might not be fully started

## Quick Fix Commands (Run on Server)

```bash
# 1. Check if backend is actually running
docker-compose -f docker-compose.prod.yml ps

# 2. Check backend logs (see if it's crashing)
docker-compose -f docker-compose.prod.yml logs backend --tail 50

# 3. Test backend directly (bypass Caddy)
curl http://localhost:8080/api/v1/health

# 4. Check Caddy status
sudo systemctl status caddy

# 5. Check Caddy logs
sudo journalctl -u caddy -n 50

# 6. Verify Caddyfile is correct
sudo caddy validate --config /etc/caddy/Caddyfile
```

## Common Issues:

### Backend Not Starting
```bash
# Check logs
docker-compose -f docker-compose.prod.yml logs backend

# Restart backend
docker-compose -f docker-compose.prod.yml restart backend
```

### Caddy Not Configured
```bash
# Check if Caddyfile exists
sudo ls -la /etc/caddy/Caddyfile

# Reload Caddy
sudo systemctl reload caddy
```

### DNS Not Pointing Correctly
```bash
# Check if DNS is correct
dig lomi.social +short
dig api.lomi.social +short
# Should return: 152.53.87.200
```

