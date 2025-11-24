# Fix Frontend Cache Issue - upload-complete Not Working

## Problem
After rebuilding frontend, photos are still created with zero `batch_id`, meaning the old endpoint is being used.

## Root Cause
Browser cache is serving old JavaScript files that still call the old `uploadMedia` endpoint.

## Solution

### Step 1: Verify Build Includes New Code

On your server:
```bash
./verify-frontend-build.sh
```

This will check if the built files include `upload-complete`.

### Step 2: Force Clear Browser Cache

**Option A: Hard Refresh (Quick Fix)**
- **Chrome/Edge**: `Ctrl+Shift+R` (Windows) or `Cmd+Shift+R` (Mac)
- **Firefox**: `Ctrl+F5` (Windows) or `Cmd+Shift+R` (Mac)
- **Safari**: `Cmd+Option+R` (Mac)

**Option B: Clear Cache Completely**
1. Open browser DevTools (F12)
2. Right-click the refresh button
3. Select "Empty Cache and Hard Reload"

**Option C: Use Incognito/Private Mode**
- Open a new incognito/private window
- This bypasses all cache

**Option D: Clear Site Data (Nuclear Option)**
1. Open DevTools (F12)
2. Go to Application tab (Chrome) or Storage tab (Firefox)
3. Click "Clear site data" or "Clear storage"
4. Refresh the page

### Step 3: Check Browser Console

After clearing cache, upload photos and check the browser console. You should see:

```
📸 Registering X uploaded photos with backend (batch moderation)...
📤 Calling upload-complete endpoint with batch: [...]
✅ Upload-complete response: {...}
```

**If you DON'T see these logs**, the old code is still running.

### Step 4: Verify Backend Receives upload-complete

Check backend logs:
```bash
docker-compose -f docker-compose.prod.yml --env-file .env.production logs --tail 50 backend | grep "Upload complete"
```

Should see:
```
✅ Upload complete: batch_id=..., user_id=..., photos=X
```

### Step 5: Check Database

After uploading, check if photos have real batch_id:
```bash
docker-compose -f docker-compose.prod.yml --env-file .env.production exec postgres psql -U lomi -d lomi_db -c "SELECT id, batch_id, moderation_status FROM media ORDER BY created_at DESC LIMIT 5;"
```

**Good**: batch_id should be a real UUID (not all zeros)
**Bad**: batch_id = `00000000-0000-0000-0000-000000000000`

## If Still Not Working

### Check 1: Service Worker
If your app uses a service worker, unregister it:
1. Open DevTools → Application tab
2. Click "Service Workers"
3. Click "Unregister" for your site
4. Refresh

### Check 2: CDN/Proxy Cache
If you're using a CDN or proxy (Cloudflare, etc.), purge the cache:
```bash
# Cloudflare example
curl -X POST "https://api.cloudflare.com/client/v4/zones/ZONE_ID/purge_cache" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  --data '{"purge_everything":true}'
```

### Check 3: Verify Build Timestamp
```bash
# On server
ls -la /var/www/lomi-frontend/*.js | head -5
# Check if files were modified recently (should be after rebuild)
```

### Check 4: Add Cache-Busting Headers
Add to Caddyfile:
```
header Cache-Control "no-cache, no-store, must-revalidate"
```

Then reload Caddy:
```bash
sudo systemctl reload caddy
```

## Quick Test

1. Open browser in **incognito mode**
2. Navigate to your app
3. Upload photos
4. Check browser console for `📤 Calling upload-complete endpoint`
5. Check backend logs for `✅ Upload complete: batch_id=...`
6. Check database for real batch_id

If it works in incognito but not in normal mode → **Cache issue confirmed**

## Prevention

To prevent this in the future, add cache-busting to your build:

1. **Expo**: Already includes hash in filenames (good)
2. **Add version query param**: `?v=1.0.0` to index.html
3. **Set proper cache headers** in Caddyfile for HTML files:
   ```
   header Cache-Control "no-cache" for *.html
   ```

