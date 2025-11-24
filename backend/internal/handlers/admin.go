package handlers

import (
	"lomi-backend/internal/database"
	"lomi-backend/internal/models"
	"lomi-backend/internal/queue"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
)

// GetPendingReports returns all pending reports for admin review
func GetPendingReports(c *fiber.Ctx) error {
	page := c.QueryInt("page", 1)
	limit := c.QueryInt("limit", 50)
	offset := (page - 1) * limit

	var reports []models.Report
	if err := database.DB.Where("is_reviewed = ?", false).
		Preload("Reporter").
		Preload("ReportedUser").
		Order("created_at DESC").
		Limit(limit).
		Offset(offset).
		Find(&reports).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to fetch reports"})
	}

	return c.JSON(fiber.Map{
		"reports": reports,
		"page":    page,
		"limit":   limit,
	})
}

// ReviewReport allows admin to review and take action on a report
func ReviewReport(c *fiber.Ctx) error {
	user := c.Locals("user").(*jwt.Token)
	claims := user.Claims.(jwt.MapClaims)
	adminIDStr := claims["user_id"].(string)
	adminID, _ := uuid.Parse(adminIDStr)

	reportID := c.Params("id")
	var req struct {
		Action      string `json:"action"` // "approve", "reject", "warn", "ban"
		ActionTaken string `json:"action_taken,omitempty"`
	}
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request"})
	}

	var report models.Report
	if err := database.DB.First(&report, "id = ?", reportID).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Report not found"})
	}

	now := time.Now()
	report.IsReviewed = true
	report.ReviewedBy = &adminID
	report.ReviewedAt = &now
	report.ActionTaken = req.ActionTaken

	// Take action based on review
	switch req.Action {
	case "ban":
		// Ban the reported user
		database.DB.Model(&models.User{}).
			Where("id = ?", report.ReportedUserID).
			Update("is_active", false)
	case "warn":
		// Add warning to user (could be stored in user metadata)
		// For now, just mark as reviewed
	}

	if err := database.DB.Save(&report).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to update report"})
	}

	return c.JSON(fiber.Map{
		"message": "Report reviewed successfully",
		"report":  report,
	})
}

// GetPendingPayouts returns all pending payout requests for admin review
func GetPendingPayouts(c *fiber.Ctx) error {
	page := c.QueryInt("page", 1)
	limit := c.QueryInt("limit", 50)
	offset := (page - 1) * limit

	var payouts []models.Payout
	if err := database.DB.Where("status = ?", models.PayoutStatusPending).
		Preload("User").
		Order("created_at DESC").
		Limit(limit).
		Offset(offset).
		Find(&payouts).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to fetch payouts"})
	}

	return c.JSON(fiber.Map{
		"payouts": payouts,
		"page":    page,
		"limit":   limit,
	})
}

// ProcessPayout allows admin to approve or reject a payout request
func ProcessPayout(c *fiber.Ctx) error {
	user := c.Locals("user").(*jwt.Token)
	claims := user.Claims.(jwt.MapClaims)
	adminIDStr := claims["user_id"].(string)
	adminID, _ := uuid.Parse(adminIDStr)

	payoutID := c.Params("id")
	var req struct {
		Action           string `json:"action"` // "approve", "reject"
		PaymentReference string `json:"payment_reference,omitempty"`
		RejectionReason  string `json:"rejection_reason,omitempty"`
		AdminNotes       string `json:"admin_notes,omitempty"`
	}
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request"})
	}

	var payout models.Payout
	if err := database.DB.First(&payout, "id = ?", payoutID).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Payout not found"})
	}

	if payout.Status != models.PayoutStatusPending {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Payout already processed"})
	}

	now := time.Now()
	payout.ProcessedBy = &adminID
	payout.ProcessedAt = &now
	payout.AdminNotes = req.AdminNotes

	if req.Action == "approve" {
		payout.Status = models.PayoutStatusProcessing
		payout.PaymentReference = req.PaymentReference

		// TODO: Integrate with payment gateway to process payout
		// For now, mark as processing. In production, you'd:
		// 1. Call Telebirr/CBE Birr API to send money
		// 2. Update status to "completed" on success
		// 3. Update status to "rejected" on failure

	} else if req.Action == "reject" {
		payout.Status = models.PayoutStatusRejected
		payout.RejectionReason = req.RejectionReason

		// Refund the amount back to user's gift balance
		var user models.User
		if err := database.DB.First(&user, "id = ?", payout.UserID).Error; err == nil {
			user.GiftBalance += payout.GiftBalanceAmount
			database.DB.Save(&user)
		}
	}

	if err := database.DB.Save(&payout).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to update payout"})
	}

	return c.JSON(fiber.Map{
		"message": "Payout processed successfully",
		"payout":  payout,
	})
}

