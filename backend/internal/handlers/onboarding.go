package handlers

import (
	"lomi-backend/internal/database"
	"lomi-backend/internal/models"
	"log"

	"github.com/gofiber/fiber/v2"
	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
)

// GetOnboardingStatus returns the current onboarding status
func GetOnboardingStatus(c *fiber.Ctx) error {
	user := c.Locals("user").(*jwt.Token)
	claims := user.Claims.(jwt.MapClaims)
	userIDStr := claims["user_id"].(string)
	userID, _ := uuid.Parse(userIDStr)

	var dbUser models.User
	if err := database.DB.First(&dbUser, "id = ?", userID).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "User not found"})
	}

	return c.JSON(fiber.Map{
		"onboarding_step":     dbUser.OnboardingStep,
		"onboarding_completed": dbUser.OnboardingCompleted,
		"progress":            calculateProgress(dbUser),
	})
}

// UpdateOnboardingProgress updates the onboarding step
func UpdateOnboardingProgress(c *fiber.Ctx) error {
	user := c.Locals("user").(*jwt.Token)
	claims := user.Claims.(jwt.MapClaims)
	userIDStr := claims["user_id"].(string)
	userID, _ := uuid.Parse(userIDStr)

	var req struct {
		Step     int  `json:"step" validate:"min=0,max=8"`
		Completed bool `json:"completed,omitempty"`
	}

	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request"})
	}

	// Validate step range
	if req.Step < 0 || req.Step > 8 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Step must be between 0 and 8",
		})
	}

	var dbUser models.User
	if err := database.DB.First(&dbUser, "id = ?", userID).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "User not found"})
	}

	// Update onboarding progress
	updates := models.User{
		OnboardingStep: req.Step,
	}

	// If step is 8, mark as completed
	if req.Step == 8 || req.Completed {
		updates.OnboardingCompleted = true
		updates.OnboardingStep = 8
	}

	// Don't allow going backwards (unless explicitly allowed)
	if req.Step < dbUser.OnboardingStep && !req.Completed {
		log.Printf("⚠️ Attempt to go backwards in onboarding: current=%d, requested=%d", 
			dbUser.OnboardingStep, req.Step)
		// Allow it but log it
	}

	if err := database.DB.Model(&dbUser).Updates(updates).Error; err != nil {
		log.Printf("❌ Failed to update onboarding progress: %v", err)
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Failed to update onboarding progress",
		})
	}

	log.Printf("✅ Updated onboarding progress: UserID=%s, Step=%d, Completed=%v", 
		userID, updates.OnboardingStep, updates.OnboardingCompleted)

	// Return updated status
	return c.JSON(fiber.Map{
		"onboarding_step":     updates.OnboardingStep,
		"onboarding_completed": updates.OnboardingCompleted,
		"progress":            calculateProgress(dbUser),
		"message":             "Onboarding progress updated",
	})
}

// calculateProgress calculates the onboarding progress percentage
func calculateProgress(user models.User) int {
	if user.OnboardingCompleted {
		return 100
	}

	// Total steps: 8 (0-8, but 0 is starting point, so 8 steps total)
	// Progress = (current_step / 8) * 100
	progress := (float64(user.OnboardingStep) / 8.0) * 100
	return int(progress)
}

// CheckOnboardingCompletion checks if user has completed onboarding based on profile data
func CheckOnboardingCompletion(userID uuid.UUID) (bool, int) {
	var user models.User
	if err := database.DB.First(&user, "id = ?", userID).Error; err != nil {
		return false, 0
	}

	// If already marked as completed, return that
	if user.OnboardingCompleted {
		return true, 8
	}

	// Calculate current step based on profile data
	step := 0

	// Step 1: Age & Gender (always set during user creation, so check if they're defaults)
	if user.Age > 18 && user.Gender != "" {
		step = 1
	}

	// Step 2: City
	if user.City != "" && user.City != "Not Set" {
		step = 2
	}

	// Step 3: Looking for + Goal (check preferences)
	if prefs, ok := user.Preferences["looking_for"].(string); ok && prefs != "" {
		step = 3
	} else if user.RelationshipGoal != "" {
		step = 3
	}

	// Step 4: Religion
	if user.Religion != "" && user.Religion != models.ReligionNone {
		step = 4
	}

	// Step 5: Photos (check media count)
	var photoCount int64
	database.DB.Model(&models.Media{}).
		Where("user_id = ? AND media_type = ? AND is_approved = ?", userID, models.MediaTypePhoto, true).
		Count(&photoCount)
	if photoCount >= 3 {
		step = 5
	}

	// Step 6: Video (optional, but check if exists)
	var videoCount int64
	database.DB.Model(&models.Media{}).
		Where("user_id = ? AND media_type = ? AND is_approved = ?", userID, models.MediaTypeVideo, true).
		Count(&videoCount)
	if videoCount > 0 {
		step = 6
	}

	// Step 7: Bio & Interests
	if user.Bio != "" && len(user.Interests) > 0 {
		step = 7
	}

	// Step 8: All done
	if step >= 7 && photoCount >= 3 {
		return true, 8
	}

	return false, step
}

