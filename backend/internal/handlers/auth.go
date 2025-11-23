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

	// Check if bot token is configured
	if h.cfg.TelegramBotToken == "" {
		log.Printf("❌ TelegramBotToken is not configured")
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error":   "Server configuration error",
			"details": "Telegram bot token is not configured",
		})
	}

	// 1. Validate Telegram Data using official library
	// Consider initData valid for 1 hour from creation moment
	// Wrap in recover to catch any panics from the library
	var validateErr error
	func() {
		defer func() {
			if r := recover(); r != nil {
				log.Printf("❌ Panic during initData validation: %v", r)
				validateErr = fmt.Errorf("validation panic: %v", r)
			}
		}()
		validateErr = initdata.Validate(initData, h.cfg.TelegramBotToken, time.Hour)
	}()

	if validateErr != nil {
		log.Printf("❌ InitData validation failed: %v", validateErr)
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
			"error":   "Invalid Telegram data",
			"details": validateErr.Error(),
		})
	}

	// 2. Parse initData to get user information
	// Wrap in recover to catch any panics from the library
	var parsedData initdata.InitData
	var parseErr error
	func() {
		defer func() {
			if r := recover(); r != nil {
				log.Printf("❌ Panic during initData parsing: %v", r)
				parseErr = fmt.Errorf("parsing panic: %v", r)
			}
		}()
		parsedData, parseErr = initdata.Parse(initData)
	}()

	if parseErr != nil {
		log.Printf("❌ InitData parsing failed: %v", parseErr)
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
			"error":   "Failed to parse Telegram data",
			"details": parseErr.Error(),
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
		PhotoURL:     parsedData.User.PhotoURL,
	}

	// Check database connection
	if database.DB == nil {
		log.Printf("❌ Database connection is nil")
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error":   "Database connection error",
			"details": "Database is not connected",
		})
	}

	// 3. Find or Create User
	var user models.User
	result := database.DB.Where("telegram_id = ?", tgUser.ID).First(&user)

	if result.Error != nil {
		if result.Error == gorm.ErrRecordNotFound {
			// Create new user with required fields
			// Use full name from Telegram (first_name + last_name)
			fullName := strings.TrimSpace(tgUser.FirstName + " " + tgUser.LastName)
			if fullName == "" {
				fullName = "User" // Fallback if name is empty
			}

			// Create user with minimal required fields for Telegram authentication
			user = models.User{
				TelegramID:        tgUser.ID,
				TelegramUsername:  tgUser.Username,
				TelegramFirstName: tgUser.FirstName,
				TelegramLastName:  tgUser.LastName,

				Name:               fullName, // Pre-fill with Telegram name
				Age:                18,
				Gender:             models.GenderOther,
				City:               "Not Set",
				RelationshipGoal:   models.GoalDating,
				Religion:           models.ReligionNone,
				VerificationStatus: models.VerificationPending,
				IsActive:           true,
				IsVerified:         false,
			}

			if err := database.DB.Create(&user).Error; err != nil {
				log.Printf("❌ Failed to create user: %v", err)
				return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
					"error":   "Could not create user",
					"details": err.Error(),
				})
			}

			log.Printf("✅ Created new user: ID=%s, TelegramID=%d", user.ID, user.TelegramID)

			// Save profile photo if available
			if tgUser.PhotoURL != "" {
				media := models.Media{
					UserID:       user.ID,
					MediaType:    models.MediaTypePhoto,
					URL:          tgUser.PhotoURL,
					DisplayOrder: 1,
					IsApproved:   true, // Auto-approve Telegram profile photos? Maybe safe.
				}
				if err := database.DB.Create(&media).Error; err != nil {
					log.Printf("⚠️ Failed to save Telegram profile photo: %v", err)
				} else {
					log.Printf("✅ Saved Telegram profile photo for user %s", user.ID)
				}
			}
		} else {
			log.Printf("❌ Database error: %v", result.Error)
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
				"error":   "Database error",
				"details": result.Error.Error(),
			})
		}
	} else {
		// Update existing user info if changed
		updates := models.User{
			TelegramUsername:  tgUser.Username,
			TelegramFirstName: tgUser.FirstName,
			TelegramLastName:  tgUser.LastName,
		}
		if err := database.DB.Model(&user).Updates(updates).Error; err != nil {
			log.Printf("⚠️ Failed to update user info: %v", err)
			// Don't fail the request, just log the warning
		}
	}

	// 4. Generate JWT Tokens
	if h.cfg.JWTSecret == "" {
		log.Printf("❌ JWTSecret is not configured")
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error":   "Server configuration error",
			"details": "JWT secret is not configured",
		})
	}

	log.Printf("🔑 Generating JWT tokens for user ID: %s", user.ID)
	tokens, err := utils.CreateToken(user.ID, h.cfg.JWTSecret)
	if err != nil {
		log.Printf("❌ Failed to generate tokens: %v", err)
		log.Printf("❌ Error type: %T", err)
		log.Printf("❌ User ID: %s, JWT Secret length: %d", user.ID, len(h.cfg.JWTSecret))
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error":   "Could not generate tokens",
			"details": err.Error(),
		})
	}
	log.Printf("✅ JWT tokens generated successfully")

	// 5. Check onboarding status
	hasProfile := user.City != "" && user.City != "Not Set"

	// 6. Return Response
	log.Printf("✅ Login successful for user ID: %s, TelegramID: %d, OnboardingStep: %d, Completed: %v",
		user.ID, user.TelegramID, user.OnboardingStep, user.OnboardingCompleted)
	response := fiber.Map{
		"access_token":  tokens.AccessToken,
		"refresh_token": tokens.RefreshToken,
		"user": fiber.Map{
			"id":                   user.ID,
			"name":                 user.Name,
			"is_verified":          user.IsVerified,
			"has_profile":          hasProfile,
			"onboarding_step":      user.OnboardingStep,
			"onboarding_completed": user.OnboardingCompleted,
		},
	}
	return c.JSON(response)
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