// GetQueueStats returns statistics about the photo moderation queue
func GetQueueStats(c *fiber.Ctx) error {
	queueLength, err := queue.GetQueueLength()
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error":   "Failed to get queue length",
			"details": err.Error(),
		})
	}

	// Get pending media count
	var pendingCount int64
	database.DB.Model(&models.Media{}).
		Where("moderation_status = ?", "pending").
		Count(&pendingCount)

	// Get stats for last 24 hours
	var last24hStats struct {
		Approved int64
		Rejected int64
		Failed   int64
		Total    int64
	}

	last24h := time.Now().Add(-24 * time.Hour)
	database.DB.Model(&models.Media{}).
		Where("moderated_at > ? AND moderation_status = ?", last24h, "approved").
		Count(&last24hStats.Approved)

	database.DB.Model(&models.Media{}).
		Where("moderated_at > ? AND moderation_status = ?", last24h, "rejected").
		Count(&last24hStats.Rejected)

	database.DB.Model(&models.Media{}).
		Where("moderated_at > ? AND moderation_status = ?", last24h, "failed").
		Count(&last24hStats.Failed)

	last24hStats.Total = last24hStats.Approved + last24hStats.Rejected + last24hStats.Failed

	// Get rejection reasons breakdown (last 24h)
	var rejectionReasons []struct {
		Reason string
		Count  int64
	}
	database.DB.Model(&models.Media{}).
		Select("moderation_reason as reason, COUNT(*) as count").
		Where("moderated_at > ? AND moderation_status = ? AND moderation_reason IS NOT NULL", last24h, "rejected").
		Group("moderation_reason").
		Scan(&rejectionReasons)

	reasonsMap := make(map[string]int64)
	for _, r := range rejectionReasons {
		reasonsMap[r.Reason] = r.Count
	}

	return c.JSON(fiber.Map{
		"queue": fiber.Map{
			"length":        queueLength,
			"pending_media": pendingCount,
		},
		"last_24h": fiber.Map{
			"total":             last24hStats.Total,
			"approved":          last24hStats.Approved,
			"rejected":          last24hStats.Rejected,
			"failed":            last24hStats.Failed,
			"rejection_reasons": reasonsMap,
		},
		"timestamp": time.Now(),
	})
}

// GetModerationDashboard returns a dashboard view of pending and rejected photos
func GetModerationDashboard(c *fiber.Ctx) error {
	status := c.Query("status", "all") // all, pending, rejected, approved
	page := c.QueryInt("page", 1)
	limit := c.QueryInt("limit", 20)
	offset := (page - 1) * limit

	query := database.DB.Model(&models.Media{}).
		Preload("User")

	// Filter by status
	if status != "all" {
		query = query.Where("moderation_status = ?", status)
	}

	// Get total count
	var totalCount int64
	query.Count(&totalCount)

	// Get media records
	var media []models.Media
	if err := query.
		Order("created_at DESC").
		Limit(limit).
		Offset(offset).
		Find(&media).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Failed to fetch media",
		})
	}

	// Format response
	mediaList := make([]fiber.Map, 0, len(media))
	for _, m := range media {
		mediaList = append(mediaList, fiber.Map{
			"id":                m.ID,
			"user_id":           m.UserID,
			"user_name":         m.User.Name,
			"batch_id":          m.BatchID,
			"moderation_status": m.ModerationStatus,
			"moderation_reason": m.ModerationReason,
			"moderation_scores": m.ModerationScores,
			"moderated_at":      m.ModeratedAt,
			"created_at":        m.CreatedAt,
			"url":               m.URL,
		})
	}

	return c.JSON(fiber.Map{
		"media": mediaList,
		"pagination": fiber.Map{
			"page":        page,
			"limit":       limit,
			"total":       totalCount,
			"total_pages": (int(totalCount) + limit - 1) / limit,
		},
		"filters": fiber.Map{
			"status": status,
		},
	})
}
