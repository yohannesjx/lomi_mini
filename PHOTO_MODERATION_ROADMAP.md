# Photo Moderation System - Architecture Roadmap & Analysis

## 📋 Executive Summary

**Goal**: Build a zero-lag, production-grade photo moderation system that handles 500+ simultaneous uploads without blocking user experience.

**Key Principle**: **Async-first architecture** - Users never wait for moderation. Upload → Immediate 200 OK → Background processing → Silent push notification.

---

## 🔍 Current System Analysis

### What We Have:
1. ✅ **Direct R2 Upload**: Presigned URLs working (`GetPresignedUploadURL`)
2. ✅ **Media Table**: `media` table with `is_approved` boolean
3. ✅ **Redis**: Connected and used for rate limiting
4. ✅ **Go Backend**: Fiber framework, well-structured handlers
5. ✅ **Docker Compose**: Basic setup with postgres, redis, backend

### What's Missing:
1. ❌ **Moderation Queue**: No job queue system
2. ❌ **Moderation Workers**: No Python workers for ML/AI processing
3. ❌ **CompreFace**: No face detection service
4. ❌ **NSFW Detection**: No content filtering
5. ❌ **Blur Detection**: No image quality checks
6. ❌ **Status Tracking**: Limited moderation metadata
7. ❌ **Push Notifications**: No async notification system

---

## 🏗️ Architecture Design

### **Flow Diagram**

```
┌─────────────┐
│   Client    │
│  (Telegram) │
└──────┬──────┘
       │ 1. Select photos (1-9)
       │ 2. Get presigned URLs
       │ 3. Upload directly to R2
       ▼
┌─────────────────────┐
│   Go Backend API    │
│  POST /upload-complete│
└──────┬──────────────┘
       │ 4. Create media record (status=pending)
       │ 5. Enqueue job to Redis
       │ 6. Return 200 OK immediately
       ▼
┌─────────────────────┐
│   Redis Queue       │
│  Queue: photo_mod   │
│  Job: {media_id,    │
│        r2_url, ...}  │
└──────┬──────────────┘
       │ 7. 6 Workers pull jobs
       ▼
┌─────────────────────────────────┐
│   Python Moderator Workers (6)  │
│  ┌──────────────────────────┐  │
│  │ 1. Download from R2       │  │
│  │ 2. Blur check (OpenCV)    │  │
│  │ 3. Face detection (CompreFace)│
│  │ 4. Age estimation         │  │
│  │ 5. NSFW detection (HF)    │  │
│  │ 6. OCR (optional)         │  │
│  └──────────────────────────┘  │
└──────┬──────────────────────────┘
       │ 8. Publish result to Redis channel
       ▼
┌─────────────────────┐
│  Redis Pub/Sub      │
│  Channel: mod_result│
└──────┬──────────────┘
       │ 9. Go subscriber listens
       ▼
┌─────────────────────┐
│   Go Backend        │
│  - Update DB status  │
│  - Send Telegram push│
└─────────────────────┘
```

---

## 📐 Detailed Component Design

### **1. Database Schema Changes**

**Current `media` table** needs enhancement:

```sql
-- Add columns to existing media table
ALTER TABLE media ADD COLUMN IF NOT EXISTS moderation_status VARCHAR(20) DEFAULT 'pending';
ALTER TABLE media ADD COLUMN IF NOT EXISTS moderation_reason TEXT;
ALTER TABLE media ADD COLUMN IF NOT EXISTS moderated_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE media ADD COLUMN IF NOT EXISTS moderation_scores JSONB; -- Store all scores
ALTER TABLE media ADD COLUMN IF NOT EXISTS retry_count INTEGER DEFAULT 0;
ALTER TABLE media ADD COLUMN IF NOT EXISTS batch_id UUID; -- For batch processing (1-9 photos per session)

-- Create indexes for fast queries
CREATE INDEX IF NOT EXISTS idx_media_moderation_status ON media(moderation_status) 
WHERE moderation_status = 'pending';
CREATE INDEX IF NOT EXISTS idx_media_batch_id ON media(batch_id); -- Fast batch updates

-- Enum for status
CREATE TYPE moderation_status_type AS ENUM ('pending', 'approved', 'rejected', 'failed');
```

