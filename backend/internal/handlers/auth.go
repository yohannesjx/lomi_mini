package handlers

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"errors"
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
	"google.golang.org/api/idtoken"
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
			// Check if user already exists (race condition protection)
			var existingUser models.User
			checkResult := database.DB.Where("telegram_id = ?", tgUser.ID).First(&existingUser)
			if checkResult.Error == nil {
				// User was created between our check and now, use existing user
				user = existingUser
				log.Printf("✅ User already exists (race condition): ID=%s, TelegramID=%s",
					user.ID, utils.TelegramIDString(user.TelegramID))
			} else if checkResult.Error == gorm.ErrRecordNotFound {
				// Create new user with required fields
				// Use full name from Telegram (first_name + last_name)
				fullName := strings.TrimSpace(tgUser.FirstName + " " + tgUser.LastName)
				if fullName == "" {
					fullName = "User" // Fallback if name is empty
				}

				// Initialize JSON fields
				languages := models.JSONStringArray{}
				interests := models.JSONStringArray{}
				preferences := models.JSONMap{}

				// Create user with minimal required fields for Telegram authentication
				// Don't set profile fields (name, age, gender) - user will fill them in onboarding
				telegramID := tgUser.ID
				user = models.User{
					TelegramID:        &telegramID,
					TelegramUsername:  tgUser.Username,
					TelegramFirstName: tgUser.FirstName,
					TelegramLastName:  tgUser.LastName,

					Name:               "User",             // Temporary placeholder - will be updated in onboarding
					Age:                18,                 // Temporary - will be updated in onboarding
					Gender:             models.GenderOther, // Temporary - will be updated in onboarding
					City:               "Not Set",
					RelationshipGoal:   models.GoalDating,
					Religion:           models.ReligionNone,
					VerificationStatus: models.VerificationPending,
					IsActive:           true,
					IsVerified:         false,
					Languages:          languages,
					Interests:          interests,
					Preferences:        preferences,
					CoinBalance:        0,
					GiftBalance:        0.0,
				}

				// Try to create user
				createErr := database.DB.Create(&user).Error
				if createErr != nil {
					log.Printf("❌ Failed to create user: %v", createErr)
					log.Printf("❌ Error type: %T", createErr)
					log.Printf("❌ User data: TelegramID=%s, Name=%s, Age=%d, Gender=%s, City=%s, Religion=%s, VerificationStatus=%s",
						utils.TelegramIDString(user.TelegramID), user.Name, user.Age, user.Gender, user.City, user.Religion, user.VerificationStatus)

					// Check for duplicate key error (user already exists - race condition)
					errStr := strings.ToLower(createErr.Error())
					if strings.Contains(errStr, "duplicate key") ||
						strings.Contains(errStr, "unique constraint") ||
						strings.Contains(errStr, "already exists") {
						log.Printf("⚠️ User already exists (race condition), fetching existing user...")
						// Try to fetch the existing user
						var existingUser models.User
						if fetchErr := database.DB.Where("telegram_id = ?", tgUser.ID).First(&existingUser).Error; fetchErr == nil {
							log.Printf("✅ Found existing user: ID=%s", existingUser.ID)
							user = existingUser // Use existing user
						} else {
							log.Printf("❌ Could not fetch existing user: %v", fetchErr)
							return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
								"error":       "Could not create or find user",
								"details":     createErr.Error(),
								"fetch_error": fetchErr.Error(),
							})
						}
					} else {
						// Return detailed error for other database errors
						log.Printf("❌ Database error details: %+v", createErr)
						return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
							"error":   "Could not create user",
							"details": createErr.Error(),
							"debug": fmt.Sprintf("TelegramID: %s, Name: %s, ErrorType: %T",
								utils.TelegramIDString(user.TelegramID), user.Name, createErr),
						})
					}
				} else {
					log.Printf("✅ Created new user: ID=%s, TelegramID=%s", user.ID, utils.TelegramIDString(user.TelegramID))
				}

				// Save profile photo if available (only for newly created users)
				if user.ID != uuid.Nil && tgUser.PhotoURL != "" {
					media := models.Media{
						UserID:       user.ID,
						MediaType:    models.MediaTypePhoto,
						URL:          tgUser.PhotoURL,
						DisplayOrder: 1,
						IsApproved:   true, // Auto-approve Telegram profile photos
					}
					if err := database.DB.Create(&media).Error; err != nil {
						log.Printf("⚠️ Failed to save Telegram profile photo: %v", err)
					} else {
						log.Printf("✅ Saved Telegram profile photo for user %s", user.ID)
					}
				}
			} else {
				log.Printf("❌ Database error during user lookup: %v", checkResult.Error)
				return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
					"error":   "Database error",
					"details": checkResult.Error.Error(),
				})
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

	// Ensure auth_providers entry exists for Telegram
	if err := upsertAuthProvider(database.DB, user.ID, "telegram", fmt.Sprintf("%d", tgUser.ID), user.Email); err != nil {
		log.Printf("⚠️ Failed to upsert Telegram auth provider: %v", err)
	}

	return h.respondWithAuthTokens(c, &user, "Telegram")
}

