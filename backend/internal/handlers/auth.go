package handlers

import (
	"strings"
	"lomi-backend/config"
	"lomi-backend/internal/database"
	"lomi-backend/internal/models"
	"lomi-backend/internal/utils"

	"github.com/gofiber/fiber/v2"
	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"gorm.io/gorm"
)

type AuthHandler struct {
	cfg *config.Config
}

func NewAuthHandler(cfg *config.Config) *AuthHandler {
	return &AuthHandler{cfg: cfg}
}

func (h *AuthHandler) TelegramLogin(c *fiber.Ctx) error {
	// Get initData from Authorization header (Telegram Mini Apps SDK approach)
	// Format: "tma <initData>"
	authHeader := c.Get("Authorization")
	if authHeader == "" {
		// Fallback: try to get from request body (for backward compatibility)
		var req struct {
			InitData string `json:"init_data"`
		}
		if err := c.BodyParser(&req); err == nil && req.InitData != "" {
			authHeader = "tma " + req.InitData
		} else {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "Missing Authorization header or init_data"})
		}
	}

	// Extract initData from "tma <initData>" format
	var initData string
	if strings.HasPrefix(authHeader, "tma ") {
		initData = strings.TrimPrefix(authHeader, "tma ")
	} else {
		// If no "tma " prefix, assume the whole header is initData (backward compatibility)
		initData = authHeader
	}

	if initData == "" {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "Invalid Authorization header format"})
	}

	// 1. Validate Telegram Data
	tgUser, err := utils.ValidateTelegramInitData(initData, h.cfg.TelegramBotToken)
	if err != nil {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "Invalid Telegram data", "details": err.Error()})
	}

	// 2. Find or Create User
	var user models.User
	result := database.DB.Where("telegram_id = ?", tgUser.ID).First(&user)

	if result.Error != nil {
		if result.Error == gorm.ErrRecordNotFound {
			// Create new user
			user = models.User{
				TelegramID:        tgUser.ID,
				TelegramUsername:  tgUser.Username,
				TelegramFirstName: tgUser.FirstName,
				TelegramLastName:  tgUser.LastName,
				Name:              tgUser.FirstName, // Default name
				IsActive:          true,
				// Other fields will be filled during onboarding
			}
			if err := database.DB.Create(&user).Error; err != nil {
				return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Could not create user"})
			}
		} else {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Database error"})
		}
	} else {
		// Update existing user info if changed
		updates := models.User{
			TelegramUsername:  tgUser.Username,
			TelegramFirstName: tgUser.FirstName,
			TelegramLastName:  tgUser.LastName,
		}
		database.DB.Model(&user).Updates(updates)
	}

	// 3. Generate JWT Tokens
	tokens, err := utils.CreateToken(user.ID, h.cfg.JWTSecret)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Could not generate tokens"})
	}

	// 4. Return Response
	return c.JSON(fiber.Map{
		"access_token":  tokens.AccessToken,
		"refresh_token": tokens.RefreshToken,
		"user": fiber.Map{
			"id":          user.ID,
			"name":        user.Name,
			"is_verified": user.IsVerified,
			"has_profile": user.City != "", // Simple check if onboarding is done
		},
	})
}

// RefreshToken handles token refresh
func RefreshToken(c *fiber.Ctx) error {
	var req struct {
		RefreshToken string `json:"refresh_token"`
	}
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request"})
	}

	cfg := config.Cfg

	// Parse refresh token
	token, err := jwt.Parse(req.RefreshToken, func(token *jwt.Token) (interface{}, error) {
		return []byte(cfg.JWTSecret), nil
	})

	if err != nil || !token.Valid {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "Invalid refresh token"})
	}

	claims := token.Claims.(jwt.MapClaims)
	userIDStr := claims["user_id"].(string)
	userID, err := uuid.Parse(userIDStr)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid user ID in token"})
	}

	// Generate new tokens
	tokens, err := utils.CreateToken(userID, cfg.JWTSecret)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to generate tokens"})
	}

	return c.JSON(fiber.Map{
		"access_token":  tokens.AccessToken,
		"refresh_token": tokens.RefreshToken,
	})
}