**Moderation Scores JSONB Structure**:
```json
{
  "blur_variance": 150,      // Laplacian variance, higher = sharper (threshold: 120)
  "has_face": true,
  "face_count": 1,
  "estimated_age": 25,
  "nsfw_scores": {
    "porn": 0.01,            // Threshold: > 0.45 = reject
    "sexy": 0.01,            // Threshold: > 0.7 = reject
    "hentai": 0.0
  },
  "processing_time_ms": 1800
}
```

---

### **2. Redis Queue Structure**

**Queue Name**: `photo_moderation_queue`

**Job Format** (JSON) - **BATCH PROCESSING** (1-9 photos per job):
```json
{
  "job_id": "uuid",
  "batch_id": "uuid",        // Same for all photos in one upload session
  "user_id": "uuid",
  "telegram_id": 123456789,   // For push notifications
  "photos": [
    {
      "media_id": "uuid",
      "r2_url": "https://...",
      "r2_key": "users/xxx/photo/yyy.jpg",
      "bucket": "lomi-photos"
    },
    // ... up to 9 photos
  ],
  "created_at": "2025-01-20T10:00:00Z",
  "retry_count": 0,
  "priority": 1  // 1=normal, 2=high (retry)
}
```

**Redis Commands**:
- `LPUSH photo_moderation_queue {job_json}` - Enqueue
- `BRPOP photo_moderation_queue 5` - Worker pulls (blocking, 5s timeout)
- `LLEN photo_moderation_queue` - Queue length

**Pub/Sub Channel**: `moderation_results`
```json
{
  "job_id": "uuid",
  "batch_id": "uuid",
  "user_id": "uuid",
  "telegram_id": 123456789,
  "results": [
    {
      "media_id": "uuid",
      "status": "approved|rejected|failed",
      "reason": "blurry|no_face|underage|nsfw",
      "scores": {...}
    },
    // ... all photos in batch
  ],
  "summary": {
    "total": 9,
    "approved": 8,
    "rejected": 1,
    "reasons": {"blurry": 1}
  },
  "processed_at": "2025-01-20T10:00:01Z"
}
```

---

### **3. Go Backend Components**

#### **A. New Handler: `POST /api/v1/media/upload-complete`**

**Purpose**: Called after client uploads ALL photos to R2 (batch), enqueues ONE moderation job

**Request** (batch - 1-9 photos):
```json
{
  "photos": [
    {
      "file_key": "users/xxx/photo/yyy.jpg",
      "media_type": "photo"
    },
    // ... up to 9 photos
  ]
}
```

**Response** (immediate):
```json
{
  "batch_id": "uuid",
  "message": "We'll check your photos now",
  "photos_count": 9
}
```

**Logic**:
1. **Rate Limit Check**: max 30 photos/user per 24 hours (not per hour)
2. Generate `batch_id` (UUID) for this upload session
3. Create all `media` records with `moderation_status='pending'`, `is_approved=false`, `batch_id`
4. Enqueue **ONE job** to Redis queue (contains all photos in batch)
5. Return 200 OK immediately (no waiting)

#### **B. Redis Queue Manager** (`internal/queue/photo_moderation.go`)

**Functions**:
- `EnqueuePhotoModeration(mediaID, userID, r2Key, bucket) error`
- `GetQueueLength() int64`
- `RetryJob(jobID string) error`

#### **C. Redis Subscriber** (`internal/services/moderation_subscriber.go`)

**Purpose**: Listen to `moderation_results` channel, update DB, send **grouped smart push**

