package services

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"lomi-backend/internal/database"
	"lomi-backend/internal/models"
	"lomi-backend/internal/queue"
	"time"

	"github.com/google/uuid"
)

var (
	pushDedupeMap = make(map[string]time.Time) // user_id -> last push time
	pushDedupeTTL = 10 * time.Second           // Max 1 push per 10 seconds
)

// StartModerationSubscriber starts listening to moderation results and updates DB
func StartModerationSubscriber() {
	if database.RedisClient == nil {
		log.Printf("❌ Redis client not initialized, cannot start moderation subscriber")
		return
	}

	ctx := context.Background()
	pubsub := database.RedisClient.Subscribe(ctx, queue.ModerationResultsChannel)
	defer pubsub.Close()

	log.Printf("✅ Moderation subscriber started, listening on channel: %s", queue.ModerationResultsChannel)

	// Clean up old dedupe entries periodically
	go func() {
		ticker := time.NewTicker(1 * time.Minute)
		defer ticker.Stop()
		for range ticker.C {
			now := time.Now()
			for userID, lastPush := range pushDedupeMap {
				if now.Sub(lastPush) > pushDedupeTTL {
					delete(pushDedupeMap, userID)
				}
			}
		}
	}()

	for {
		msg, err := pubsub.ReceiveMessage(ctx)
		if err != nil {
			log.Printf("❌ Error receiving moderation result: %v", err)
			time.Sleep(1 * time.Second)
			continue
		}

		go handleModerationResult(msg.Payload)
	}
}

func handleModerationResult(payload string) {
	var result queue.ModerationResult
	if err := json.Unmarshal([]byte(payload), &result); err != nil {
		log.Printf("❌ Failed to unmarshal moderation result: %v", err)
		return
	}

	log.Printf("📥 Received moderation result: batch_id=%s, approved=%d, rejected=%d",
		result.BatchID, result.Summary.Approved, result.Summary.Rejected)

	batchID, err := uuid.Parse(result.BatchID)
	if err != nil {
		log.Printf("❌ Invalid batch_id: %v", err)
		return
	}

	// Update all media records in batch
	for _, photoResult := range result.Results {
		mediaID, err := uuid.Parse(photoResult.MediaID)
		if err != nil {
			log.Printf("❌ Invalid media_id: %v", err)
			continue
		}

		updates := models.Media{
			ModerationStatus: photoResult.Status,
			ModerationReason: photoResult.Reason,
			ModeratedAt:      time.Now(),
		}

		// Convert scores to JSONMap
		if photoResult.Scores != nil {
			scoresMap := make(models.JSONMap)
			for k, v := range photoResult.Scores {
				scoresMap[k] = v
			}
			updates.ModerationScores = scoresMap
		}

		// Set is_approved based on status
		if photoResult.Status == "approved" {
			updates.IsApproved = true
		} else {
			updates.IsApproved = false
		}

		if err := database.DB.Model(&models.Media{}).
			Where("id = ? AND batch_id = ?", mediaID, batchID).
			Updates(updates).Error; err != nil {
			log.Printf("❌ Failed to update media record %s: %v", mediaID, err)
			continue
		}

		// Log detailed moderation result with scores
		scoresJSON, _ := json.Marshal(photoResult.Scores)
		log.Printf("📊 Moderation Result: media_id=%s, status=%s, reason=%s, scores=%s",
			mediaID, photoResult.Status, photoResult.Reason, string(scoresJSON))

		log.Printf("✅ Updated media record: media_id=%s, status=%s", mediaID, photoResult.Status)
	}

	// Send smart grouped push notification (with deduplication)
	sendSmartPush(result)
}

func sendSmartPush(result queue.ModerationResult) {
	// Check if we should send push (dedupe: max 1 per 10 seconds per user)
	userIDStr := result.UserID
	now := time.Now()

	if lastPush, exists := pushDedupeMap[userIDStr]; exists {
		if now.Sub(lastPush) < pushDedupeTTL {
			log.Printf("⏭️ Skipping push (dedupe): user_id=%s, last_push=%v ago",
				userIDStr, now.Sub(lastPush))
			return
		}
	}

	// Update dedupe map
	pushDedupeMap[userIDStr] = now

	// Generate smart message based on results
	var message string
	total := result.Summary.Total
	approved := result.Summary.Approved

	if approved == total {
		// All approved
		message = fmt.Sprintf("✅ ሁሉም %d ፎቶዎች ዝግጁ ናቸው!\n\nAll %d photos are live!", total, total)
	} else if approved == 0 {
		// All rejected
		message = "❌ ፎቶዎች የበለጠ ግልጽ መሆን አለባቸው. እንደገና ይጭኑ\n\nPhotos need to be clearer. Please upload again"
	} else {
		// Mixed results
		reasons := make([]string, 0)
		for reason, count := range result.Summary.Reasons {
			reasons = append(reasons, fmt.Sprintf("%d %s", count, getReasonText(reason)))
		}
		reasonText := ""
		if len(reasons) > 0 {
			reasonText = reasons[0] // Use first reason
		}
		message = fmt.Sprintf("✅ %d/%d ፎቶዎች ዝግጁ ናቸው, %s\n\n%d/%d photos approved, %s",
			approved, total, reasonText, approved, total, reasonText)
	}

	// Send Telegram push notification
	if result.TelegramID > 0 {
		// Use the notification service (same package, no import needed)
		if NotificationSvc != nil {
			if err := NotificationSvc.SendTelegramMessage(result.TelegramID, message); err != nil {
				log.Printf("❌ Failed to send Telegram push: %v", err)
			} else {
				log.Printf("✅ Sent push notification: user_id=%s, telegram_id=%d",
					userIDStr, result.TelegramID)
			}
		}
	}
}

func getReasonText(reason string) string {
	reasons := map[string]string{
		"blurry":   "ፎቶው ብዥ ነው!",
		"no_face":  "ፊትሽን/ፊቱን አሳይን!",
		"underage": "መታወቂያ ማረጋገጥ አለብህ (18+)",
		"nsfw":     "ፎቶው ተገቢ አይደለም",
	}
	if text, ok := reasons[reason]; ok {
		return text
	}
	return reason
}
