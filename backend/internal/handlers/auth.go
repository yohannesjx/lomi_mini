package handlers

import (
	"fmt"
	"strings"
	"time"

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
	// Format: "tma <initData>" as per official documentation
	authHeader := c.Get("Authorization")
	if authHeader == "" {
		// Fallback: try to get from request body (for backward compatibility)
		var req struct {
			InitData string `json:"init_data"`
		}
		if err := c.BodyParser(&req); err == nil && req.InitData != "" {
			authHeader = "tma " + req.InitData
		} else {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
				"error": "Missing Authorization header",
				"message": "Expected format: Authorization: tma <initData>",
			})
		}
	}

	// Extract initData from "tma <initData>" format
	// Split by space: [0] = auth type, [1] = auth data
	authParts := strings.SplitN(authHeader, " ", 2)
	if len(authParts) != 2 {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
			"error": "Invalid Authorization header format",
			"message": "Expected format: Authorization: tma <initData>",
		})
	}

	authType := authParts[0]
	initData := authParts[1]

	// Verify auth type is "tma" (Telegram Mini App)
	if authType != "tma" {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
			"error": "Unsupported authorization type",
			"message": fmt.Sprintf("Expected 'tma', got '%s'", authType),
		})
	}

	if initData == "" {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
			"error": "Missing initData in Authorization header",
		})
	}

	// 1. Validate Telegram Data (following official Telegram Mini Apps SDK pattern)
	// Consider initData valid for 1 hour from creation moment
	tgUser, err := utils.ValidateTelegramInitData(initData, h.cfg.TelegramBotToken, time.Hour)
	if err != nil {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
			"error":   "Invalid Telegram data",
			"details": err.Error(),
		})
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
