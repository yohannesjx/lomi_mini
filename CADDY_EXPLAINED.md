# How Caddy Points to Your IP

## Understanding Caddyfile Configuration

### Current Setup

The Caddyfile can work in **two ways**:

#### 1. **With Domain Names** (when DNS is configured)
```caddy
lomi.social {
    # ... config ...
}
```
- ✅ Automatic SSL certificates (HTTPS)
- ✅ Professional domain name
- ❌ Requires DNS to be configured first

#### 2. **With IP Address** (works immediately)
```caddy
152.53.87.200 {
    # ... config ...
}
```
- ✅ Works immediately (no DNS needed)
- ✅ Can test right away
- ❌ No SSL (HTTP only)

### How It Works

**Caddy listens on port 80/443** and routes based on:
- **Host header** (domain name in the request)
- **IP address** (if accessing via IP)

When you access:
- `http://lomi.social` → Caddy sees host header "lomi.social" → Matches `lomi.social` block
- `http://152.53.87.200` → Caddy sees host header "152.53.87.200" → Matches `152.53.87.200` block
- `http://api.lomi.social/api/v1/health` → Caddy sees "api.lomi.social" → Matches `api.lomi.social` block

### Updated Caddyfile

The updated Caddyfile now supports **both**:

```caddy
# Frontend - works with domain OR IP
lomi.social, 152.53.87.200, local.lomi {
    # ... config ...
}

# Backend API - works with domain OR IP
api.lomi.social {
    # ... config ...
}
```

This means:
- ✅ `http://lomi.social` works (when DNS is ready)
- ✅ `http://152.53.87.200` works (immediately)
- ✅ `http://local.lomi` works (for local testing)
- ✅ `http://api.lomi.social/api/v1/health` works (when DNS is ready)

### How to Use

#### Option 1: Use IP Address (Current - No DNS)
```bash
# Access frontend
http://152.53.87.200

# Access API
http://152.53.87.200/api/v1/health
```

#### Option 2: Use Domain (After DNS is configured)
```bash
# Access frontend
https://lomi.social  # Automatic SSL!

# Access API
https://api.lomi.social/api/v1/health  # Automatic SSL!
```

### DNS Configuration

To use domain names, add these DNS records:

```
Type    Name              Value           TTL
A       @                152.53.87.200   3600
A       api              152.53.87.200   3600
```

Or:
```
A       lomi.social       152.53.87.200   3600
A       api.lomi.social   152.53.87.200   3600
```

### Testing

```bash
# Test with IP (works now)
curl http://152.53.87.200/api/v1/health

# Test with domain (after DNS)
curl https://api.lomi.social/api/v1/health
```

### Summary

**The IP address (152.53.87.200) is your server's address.**

Caddy:
1. Listens on port 80/443 on your server
2. Routes requests based on what domain/IP you use
3. Proxies to `localhost:8080` (your backend Docker container)

**You don't need to "point" anything - Caddy automatically handles both domain and IP!**

