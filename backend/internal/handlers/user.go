package handlers

import (
	"lomi-backend/internal/database"
	"lomi-backend/internal/models"

	"github.com/gofiber/fiber/v2"
	"github.com/golang-jwt/jwt/v5"
)

type UpdateProfileRequest struct {
	Name             string                 `json:"name"`
	Age              int                    `json:"age"`
	Gender           string                 `json:"gender"`
	Bio              string                 `json:"bio"`
	City             string                 `json:"city"`
	Interests        []string               `json:"interests"`
	RelationshipGoal string                 `json:"relationship_goal"`
	Preferences      map[string]interface{} `json:"preferences"`
}

func GetMe(c *fiber.Ctx) error {
	user := c.Locals("user").(*jwt.Token)
	claims := user.Claims.(jwt.MapClaims)
	userID := claims["user_id"].(string)

	var dbUser models.User
	if err := database.DB.First(&dbUser, "id = ?", userID).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "User not found"})
	}

	return c.JSON(dbUser)
}

// GetAllUsers lists all users (for testing/admin purposes)
func GetAllUsers(c *fiber.Ctx) error {
	var users []models.User
	
	// Get query parameters
	limit := c.QueryInt("limit", 100)
	offset := c.QueryInt("offset", 0)
	telegramOnly := c.QueryBool("telegram_only", false)
	
	query := database.DB
	
	// Filter to only users with Telegram ID if requested
	if telegramOnly {
		query = query.Where("telegram_id IS NOT NULL AND telegram_id > 0")
	}
	
	// Order by creation date (newest first)
	query = query.Order("created_at DESC")
	
	// Apply limit and offset
	if limit > 0 {
		query = query.Limit(limit)
	}
	if offset > 0 {
		query = query.Offset(offset)
	}
	
	if err := query.Find(&users).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Failed to fetch users",
			"details": err.Error(),
		})
	}
	
	// Count total users
	var totalCount int64
	countQuery := database.DB.Model(&models.User{})
	if telegramOnly {
		countQuery = countQuery.Where("telegram_id IS NOT NULL AND telegram_id > 0")
	}
	countQuery.Count(&totalCount)
	
	// Format response with only relevant fields
	type UserSummary struct {
		ID                string `json:"id"`
		TelegramID        *int64 `json:"telegram_id"`
		TelegramUsername  string `json:"telegram_username"`
		TelegramFirstName string `json:"telegram_first_name"`
		TelegramLastName  string `json:"telegram_last_name"`
		Name              string `json:"name"`
		Email             string `json:"email"`
		Age               int    `json:"age"`
		Gender            string `json:"gender"`
		City              string `json:"city"`
		CreatedAt         string `json:"created_at"`
		UpdatedAt         string `json:"updated_at"`
	}
	
	summaries := make([]UserSummary, 0, len(users))
	for _, u := range users {
		summaries = append(summaries, UserSummary{
			ID:                u.ID.String(),
			TelegramID:        u.TelegramID,
			TelegramUsername:  u.TelegramUsername,
			TelegramFirstName: u.TelegramFirstName,
			TelegramLastName:  u.TelegramLastName,
			Name:              u.Name,
			Email:             u.Email,
			Age:               u.Age,
			Gender:            string(u.Gender),
			City:              u.City,
			CreatedAt:         u.CreatedAt.Format("2006-01-02 15:04:05"),
			UpdatedAt:         u.UpdatedAt.Format("2006-01-02 15:04:05"),
		})
	}
	
	return c.JSON(fiber.Map{
		"users":       summaries,
		"count":       len(summaries),
		"total_count": totalCount,
		"limit":       limit,
		"offset":      offset,
		"telegram_only": telegramOnly,
	})
}

func UpdateProfile(c *fiber.Ctx) error {
	user := c.Locals("user").(*jwt.Token)
	claims := user.Claims.(jwt.MapClaims)
	userID := claims["user_id"].(string)

	var req UpdateProfileRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request body"})
	}

	var dbUser models.User
	if err := database.DB.First(&dbUser, "id = ?", userID).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "User not found"})
	}

	// Update fields
	if req.Name != "" {
		dbUser.Name = req.Name
	}
	if req.Age > 0 {
		dbUser.Age = req.Age
	}
	if req.Gender != "" {
		dbUser.Gender = models.Gender(req.Gender)
	}
	if req.Bio != "" {
		dbUser.Bio = req.Bio
	}
	if req.City != "" {
		dbUser.City = req.City
	}
	if len(req.Interests) > 0 {
		dbUser.Interests = req.Interests
	}
	if req.RelationshipGoal != "" {
		dbUser.RelationshipGoal = models.RelationshipGoal(req.RelationshipGoal)
	}
	if req.Preferences != nil {
		// Merge with existing preferences
		if dbUser.Preferences == nil {
			dbUser.Preferences = make(models.JSONMap)
		}
		for key, value := range req.Preferences {
			dbUser.Preferences[key] = value
		}
	}

	// Profile is considered complete if basic info is present (City check is done elsewhere)

	if err := database.DB.Save(&dbUser).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to update profile"})
	}

	return c.JSON(dbUser)
}
