package handlers

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"log"
	"sort"
	"strconv"
	"strings"
	"time"

	"lomi-backend/config"
	"lomi-backend/internal/database"
	"lomi-backend/internal/models"
	"lomi-backend/internal/utils"

	"github.com/gofiber/fiber/v2"
	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	initdata "github.com/telegram-mini-apps/init-data-golang"
	"gorm.io/gorm"
)

type AuthHandler struct {
	cfg *config.Config
}

func NewAuthHandler(cfg *config.Config) *AuthHandler {
	return &AuthHandler{cfg: cfg}
}

func (h *AuthHandler) TelegramLogin(c *fiber.Ctx) error {
	// Log incoming request for debugging
	log.Printf("🔐 Login request received. Method: %s, Path: %s, OriginalURL: %s, IP: %s", 
		c.Method(), c.Path(), c.OriginalURL(), c.IP())
	log.Printf("📋 Headers: %+v", c.GetReqHeaders())
	log.Printf("📋 Content-Type: %s", c.Get("Content-Type"))
	log.Printf("📋 Authorization header present: %v", c.Get("Authorization") != "")

	// Get initData from Authorization header (Telegram Mini Apps SDK approach)
	// Format: "tma <initData>" as per official documentation
	authHeader := c.Get("Authorization")

	// Log auth header presence (don't log full content for security, just length)
	if authHeader != "" {
		log.Printf("Authorization header present. Length: %d", len(authHeader))
	} else {
		log.Println("Authorization header missing, trying body...")
	}

	if authHeader == "" {
		// Fallback: try to get from request body (for backward compatibility)
		var req struct {
			InitData string `json:"init_data"`
		}
		if err := c.BodyParser(&req); err == nil && req.InitData != "" {
			authHeader = "tma " + req.InitData
			log.Println("Found initData in request body")
		} else {
			log.Println("No initData found in header or body")
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
				"error":   "Missing Authorization header",
				"message": "Expected format: Authorization: tma <initData>",
			})
		}
	}

	// Extract initData from "tma <initData>" format
	// Split by space: [0] = auth type, [1] = auth data
	authParts := strings.SplitN(authHeader, " ", 2)
	if len(authParts) != 2 {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
			"error":   "Invalid Authorization header format",
			"message": "Expected format: Authorization: tma <initData>",
		})
	}

	authType := authParts[0]
	initData := authParts[1]

	// Verify auth type is "tma" (Telegram Mini App)
	if authType != "tma" {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
			"error":   "Unsupported authorization type",
			"message": fmt.Sprintf("Expected 'tma', got '%s'", authType),
		})
	}

	if initData == "" {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
			"error": "Missing initData in Authorization header",
		})
	}

	// 1. Validate Telegram Data using official library
	// Consider initData valid for 1 hour from creation moment
	err := initdata.Validate(initData, h.cfg.TelegramBotToken, time.Hour)
	if err != nil {
		log.Printf("❌ InitData validation failed: %v", err)
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
			"error":   "Invalid Telegram data",
			"details": err.Error(),
		})
	}

	// 2. Parse initData to get user information
	parsedData, err := initdata.Parse(initData)
	if err != nil {
		log.Printf("❌ InitData parsing failed: %v", err)
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
			"error":   "Failed to parse Telegram data",
			"details": err.Error(),
		})
	}

	// Extract user from parsed data
	// parsedData.User is a struct (not a pointer), check if ID is valid
	if parsedData.User.ID == 0 {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
			"error": "User data missing in initData",
		})
	}

	tgUser := &utils.TelegramUser{
		ID:           parsedData.User.ID,
		FirstName:    parsedData.User.FirstName,
		LastName:     parsedData.User.LastName,
		Username:     parsedData.User.Username,
		LanguageCode: parsedData.User.LanguageCode,
		IsPremium:    parsedData.User.IsPremium,
	}

	// 3. Find or Create User
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

	// 4. Generate JWT Tokens
	tokens, err := utils.CreateToken(user.ID, h.cfg.JWTSecret)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Could not generate tokens"})
	}

	// 5. Return Response
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

