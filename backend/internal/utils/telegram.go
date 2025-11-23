package utils

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/url"
	"sort"
	"strconv"
	"strings"
	"time"
)

// TelegramUser represents the user data inside initData
type TelegramUser struct {
	ID           int64  `json:"id"`
	FirstName    string `json:"first_name"`
	LastName     string `json:"last_name"`
	Username     string `json:"username"`
	LanguageCode string `json:"language_code"`
	IsPremium    bool   `json:"is_premium"`
}

// ValidateTelegramInitData validates the initData string from Telegram WebApp
// Following official Telegram Mini Apps SDK pattern
// expiresIn: maximum age of initData in seconds (e.g., 3600 for 1 hour)
func ValidateTelegramInitData(initData string, botToken string, expiresIn ...time.Duration) (*TelegramUser, error) {
	// Parse query string
	values, err := url.ParseQuery(initData)
	if err != nil {
		return nil, fmt.Errorf("failed to parse initData: %w", err)
	}

	// Check expiration (if auth_date is present)
	if authDateStr := values.Get("auth_date"); authDateStr != "" {
		authDate, err := strconv.ParseInt(authDateStr, 10, 64)
		if err == nil {
			authTime := time.Unix(authDate, 0)
			maxAge := time.Hour // Default: 1 hour
			if len(expiresIn) > 0 {
				maxAge = expiresIn[0]
			}
			
			if time.Since(authTime) > maxAge {
				return nil, fmt.Errorf("initData expired (older than %v)", maxAge)
			}
		}
	}

	// Extract hash
	hash := values.Get("hash")
	if hash == "" {
		return nil, fmt.Errorf("hash is missing")
	}
	values.Del("hash")

	// Sort keys alphabetically
	var keys []string
	for k := range values {
		keys = append(keys, k)
	}
	sort.Strings(keys)

	// Create data check string (format: key=value\nkey=value)
	var dataCheckArr []string
	for _, k := range keys {
		dataCheckArr = append(dataCheckArr, fmt.Sprintf("%s=%s", k, values.Get(k)))
	}
	dataCheckString := strings.Join(dataCheckArr, "\n")

	// Compute HMAC-SHA256
	// Secret key = HMAC-SHA256("WebAppData", botToken)
	secretKey := hmac.New(sha256.New, []byte("WebAppData"))
	secretKey.Write([]byte(botToken))
	secret := secretKey.Sum(nil)

	// Compute hash
	h := hmac.New(sha256.New, secret)
	h.Write([]byte(dataCheckString))
	computedHash := hex.EncodeToString(h.Sum(nil))

	// Compare hashes
	if computedHash != hash {
		return nil, fmt.Errorf("invalid hash: signature verification failed")
	}

	// Parse user data
	userJSON := values.Get("user")
	if userJSON == "" {
		return nil, fmt.Errorf("user data missing")
	}

	var user TelegramUser
	if err := json.Unmarshal([]byte(userJSON), &user); err != nil {
		return nil, fmt.Errorf("failed to parse user data: %w", err)
	}

	return &user, nil
}
