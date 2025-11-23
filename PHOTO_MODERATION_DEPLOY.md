# Photo Moderation System - Deployment Guide

## 🚀 Quick Start Commands for VPS

### Step 1: Pull Latest Code
```bash
cd /root/lomi_mini
git pull origin main
```

### Step 2: Run Database Migration
```bash
# Run the photo moderation migration
./run-migration-moderation.sh

# Or manually:
docker-compose -f docker-compose.prod.yml exec -T postgres psql -U lomi -d lomi_db < backend/database/migrations/002_add_photo_moderation.sql
```

### Step 3: Add CompreFace Password to .env.production
```bash
# Add this line to .env.production (if not already present)
echo "COMPREFACE_DB_PASSWORD=compreface123" >> .env.production
```

### Step 4: Build and Start New Services
```bash
# Build CompreFace and moderator workers
docker-compose -f docker-compose.prod.yml --env-file .env.production build compreface moderator-worker

# Start all services (including new ones) - MUST use --env-file
docker-compose -f docker-compose.prod.yml --env-file .env.production up -d

# Check status
docker-compose -f docker-compose.prod.yml ps

# View logs
docker-compose -f docker-compose.prod.yml logs -f moderator-worker
docker-compose -f docker-compose.prod.yml logs -f compreface
```

### Step 5: Verify Services Are Running
```bash
# Check all containers are healthy
docker-compose -f docker-compose.prod.yml ps --services --filter "status=healthy"

# Check queue length (should be 0 initially)
docker-compose -f docker-compose.prod.yml exec redis redis-cli -a "${REDIS_PASSWORD}" LLEN photo_moderation_queue

# Check CompreFace health
curl http://localhost:8000/api/v1/health
```

### Step 6: Scale Workers (Optional - Later)
```bash
# Scale from 4 to 6 workers when needed
docker-compose -f docker-compose.prod.yml up -d --scale moderator-worker=6
```

## 📋 What Was Added

### Backend Changes
- ✅ Database migration: `002_add_photo_moderation.sql`
- ✅ New endpoint: `POST /api/v1/users/media/upload-complete` (batch processing)
- ✅ Redis queue manager: `internal/queue/photo_moderation.go`
- ✅ Moderation subscriber: `internal/services/moderation_subscriber.go`
- ✅ Updated Media model with moderation fields

### New Docker Services
- ✅ **CompreFace**: Face detection & age estimation (port 8000)
- ✅ **moderator-worker**: 4 Python workers for photo moderation

### Python Worker
- ✅ Blur detection (OpenCV)
- ✅ Face detection (CompreFace API)
- ✅ NSFW detection (Qwen model - placeholder)
- ✅ Batch processing (1-9 photos per job)

## 🔍 Testing

### Test Upload Complete Endpoint
```bash
# Get JWT token first (from login)
TOKEN="your_jwt_token_here"

# Test batch upload completion
curl -X POST http://localhost:8080/api/v1/users/media/upload-complete \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "photos": [
      {"file_key": "users/xxx/photo1.jpg", "media_type": "photo"},
      {"file_key": "users/xxx/photo2.jpg", "media_type": "photo"}
    ]
  }'
```

### Check Queue
```bash
# Check queue length
docker-compose -f docker-compose.prod.yml exec redis redis-cli -a "${REDIS_PASSWORD}" LLEN photo_moderation_queue

# View queue contents (first item)
docker-compose -f docker-compose.prod.yml exec redis redis-cli -a "${REDIS_PASSWORD}" LRANGE photo_moderation_queue 0 0
```

### Monitor Worker Logs
```bash
# Follow all worker logs
docker-compose -f docker-compose.prod.yml logs -f moderator-worker

# Follow specific worker
docker logs -f lomi_moderator-worker_1
```

## ⚠️ Important Notes

1. **CompreFace First Start**: CompreFace may take 2-3 minutes to fully initialize on first start. Wait for health check to pass.

2. **NSFW Model**: The Qwen model is currently a placeholder. You'll need to implement actual NSFW classification based on Qwen/Qwen2-VL-7B-Instruct API.

3. **R2 URL Format**: Workers download images directly from R2. Ensure your R2 bucket has public read access OR generate presigned download URLs in the Go handler.

4. **Rate Limiting**: Users can upload max 30 photos per 24 hours (not per hour).

5. **Batch Processing**: One upload session (1-9 photos) = one Redis job = one push notification.

## 🐛 Troubleshooting

### Workers Not Processing Jobs
```bash
# Check Redis connection
docker-compose -f docker-compose.prod.yml exec redis redis-cli -a "${REDIS_PASSWORD}" PING

# Check worker logs for errors
docker-compose -f docker-compose.prod.yml logs moderator-worker | tail -50
```

### CompreFace Not Responding
```bash
# Check CompreFace logs
docker-compose -f docker-compose.prod.yml logs compreface

# Restart CompreFace
docker-compose -f docker-compose.prod.yml restart compreface
```

### Database Migration Failed
```bash
# Check if columns already exist
docker-compose -f docker-compose.prod.yml exec postgres psql -U lomi -d lomi_db -c "\d media"

# Manually run migration if needed
docker-compose -f docker-compose.prod.yml exec -T postgres psql -U lomi -d lomi_db < backend/database/migrations/002_add_photo_moderation.sql
```

## 📊 Monitoring

### Queue Metrics
```bash
# Queue length
docker-compose -f docker-compose.prod.yml exec redis redis-cli -a "${REDIS_PASSWORD}" LLEN photo_moderation_queue

# Pending media count
docker-compose -f docker-compose.prod.yml exec postgres psql -U lomi -d lomi_db -c "SELECT COUNT(*) FROM media WHERE moderation_status = 'pending';"
```

### Worker Status
```bash
# Count running workers
docker-compose -f docker-compose.prod.yml ps moderator-worker | grep Up | wc -l

# Worker resource usage
docker stats --no-stream $(docker-compose -f docker-compose.prod.yml ps -q moderator-worker)
```

## ✅ Success Checklist

- [ ] Migration completed successfully
- [ ] CompreFace container is healthy
- [ ] 4 moderator-worker containers are running
- [ ] Redis queue is accessible
- [ ] Backend subscriber is running (check logs)
- [ ] Test upload-complete endpoint returns 200 OK
- [ ] Jobs appear in queue after upload
- [ ] Workers process jobs (check logs)
- [ ] Results published to Redis channel
- [ ] Database updated with moderation results
- [ ] Push notifications sent (check Telegram)

## 🎯 Next Steps

1. **Implement Qwen NSFW Detection**: Replace placeholder with actual Qwen/Qwen2-VL-7B-Instruct integration
2. **Add Presigned Download URLs**: If R2 bucket is not public, generate presigned URLs in Go handler
3. **Monitor Performance**: Track processing times, queue length, worker CPU/memory
4. **Scale Workers**: When needed, scale to 6+ workers: `docker compose up --scale moderator-worker=6`