// TelegramWidgetLogin - REMOVED: No longer needed
// Telegram Mini Apps auto-inject initData, so widget login is obsolete
// This function is kept for reference but routes are removed
func (h *AuthHandler) TelegramWidgetLogin_DEPRECATED(c *fiber.Ctx) error {
	log.Printf("🔐 Widget login request received. Method: %s, Path: %s, IP: %s",
		c.Method(), c.Path(), c.IP())

	// Get parameters from query string (redirect method) or request body (callback method)
	params := make(map[string]string)

	if c.Method() == "GET" {
		// Redirect method - parameters in query string
		// Use c.Query() for individual parameters (Fiber's standard method)
		params["id"] = c.Query("id")
		params["first_name"] = c.Query("first_name")
		params["last_name"] = c.Query("last_name")
		params["username"] = c.Query("username")
		params["photo_url"] = c.Query("photo_url")
		params["auth_date"] = c.Query("auth_date")
		params["hash"] = c.Query("hash")
		log.Printf("📋 Query params: %+v", params)
	} else {
		// POST method - parameters in body (callback method)
		if err := c.BodyParser(&params); err != nil {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
				"error":   "Invalid request body",
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
		LanguageCode: "",    // Widget doesn't provide this
		IsPremium:    false, // Widget doesn't provide this
	}

	// Find or Create User (same logic as Mini App login)
	var user models.User
	result := database.DB.Where("telegram_id = ?", tgUser.ID).First(&user)

	if result.Error != nil {
		if result.Error == gorm.ErrRecordNotFound {
			// Create new user with required fields
			// Note: Age, Gender, and City are required by DB schema but will be updated during onboarding
			firstName := tgUser.FirstName
			if firstName == "" {
				firstName = "User" // Fallback if first name is empty
			}

			// Create user with minimal required fields for Telegram authentication
			// All other fields will be filled during onboarding process
			user = models.User{
				// Telegram Integration (required for auth)
				TelegramID:        tgUser.ID,
				TelegramUsername:  tgUser.Username,
				TelegramFirstName: tgUser.FirstName,
				TelegramLastName:  tgUser.LastName,

				// Required fields (minimal defaults - will be updated in onboarding)
				Name:             firstName,          // From Telegram, will be updated
				Age:              18,                 // Minimum age, will be updated
				Gender:           models.GenderOther, // Default, will be updated
				City:             "Not Set",          // Placeholder, will be updated
				RelationshipGoal: models.GoalDating,  // Default, will be updated

				// Optional enum fields (set defaults to avoid PostgreSQL enum errors)
				Religion:           models.ReligionNone,        // Default, will be updated
				VerificationStatus: models.VerificationPending, // New users start as pending

				// Status
				IsActive:   true,
				IsVerified: false,

				// All other fields will be filled during the onboarding process
			}
			if err := database.DB.Create(&user).Error; err != nil {
				log.Printf("❌ Failed to create user (widget): %v", err)
				log.Printf("❌ Error type: %T", err)
				log.Printf("❌ User data: TelegramID=%d, Name=%s, Age=%d, Gender=%s, City=%s",
					user.TelegramID, user.Name, user.Age, user.Gender, user.City)

				// Check for specific database errors
				if strings.Contains(err.Error(), "duplicate key") || strings.Contains(err.Error(), "UNIQUE constraint") {
					log.Printf("⚠️  User with TelegramID %d already exists, trying to find...", tgUser.ID)
					// Try to find existing user
					if findErr := database.DB.Where("telegram_id = ?", tgUser.ID).First(&user).Error; findErr == nil {
						log.Printf("✅ Found existing user, continuing with login...")
						// Continue with existing user
					} else {
						return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
							"error":   "Could not create or find user",
							"details": err.Error(),
						})
					}
				} else {
					return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
						"error":   "Could not create user",
						"details": err.Error(),
					})
				}
			} else {
				log.Printf("✅ Created new user (widget): ID=%s, TelegramID=%d", user.ID, user.TelegramID)
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

	// For Telegram Login Widget, we need to redirect back to frontend with tokens
	// The widget does a GET redirect, so we redirect to frontend with tokens in URL hash
	frontendURL := c.Get("Origin")
	if frontendURL == "" {
		// Fallback to config or default
		frontendURL = "https://lomi.social"
	}

	// Encode tokens in URL hash (more secure than query params)
	// Include onboarding status in redirect
	redirectURL := fmt.Sprintf("%s/#access_token=%s&refresh_token=%s&user_id=%s&onboarding_step=%d&onboarding_completed=%v",
		frontendURL,
		tokens.AccessToken,
		tokens.RefreshToken,
		user.ID.String(),
		user.OnboardingStep,
		user.OnboardingCompleted,
	)

	log.Printf("✅ Widget login successful, redirecting to: %s (onboarding_step=%d)",
		frontendURL, user.OnboardingStep)
	return c.Redirect(redirectURL, fiber.StatusFound)
}
