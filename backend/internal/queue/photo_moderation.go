package queue

import (
	"context"
	"encoding/json"
	"fmt"
	"lomi-backend/internal/database"
	"log"
	"time"

	"github.com/google/uuid"
)

const (
	PhotoModerationQueue = "photo_moderation_queue"
	ModerationResultsChannel = "moderation_results"
)

// PhotoModerationJob represents a batch job for moderating 1-9 photos
type PhotoModerationJob struct {
	JobID      string    `json:"job_id"`
	BatchID    string    `json:"batch_id"`
	UserID     string    `json:"user_id"`
	TelegramID int64     `json:"telegram_id"`
	Photos     []PhotoJob `json:"photos"`
	CreatedAt  time.Time `json:"created_at"`
	RetryCount int       `json:"retry_count"`
	Priority   int       `json:"priority"` // 1=normal, 2=high (retry)
}

// PhotoJob represents a single photo in the batch
type PhotoJob struct {
	MediaID string `json:"media_id"`
	R2URL   string `json:"r2_url"`
	R2Key   string `json:"r2_key"`
	Bucket  string `json:"bucket"`
}

// ModerationResult represents the result of moderating a batch
type ModerationResult struct {
	JobID      string              `json:"job_id"`
	BatchID    string              `json:"batch_id"`
	UserID     string              `json:"user_id"`
	TelegramID int64               `json:"telegram_id"`
	Results    []PhotoResult       `json:"results"`
	Summary    ModerationSummary   `json:"summary"`
	ProcessedAt time.Time          `json:"processed_at"`
}

// PhotoResult represents the moderation result for a single photo
type PhotoResult struct {
	MediaID string                 `json:"media_id"`
	Status  string                 `json:"status"` // approved, rejected, failed
	Reason  string                 `json:"reason"` // blurry, no_face, underage, nsfw
	Scores  map[string]interface{} `json:"scores"`
}

// ModerationSummary aggregates results for the batch
type ModerationSummary struct {
	Total    int            `json:"total"`
	Approved int            `json:"approved"`
	Rejected int            `json:"rejected"`
	Reasons  map[string]int `json:"reasons"` // reason -> count
}

// EnqueuePhotoModeration enqueues a batch job for photo moderation
func EnqueuePhotoModeration(batchID uuid.UUID, userID uuid.UUID, telegramID int64, photos []PhotoJob) error {
	if database.RedisClient == nil {
		return fmt.Errorf("Redis client not initialized")
	}

	job := PhotoModerationJob{
		JobID:      uuid.New().String(),
		BatchID:    batchID.String(),
		UserID:     userID.String(),
		TelegramID: telegramID,
		Photos:     photos,
		CreatedAt:  time.Now(),
		RetryCount: 0,
		Priority:   1,
	}

	jobJSON, err := json.Marshal(job)
	if err != nil {
		return fmt.Errorf("failed to marshal job: %w", err)
	}

	ctx := context.Background()
	if err := database.RedisClient.LPush(ctx, PhotoModerationQueue, jobJSON).Err(); err != nil {
		return fmt.Errorf("failed to enqueue job: %w", err)
	}

	log.Printf("✅ Enqueued photo moderation job: batch_id=%s, user_id=%s, photos=%d", 
		batchID, userID, len(photos))
	return nil
}

// GetQueueLength returns the current queue length
func GetQueueLength() (int64, error) {
	if database.RedisClient == nil {
		return 0, fmt.Errorf("Redis client not initialized")
	}

	ctx := context.Background()
	length, err := database.RedisClient.LLen(ctx, PhotoModerationQueue).Result()
	if err != nil {
		return 0, fmt.Errorf("failed to get queue length: %w", err)
	}

	return length, nil
}

// PublishModerationResult publishes a moderation result to the results channel
func PublishModerationResult(result ModerationResult) error {
	if database.RedisClient == nil {
		return fmt.Errorf("Redis client not initialized")
	}

	resultJSON, err := json.Marshal(result)
	if err != nil {
		return fmt.Errorf("failed to marshal result: %w", err)
	}

	ctx := context.Background()
	if err := database.RedisClient.Publish(ctx, ModerationResultsChannel, resultJSON).Err(); err != nil {
		return fmt.Errorf("failed to publish result: %w", err)
	}

	log.Printf("✅ Published moderation result: batch_id=%s, approved=%d, rejected=%d", 
		result.BatchID, result.Summary.Approved, result.Summary.Rejected)
	return nil
}