// GoogleLogin handles Firebase/Google Sign-In tokens for Web/PWA users
func (h *AuthHandler) GoogleLogin(c *fiber.Ctx) error {
	var req struct {
		IDToken string `json:"id_token"`
	}

	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request body"})
	}

	req.IDToken = strings.TrimSpace(req.IDToken)
	if req.IDToken == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "id_token is required",
		})
	}

	if h.cfg.GoogleClientID == "" {
		log.Printf("❌ GoogleClientID is not configured")
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error":   "Server configuration error",
			"details": "Google client ID is not configured",
		})
	}

	log.Printf("🔍 Validating Google token with client ID: %s", h.cfg.GoogleClientID)
	log.Printf("🔍 Token length: %d", len(req.IDToken))

	payload, err := idtoken.Validate(context.Background(), req.IDToken, h.cfg.GoogleClientID)
	if err != nil {
		log.Printf("❌ Google token validation failed: %v", err)
		log.Printf("❌ Error type: %T", err)

		// Try to decode token to see what audience it has
		parts := strings.Split(req.IDToken, ".")
		if len(parts) >= 2 {
			decoded, decodeErr := base64.RawURLEncoding.DecodeString(parts[1])
			if decodeErr == nil {
				log.Printf("🔍 Token payload (for debugging): %s", string(decoded))
			}
		}

		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
			"error":   "Invalid Google token",
			"details": err.Error(),
		})
	}

	sub, _ := payload.Claims["sub"].(string)
	if sub == "" {
		sub = fmt.Sprint(payload.Claims["sub"])
	}
	if sub == "" {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
			"error": "Google token missing subject",
		})
	}

	email, _ := payload.Claims["email"].(string)
	email = strings.TrimSpace(strings.ToLower(email))

	emailVerified := false
	switch v := payload.Claims["email_verified"].(type) {
	case bool:
		emailVerified = v
	case string:
		emailVerified = strings.EqualFold(v, "true")
	}

	if email == "" || !emailVerified {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Verified email is required for Google authentication",
		})
	}

	fullName, _ := payload.Claims["name"].(string)
	if fullName == "" {
		given, _ := payload.Claims["given_name"].(string)
		family, _ := payload.Claims["family_name"].(string)
		fullName = strings.TrimSpace(strings.Join([]string{given, family}, " "))
	}
	if fullName == "" && email != "" {
		fullName = strings.Split(email, "@")[0]
	}
	if fullName == "" {
		fullName = "Lomi Member"
	}

	photoURL, _ := payload.Claims["picture"].(string)

	var user models.User

	err = database.DB.Transaction(func(tx *gorm.DB) error {
		// 1. Try to find by auth provider
		existingUser, providerErr := findUserByAuthProvider(tx, "google", sub)
		if providerErr == nil && existingUser != nil {
			user = *existingUser
			return nil
		}
		if providerErr != nil && !errors.Is(providerErr, gorm.ErrRecordNotFound) {
			return providerErr
		}

		// 2. Try to find by email (merge account)
		if user.ID == uuid.Nil {
			var existing models.User
			if err := tx.Where("LOWER(email) = LOWER(?)", email).First(&existing).Error; err == nil {
				user = existing
			} else if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
				return err
			}
		}

		// 3. Create new user if needed
		if user.ID == uuid.Nil {
			newUser := models.User{
				Name:               fullName,
				Email:              email,
				Age:                18,
				Gender:             models.GenderOther,
				City:               "Not Set",
				RelationshipGoal:   models.GoalDating,
				Religion:           models.ReligionNone,
				VerificationStatus: models.VerificationPending,
				IsActive:           true,
				IsVerified:         false,
				Languages:          models.JSONStringArray{},
				Interests:          models.JSONStringArray{},
				Preferences:        models.JSONMap{},
				CoinBalance:        0,
				GiftBalance:        0.0,
			}

			if err := tx.Create(&newUser).Error; err != nil {
				return err
			}
			user = newUser

			// Save Google profile photo if available
			if photoURL != "" {
				media := models.Media{
					UserID:       user.ID,
					MediaType:    models.MediaTypePhoto,
					URL:          photoURL,
					DisplayOrder: 1,
					IsApproved:   true,
				}
				if err := tx.Create(&media).Error; err != nil {
					log.Printf("⚠️ Failed to save Google profile photo: %v", err)
				}
			}
		} else if user.Email == "" {
			if err := tx.Model(&user).Update("email", email).Error; err != nil {
				return err
			}
			user.Email = email
		}

		// Ensure auth_providers entry exists
		if err := upsertAuthProvider(tx, user.ID, "google", sub, email); err != nil {
			return err
		}

		return nil
	})

	if err != nil {
		log.Printf("❌ Google login transaction failed: %v", err)
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error":   "Could not process Google login",
			"details": err.Error(),
		})
	}

	log.Printf("✅ Google login successful: user_id=%s email=%s", user.ID, email)
	return h.respondWithAuthTokens(c, &user, "Google")
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

