# End-to-End Photo Moderation Test Guide

## 🎯 Test Goal
Upload 10 real test photos and verify the complete moderation flow works:
1. Upload → Job enqueued
2. Worker processes → Moderation scores calculated
3. Database updated → Status set
4. Push notification sent

## 📸 Test Photos Required

Prepare these 10 photos:
1. ✅ **Normal selfie** (should pass)
2. ✅ **Normal group photo** (should pass)
3. ❌ **Blurry photo** (should reject: "blurry")
4. ❌ **Baby/child photo** (should reject: "underage")
5. ❌ **No face** (landscape/object, should reject: "no_face")
6. ⚠️ **Shirtless guy** (should reject: "nsfw" if threshold met)
7. ✅ **Normal portrait** (should pass)
8. ✅ **Normal full body** (should pass)
9. ❌ **Screenshot** (should reject: "blurry" or "no_face")
10. ✅ **Normal photo with face** (should pass)

## 🚀 Test Steps

### Step 1: Start Monitoring (3 terminals)

**Terminal 1 - Real-time Monitor:**
```bash
cd /root/lomi_mini
./monitor-moderation.sh
```

**Terminal 2 - Worker Logs:**
```bash
cd /root/lomi_mini
./watch-worker-logs.sh
```

**Terminal 3 - For API calls:**
```bash
cd /root/lomi_mini
# Keep this for curl commands
```

### Step 2: Upload Photos via API

**Get JWT Token First:**
```bash
# Login via Telegram Mini App or use existing token
TOKEN="your_jwt_token_here"
```

**Upload Photos (one by one or batch):**

```bash
# Upload 10 photos in one batch
curl -X POST http://localhost:8080/api/v1/users/media/upload-complete \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "photos": [
      {"file_key": "users/xxx/photo1.jpg", "media_type": "photo"},
      {"file_key": "users/xxx/photo2.jpg", "media_type": "photo"},
      {"file_key": "users/xxx/photo3.jpg", "media_type": "photo"},
      {"file_key": "users/xxx/photo4.jpg", "media_type": "photo"},
      {"file_key": "users/xxx/photo5.jpg", "media_type": "photo"},
      {"file_key": "users/xxx/photo6.jpg", "media_type": "photo"},
      {"file_key": "users/xxx/photo7.jpg", "media_type": "photo"},
      {"file_key": "users/xxx/photo8.jpg", "media_type": "photo"},
      {"file_key": "users/xxx/photo9.jpg", "media_type": "photo"},
      {"file_key": "users/xxx/photo10.jpg", "media_type": "photo"}
    ]
  }'
```

**Expected Response:**
```json
{
  "batch_id": "uuid",
  "message": "We'll check your photos now",
  "photos_count": 10,
  "status": "pending"
}
```

### Step 3: Watch the Flow

**In Terminal 1 (Monitor):**
- ✅ Queue length should increase (1 job with 10 photos)
- ✅ Workers should start processing
- ✅ Pending count should increase
- ✅ After ~10-20 seconds: Approved/Rejected counts should update

**In Terminal 2 (Worker Logs):**
- ✅ Should see: "📥 Received job: batch_id=..."
- ✅ Should see: "Processing batch job: batch_id=..., photos=10"
- ✅ Should see: "✅ Completed batch: batch_id=..., approved=X, rejected=Y"
- ✅ Should see blur/face/NSFW check results

### Step 4: Check Results

**Check Database:**
```bash
./check-moderation-results.sh
```

**Expected Output:**
- 10 media records
- Status: `approved` or `rejected`
- Reason: `blurry`, `no_face`, `underage`, `nsfw`, or `null` (approved)
- Scores: JSON with blur_variance, has_face, nsfw_scores, etc.

**Check Specific Media:**
```bash
# Get media ID from database, then:
docker-compose -f docker-compose.prod.yml --env-file .env.production exec postgres psql -U lomi -d lomi_db -c "
SELECT 
    id,
    moderation_status,
    moderation_reason,
    moderation_scores,
    moderated_at
FROM media 
WHERE batch_id = 'YOUR_BATCH_ID'
ORDER BY display_order;
"
```

### Step 5: Verify Push Notifications

**Check Telegram:**
- Should receive push notification like:
  - "✅ 7/10 photos approved, 3 were blurry"
  - Or "✅ All 10 photos are live!"
  - Or "❌ Photos need to be clearer. Please upload again"

**Check Backend Logs:**
```bash
docker-compose -f docker-compose.prod.yml --env-file .env.production logs backend | grep "push notification"
```

## ✅ Success Criteria

1. ✅ **Upload**: Returns 200 OK immediately
2. ✅ **Queue**: Job appears in Redis queue
3. ✅ **Worker**: Processes job within 30 seconds
4. ✅ **Database**: All 10 photos have `moderation_status` set
5. ✅ **Scores**: `moderation_scores` JSONB contains blur/face/NSFW data
6. ✅ **Reasons**: Rejected photos have correct `moderation_reason`
7. ✅ **Notification**: Push notification sent to Telegram
8. ✅ **Accuracy**: 
   - Normal photos → `approved`
   - Blurry photos → `rejected` with reason `blurry`
   - No face → `rejected` with reason `no_face`
   - Underage → `rejected` with reason `underage`

## 🐛 Troubleshooting

**Queue not processing:**
```bash
# Check Redis connection
docker-compose -f docker-compose.prod.yml --env-file .env.production exec redis redis-cli -a "${REDIS_PASSWORD}" PING

# Check worker logs for errors
docker-compose -f docker-compose.prod.yml --env-file .env.production logs moderator-worker | tail -50
```

**Workers can't download:**
```bash
# Test R2 download
./test-r2-download.sh
```

**Database not updating:**
```bash
# Check subscriber logs
docker-compose -f docker-compose.prod.yml --env-file .env.production logs backend | grep "moderation"
```

**No push notifications:**
```bash
# Check notification service
docker-compose -f docker-compose.prod.yml --env-file .env.production logs backend | grep "Telegram"
```

## 📊 Expected Results

Based on test photos:
- **Approved**: ~6-7 photos (normal selfies, portraits, full body)
- **Rejected**: ~3-4 photos
  - 1 blurry
  - 1 no face
  - 1 underage
  - 0-1 NSFW (depends on threshold)

## 🎉 Next Steps

Once this test passes:
1. ✅ R2 download works
2. ✅ Workers process jobs
3. ✅ Database updates correctly
4. ✅ Push notifications sent

Then proceed to **Step #3**: Replace Qwen placeholder with real model.

