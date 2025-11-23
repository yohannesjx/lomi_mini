# Quick Fix for Photo Upload

## The Problem

Photos "load and fail right after" - upload URLs are generated but uploads fail.

## Most Likely Cause: R2 CORS Not Configured

**90% of photo upload failures are due to missing CORS configuration in R2.**

## 5-Minute Fix

### Step 1: Configure R2 CORS (2 minutes)

1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com/) → R2
2. Click on your bucket: `lomi-photos`
3. Go to **Settings** → **CORS**
4. Click **Add CORS policy**
5. Paste this JSON:

```json
[
  {
    "AllowedOrigins": ["*"],
    "AllowedMethods": ["GET", "PUT", "POST", "DELETE", "HEAD"],
    "AllowedHeaders": ["*"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]
```

6. Click **Save**

**Do the same for `lomi-videos` bucket if you plan to upload videos.**

### Step 2: Test the Fix (1 minute)

```bash
# On your server
cd /opt/lomi_mini
git pull origin main

# Rebuild backend (to get test endpoints)
docker-compose -f docker-compose.prod.yml stop backend
docker-compose -f docker-compose.prod.yml build backend
docker-compose -f docker-compose.prod.yml up -d backend

# Test S3 connection
curl http://localhost:8080/api/v1/test/s3
```

### Step 3: Test Upload (2 minutes)

1. Open your app in Telegram
2. Try uploading a photo
3. Open browser console (F12) → Console tab
4. Look for:
   - `✅ Upload to R2 successful` = Fixed! ✅
   - `❌ CORS error` = CORS still not configured
   - `❌ 403 Forbidden` = Check R2 credentials

## Alternative: Test with Curl

```bash
# 1. Get JWT token (authenticate first)
TOKEN="your-jwt-token"

# 2. Test S3 connection
curl http://localhost:8080/api/v1/test/s3

# 3. Get test upload URL
curl -X GET "http://localhost:8080/api/v1/test/media-upload?media_type=photo" \
  -H "Authorization: Bearer $TOKEN" | jq '.'

# 4. Upload test file
UPLOAD_URL="paste-upload-url-from-step-3"
echo "test" > /tmp/test.jpg
curl -X PUT "$UPLOAD_URL" \
  -H "Content-Type: image/jpeg" \
  --data-binary @/tmp/test.jpg \
  -v
```

## If CORS Doesn't Fix It

### Check 1: R2 Credentials
```bash
# Verify credentials are set
docker-compose -f docker-compose.prod.yml exec backend env | grep S3_
```

### Check 2: Bucket Exists
- Go to Cloudflare R2 dashboard
- Verify `lomi-photos` bucket exists
- Check bucket is not in "Suspended" state

### Check 3: Network Connectivity
```bash
# Test if R2 endpoint is reachable
curl -I https://a53cdfc7c678dac2a028159bcd178da2.r2.cloudflarestorage.com
```

### Check 4: Presigned URL Format
The presigned URL should work directly. Test it:
```bash
# Get upload URL from test endpoint
UPLOAD_URL="..."

# Try uploading
curl -X PUT "$UPLOAD_URL" \
  -H "Content-Type: image/jpeg" \
  --data-binary @/tmp/test.jpg \
  -v
```

**Expected:**
- 200/204 = Success ✅
- 403 = CORS/Permissions issue
- 404 = Bucket/URL issue

## Still Not Working?

Before rebuilding, try:

1. **Check browser console** - Most errors show there
2. **Test with curl** - Bypass browser to isolate issue
3. **Check R2 dashboard** - Verify bucket and CORS
4. **Check backend logs** - Look for S3 errors

## Summary

**Most likely fix:** Configure CORS in R2 buckets (5 minutes)
**If that doesn't work:** Check R2 credentials and bucket status
**Last resort:** Rebuild (but probably not needed)

The issue is almost certainly CORS - fix that first before rebuilding!