// TelegramWidgetLogin handles Telegram Login Widget authentication
// See: https://core.telegram.org/widgets/login
// This accepts query parameters: id, first_name, last_name, username, photo_url, auth_date, hash
func (h *AuthHandler) TelegramWidgetLogin(c *fiber.Ctx) error {
	log.Printf("🔐 Widget login request received. Method: %s, Path: %s, IP: %s", 
		c.Method(), c.Path(), c.IP())
	
	// Get parameters from query string (redirect method) or request body (callback method)
	params := make(map[string]string)
	
	if c.Method() == "GET" {
		// Redirect method - parameters in query string
		// c.Queries() returns map[string][]string
		for key, values := range c.Queries() {
			if len(values) > 0 {
				params[key] = values[0]
			}
		}
		log.Printf("📋 Query params: %+v", params)
	} else {
		// POST method - parameters in body (callback method)
		if err := c.BodyParser(&params); err != nil {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
				"error": "Invalid request body",
				"details": err.Error(),
			})
		}
		log.Printf("📋 Body params: %+v", params)
	}
	
	// Extract required fields
	idStr := params["id"]
	firstName := params["first_name"]
	lastName := params["last_name"]
	username := params["username"]
	// photoURL := params["photo_url"] // Available but not used for now
	authDateStr := params["auth_date"]
	hash := params["hash"]
	
	if idStr == "" || hash == "" || authDateStr == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Missing required parameters: id, hash, auth_date",
		})
	}
	
	// Parse user ID
	userID, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Invalid user ID",
		})
	}
	
	// Parse auth date
	authDate, err := strconv.ParseInt(authDateStr, 10, 64)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Invalid auth_date",
		})
	}
	
	// Check expiration (1 hour)
	authTime := time.Unix(authDate, 0)
	if time.Since(authTime) > time.Hour {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
			"error": "Authentication data expired",
		})
	}
	
	// Verify hash according to Telegram Login Widget spec
	// Data-check-string: all fields sorted alphabetically, format: key=value\nkey=value
	// Secret key: SHA256(bot_token)
	// Hash: hex(HMAC-SHA256(data_check_string, secret_key))
	
	// Build data-check-string (excluding hash itself)
	dataCheckMap := make(map[string]string)
	for k, v := range params {
		if k != "hash" {
			dataCheckMap[k] = v
		}
	}
	
	// Sort keys alphabetically
	var keys []string
	for k := range dataCheckMap {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	
	// Create data-check-string
	var dataCheckArr []string
	for _, k := range keys {
		dataCheckArr = append(dataCheckArr, fmt.Sprintf("%s=%s", k, dataCheckMap[k]))
	}
	dataCheckString := strings.Join(dataCheckArr, "\n")
	
	// Compute secret key: SHA256(bot_token)
	secretKeyHash := sha256.Sum256([]byte(h.cfg.TelegramBotToken))
	secretKey := secretKeyHash[:]
	
	// Compute HMAC-SHA256
	mac := hmac.New(sha256.New, secretKey)
	mac.Write([]byte(dataCheckString))
	computedHash := hex.EncodeToString(mac.Sum(nil))
	
	// Compare hashes
	if computedHash != hash {
		log.Printf("❌ Hash verification failed. Expected: %s, Got: %s", hash, computedHash)
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
			"error": "Invalid hash: signature verification failed",
		})
	}
	
	log.Printf("✅ Hash verified successfully for user ID: %d", userID)
	
	// Create TelegramUser from widget data
	tgUser := &utils.TelegramUser{
		ID:           userID,
		FirstName:    firstName,
		LastName:     lastName,
		Username:     username,
		LanguageCode: "", // Widget doesn't provide this
		IsPremium:    false, // Widget doesn't provide this
	}
	
	// Find or Create User (same logic as Mini App login)
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
				Name:              tgUser.FirstName,
				IsActive:          true,
			}
			if err := database.DB.Create(&user).Error; err != nil {
				return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Could not create user"})
			}
		} else {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Database error"})
		}
	} else {
		// Update existing user info
		updates := models.User{
			TelegramUsername:  tgUser.Username,
			TelegramFirstName: tgUser.FirstName,
			TelegramLastName:  tgUser.LastName,
		}
		database.DB.Model(&user).Updates(updates)
	}
	
	// Generate JWT Tokens
	tokens, err := utils.CreateToken(user.ID, h.cfg.JWTSecret)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Could not generate tokens"})
	}
	
	// Return response
	return c.JSON(fiber.Map{
		"access_token":  tokens.AccessToken,
		"refresh_token": tokens.RefreshToken,
		"user": fiber.Map{
			"id":          user.ID,
			"name":        user.Name,
			"is_verified": user.IsVerified,
			"has_profile": user.City != "",
		},
	})
}