func (h *AuthHandler) respondWithAuthTokens(c *fiber.Ctx, user *models.User, source string) error {
	if h.cfg.JWTSecret == "" {
		log.Printf("❌ JWTSecret is not configured")
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error":   "Server configuration error",
			"details": "JWT secret is not configured",
		})
	}

	tokens, err := utils.CreateToken(user.ID, h.cfg.JWTSecret)
	if err != nil {
		log.Printf("❌ Failed to generate tokens for %s login: %v", source, err)
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error":   "Could not generate tokens",
			"details": err.Error(),
		})
	}

	hasProfile := user.City != "" && user.City != "Not Set"

	log.Printf("✅ %s auth success: user_id=%s telegram_id=%s onboarding_step=%d completed=%v",
		source, user.ID, utils.TelegramIDString(user.TelegramID), user.OnboardingStep, user.OnboardingCompleted)

	return c.JSON(fiber.Map{
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
	})
}

func findUserByAuthProvider(tx *gorm.DB, provider, providerID string) (*models.User, error) {
	var authProvider models.AuthProvider
	if err := tx.Where("provider = ? AND provider_id = ?", provider, providerID).First(&authProvider).Error; err != nil {
		return nil, err
	}

	var user models.User
	if err := tx.Where("id = ?", authProvider.UserID).First(&user).Error; err != nil {
		return nil, err
	}
	return &user, nil
}

func upsertAuthProvider(tx *gorm.DB, userID uuid.UUID, provider, providerID, email string) error {
	if provider == "" || providerID == "" {
		return fmt.Errorf("provider information missing")
	}

	var existing models.AuthProvider
	if err := tx.Where("provider = ? AND provider_id = ?", provider, providerID).First(&existing).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			entry := models.AuthProvider{
				UserID:     userID,
				Provider:   provider,
				ProviderID: providerID,
				Email:      email,
				LinkedAt:   time.Now(),
			}
			return tx.Create(&entry).Error
		}
		return err
	}

	needsUpdate := false
	if existing.UserID != userID {
		existing.UserID = userID
		needsUpdate = true
	}
	if email != "" && !strings.EqualFold(existing.Email, email) {
		existing.Email = email
		needsUpdate = true
	}
	if needsUpdate {
		existing.LinkedAt = time.Now()
		return tx.Save(&existing).Error
	}
	return nil
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
			telegramID := tgUser.ID
			user = models.User{
				// Telegram Integration (required for auth)
				TelegramID:        &telegramID,
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
				log.Printf("❌ User data: TelegramID=%s, Name=%s, Age=%d, Gender=%s, City=%s",
					utils.TelegramIDString(user.TelegramID), user.Name, user.Age, user.Gender, user.City)

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
				log.Printf("✅ Created new user (widget): ID=%s, TelegramID=%s", user.ID, utils.TelegramIDString(user.TelegramID))
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