**Logic**:
1. Subscribe to `moderation_results` channel
2. On message (batch results):
   - Update all `media` records in batch: `moderation_status`, `moderation_reason`, `moderation_scores`
   - If approved: Set `is_approved=true`
   - **Rate limit pushes**: Max 1 push per user per 10 seconds (dedupe)
   - **Smart grouped push**:
     - All approved: "✅ All 9 photos are live!"
     - Mixed: "✅ 8/9 photos approved, 1 was blurry"
     - All rejected: "❌ Photos need to be clearer. Please upload again"
3. Use `batch_id` for fast batch updates (single query)

#### **D. Rate Limiting** (enhance existing)

**Key**: `photo_upload_rate:{user_id}`
**Limit**: 30 photos per 24 hours (better for onboarding)
**Window**: 24 hours (86400 seconds)
**Implementation**: Use existing Redis rate limit middleware

---

### **4. Python Moderator Worker**

#### **Tech Stack**:
- **FastAPI** (lightweight, async) OR **Simple Python script** (simpler)
- **OpenCV** (`cv2`) - Blur detection
- **CompreFace REST API** - Face detection + age estimation
- **Transformers** + **torch** - NSFW detection (**Qwen/Qwen2-VL-7B-Instruct** - #1 on HF leaderboard, better for dark skin & Habesha clothes)
- **Redis** (`redis-py`) - Queue + Pub/Sub
- **Requests** - HTTP calls to CompreFace, R2
- **Note**: OCR/screenshot detection removed for MVP (adds latency, already caught by blur + no-face)

#### **Worker Flow** (`worker/app.py`) - **BATCH PROCESSING**:

```python
1. Connect to Redis
2. Connect to CompreFace API
3. Load NSFW model (Qwen/Qwen2-VL-7B-Instruct) once at startup
4. Loop forever:
   a. BRPOP from queue (blocking, 5s timeout)
   b. Parse job JSON (contains batch of 1-9 photos)
   c. Process all photos in batch:
      For each photo:
        - Download image from R2
        - Run checks in parallel:
          * Blur detection (OpenCV Laplacian variance)
          * Face detection (CompreFace API)
          * NSFW detection (Qwen model)
        - Aggregate results
        - Determine status: approved/rejected/failed
   d. Create batch summary (total, approved, rejected, reasons)
   e. Publish batch results to Redis channel (one message per batch)
   f. If failed and retry_count < 2: Re-enqueue with retry_count++
```

#### **Moderation Rules** (Relaxed for Ethiopian photos):

| Check | Threshold | Action |
|-------|-----------|--------|
| Blur | variance < 120 | Reject: "blurry" (relaxed from 100) |
| Face | no face detected | Reject: "no_face" |
| Age | estimated_age < 18 | Reject: "underage" |
| NSFW | porn > 0.45 OR sexy > 0.7 | Reject: "nsfw" (relaxed porn threshold) |
| **OCR** | **REMOVED** | **Not in MVP** (adds latency, caught by blur/no-face) |

---

### **5. CompreFace Service**

**Docker Image**: `exadel/compreface-core:latest`

**Purpose**: Face detection + age estimation

**API Calls**:
- `POST /api/v1/detection/detect` - Detect faces
- Response includes: face count, bounding boxes, age estimates

**Configuration**:
- Single instance (1 container)
- Port: 8000 (internal)
- Models: Face detection + Age estimation

---

### **6. Docker Compose Architecture**

```yaml
services:
  # Existing services...
  postgres: {...}
  redis: {...}
  backend: {...}
  
  # NEW: CompreFace
  compreface:
    image: exadel/compreface-core:latest
    container_name: lomi_compreface
    restart: unless-stopped
    ports:
      - "127.0.0.1:8000:8000"
    environment:
      POSTGRES_DB: compreface
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: ${COMPREFACE_DB_PASSWORD}
    networks:
      - lomi_network
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8000/api/v1/health"]
      interval: 30s
      timeout: 10s
      retries: 3

  # NEW: Moderator Workers (4 replicas - scale with: docker compose up --scale moderator-worker=6)
  moderator-worker:
    build:
      context: ./moderator-worker
      dockerfile: Dockerfile
    restart: always
    deploy:
      replicas: 4  # Start with 4, scale to 6+ when needed
    environment:
      REDIS_HOST: redis
      REDIS_PORT: 6379
      REDIS_PASSWORD: ${REDIS_PASSWORD}
      COMPREFACE_URL: http://compreface:8000
      S3_ENDPOINT: ${S3_ENDPOINT}
      S3_ACCESS_KEY: ${S3_ACCESS_KEY}
      S3_SECRET_KEY: ${S3_SECRET_KEY}
      S3_BUCKET_PHOTOS: ${S3_BUCKET_PHOTOS}
      R2_PUBLIC_URL: https://pub-xxx.r2.dev  # For downloading
    depends_on:
      - redis
      - compreface
    networks:
      - lomi_network
```

---

### **7. Telegram Push Notifications**

**Silent Push Format**:
```json
{
  "chat_id": user_telegram_id,
  "text": "✅ Your photos are live!",
  "parse_mode": "HTML",
  "disable_notification": false  // User should see it
}
```

**Smart Grouped Push Messages** (Amharic + English):
```json
{
  "all_approved": "✅ ሁሉም ፎቶዎች ዝግጁ ናቸው!\n\nAll photos are live!",
  "mixed": "✅ {approved}/{total} ፎቶዎች ዝግጁ ናቸው, {rejected} {reason}\n\n{approved}/{total} photos approved, {rejected} {reason}",
  "all_rejected": "❌ ፎቶዎች የበለጠ ግልጽ መሆን አለባቸው. እንደገና ይጭኑ\n\nPhotos need to be clearer. Please upload again",
  "reasons": {
    "blurry": "ፎቶው ብዥ ነው!",
    "no_face": "ፊትሽን/ፊቱን አሳይን!",
    "underage": "መታወቂያ ማረጋገጥ አለብህ (18+)",
    "nsfw": "ፎቶው ተገቢ አይደለም"
  }
}
```

**Push Rate Limiting**: Max 1 push per user per 10 seconds (dedupe by user_id)

---

## 🚀 Implementation Roadmap

### **Phase 1: Foundation (Day 1)**
1. ✅ Database migration (add moderation columns)
2. ✅ Update `media` model in Go
3. ✅ Create Redis queue manager
4. ✅ Create `POST /upload-complete` handler
5. ✅ Test queue enqueue/dequeue

### **Phase 2: Worker Core (Day 1-2)**
1. ✅ Create Python worker Dockerfile
2. ✅ Implement basic worker loop (Redis BRPOP)
3. ✅ Add R2 download logic
4. ✅ Add blur detection (OpenCV)
5. ✅ Test worker with sample images

### **Phase 3: AI Integration (Day 2)**
1. ✅ Add CompreFace service to docker-compose
2. ✅ Integrate CompreFace API calls
3. ✅ Add NSFW detection (HF model)
4. ✅ Add OCR (optional)
5. ✅ Test full moderation pipeline

### **Phase 4: Backend Integration (Day 2-3)**
1. ✅ Create Redis subscriber in Go
2. ✅ Update DB on moderation results
3. ✅ Add Telegram push notifications
4. ✅ Add retry logic
5. ✅ Add rate limiting

### **Phase 5: Production Hardening (Day 3)**
1. ✅ Error handling & logging
2. ✅ Health checks
3. ✅ Monitoring (queue length, worker status)
4. ✅ Load testing (500 concurrent uploads)
5. ⏸️ **Admin dashboard postponed** (add when we have 10k+ users)

---

## 📊 Performance Targets

| Metric | Target | Notes |
|--------|--------|-------|
| **User Response Time** | < 200ms | From upload-complete to 200 OK |
| **Moderation Time** | < 1.8s | Per photo, 95th percentile |
| **Queue Processing** | < 5s | Time from enqueue to worker start |
| **Throughput** | 500+ photos/min | With 4 workers (scale to 6+ when needed) |
| **Worker CPU** | < 70% | Per worker under load |
| **Memory** | < 2GB/worker | Including Qwen model |
| **Batch Processing** | < 3s | For 9 photos in one batch |

---

## 🔒 Security & Reliability

### **Security**:
- ✅ Workers run in isolated containers
- ✅ R2 presigned URLs (no direct access)
- ✅ Redis password protected
- ✅ Rate limiting prevents abuse
- ✅ No sensitive data in queue (only IDs + URLs)

### **Reliability**:
- ✅ Auto-retry failed jobs (max 2 retries)
- ✅ Worker health checks
- ✅ Queue persistence (Redis AOF)
- ✅ Dead letter queue for failed jobs
- ✅ Graceful shutdown

### **Monitoring**:
- ✅ Queue length metrics
- ✅ Worker processing time
- ✅ Success/failure rates
- ✅ Rejection reason distribution

---

## 💰 Cost Optimization ($15/month VPS)

### **Resource Allocation**:
- **Postgres**: 512MB RAM
- **Redis**: 256MB RAM
- **Go Backend**: 256MB RAM
- **CompreFace**: 1GB RAM (face detection models)
- **4 Workers**: 1.5GB RAM total (375MB each) - Start with 4
- **Total**: ~3.5GB RAM (fits in 4GB VPS, scales to 6 workers = ~4.5GB)

### **Scaling Command**:
```bash
# Scale workers from 4 to 6 (or more) when needed
docker compose -f docker-compose.prod.yml up -d --scale moderator-worker=6
```

### **Optimizations**:
1. **Model Loading**: Load Qwen NSFW model once at startup (shared memory)
2. **Image Caching**: Cache downloaded images in worker memory (LRU, 50MB)
3. **Batch Processing**: Process all photos from one upload session together (1-9 photos = 1 job)
4. **Worker Scaling**: Start with 4 workers, scale to 6+ with: `docker compose up --scale moderator-worker=6`
5. **Push Deduplication**: Max 1 push per user per 10 seconds (prevents spam)

---

## 🎯 Success Criteria

✅ **User Experience**: Zero wait time - immediate 200 OK  
✅ **Throughput**: Handle 500+ simultaneous uploads  
✅ **Accuracy**: < 1% false positives (rejecting good photos) - relaxed thresholds help  
✅ **Speed**: < 2s average moderation time per photo, < 3s for 9-photo batch  
✅ **Reliability**: 99.9% job completion rate  
✅ **Cost**: Runs on $15/month VPS (4 workers = 3.5GB RAM)  
✅ **Batch Processing**: One job per upload session (1-9 photos)  
✅ **Smart Notifications**: Grouped pushes, max 1 per 10 seconds  

---

## 📝 Next Steps

1. **Review this roadmap** - Confirm architecture decisions
2. **Start Phase 1** - Database + Queue foundation
3. **Iterate** - Build, test, optimize

## 🎯 Final Production Configuration

- **Workers**: 4 (scale to 6+ with `docker compose up --scale moderator-worker=6`)
- **NSFW Model**: Qwen/Qwen2-VL-7B-Instruct (better for dark skin & Habesha clothes)
- **Rate Limit**: 30 photos per 24 hours (better for onboarding)
- **Batch Processing**: 1 job per upload session (1-9 photos)
- **Smart Pushes**: Grouped notifications, max 1 per 10 seconds
- **Thresholds**: Relaxed (blur < 120, NSFW porn > 0.45)
- **No OCR**: Removed for MVP (adds latency)
- **No Admin Dashboard**: Postponed until 10k+ users

**Ready to code?** Let me know and I'll start with Phase 1! 🚀

