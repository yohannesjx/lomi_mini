package config

import (
	"os"
	"strconv"

	"github.com/joho/godotenv"
)

type Config struct {
	AppEnv  string
	AppPort string
	AppName string

	// Database
	DBHost     string
	DBPort     string
	DBUser     string
	DBPassword string
	DBName     string
	DBSSLMode  string

	// Redis
	RedisHost     string
	RedisPort     string
	RedisPassword string
	RedisDB       int

	// Storage (S3/R2)
	S3Endpoint     string
	S3AccessKey    string
	S3SecretKey    string
	S3UseSSL       bool
	S3Region       string
	S3BucketPhotos string
	S3BucketVideos string
	S3BucketGifts  string
	S3BucketVerify string

	// JWT
	JWTSecret        string
	JWTAccessExpiry  string
	JWTRefreshExpiry string

	// Telegram
	TelegramBotToken string

	// Google OAuth
	GoogleClientID string

	// Push Notifications
	OneSignalAppID    string
	OneSignalAPIKey   string
	FirebaseServerKey string
}

var Cfg *Config

func LoadConfig() *Config {
	// Load .env file if it exists (for local non-docker dev)
	_ = godotenv.Load()

	Cfg = &Config{
		AppEnv:  getEnv("APP_ENV", "development"),
		AppPort: getEnv("APP_PORT", "8080"),
		AppName: getEnv("APP_NAME", "Lomi Social API"),

		DBHost:     getEnv("DB_HOST", "localhost"),
		DBPort:     getEnv("DB_PORT", "5432"),
		DBUser:     getEnv("DB_USER", "lomi"),
		DBPassword: getEnv("DB_PASSWORD", "lomi123"),
		DBName:     getEnv("DB_NAME", "lomi_db"),
		DBSSLMode:  getEnv("DB_SSL_MODE", "disable"),

		RedisHost:     getEnv("REDIS_HOST", "localhost"),
		RedisPort:     getEnv("REDIS_PORT", "6379"),
		RedisPassword: getEnv("REDIS_PASSWORD", ""),
		RedisDB:       getEnvAsInt("REDIS_DB", 0),

		S3Endpoint:     getEnv("S3_ENDPOINT", "localhost:9000"),
		S3AccessKey:    getEnv("S3_ACCESS_KEY", "minioadmin"),
		S3SecretKey:    getEnv("S3_SECRET_KEY", "minioadmin"),
		S3UseSSL:       getEnvAsBool("S3_USE_SSL", false),
		S3Region:       getEnv("S3_REGION", "auto"),
		S3BucketPhotos: getEnv("S3_BUCKET_PHOTOS", "lomi-photos"),
		S3BucketVideos: getEnv("S3_BUCKET_VIDEOS", "lomi-videos"),
		S3BucketGifts:  getEnv("S3_BUCKET_GIFTS", "lomi-gifts"),
		S3BucketVerify: getEnv("S3_BUCKET_VERIFICATIONS", "lomi-verifications"),

		JWTSecret:        getEnv("JWT_SECRET", "secret"),
		JWTAccessExpiry:  getEnv("JWT_ACCESS_EXPIRY", "24h"),
		JWTRefreshExpiry: getEnv("JWT_REFRESH_EXPIRY", "168h"),

		TelegramBotToken: getEnv("TELEGRAM_BOT_TOKEN", ""),

		GoogleClientID: getEnv("GOOGLE_CLIENT_ID", ""),

		OneSignalAppID:    getEnv("ONESIGNAL_APP_ID", ""),
		OneSignalAPIKey:   getEnv("ONESIGNAL_API_KEY", ""),
		FirebaseServerKey: getEnv("FIREBASE_SERVER_KEY", ""),
	}
	return Cfg
}

func getEnv(key, fallback string) string {
	if value, exists := os.LookupEnv(key); exists {
		return value
	}
	return fallback
}

func getEnvAsInt(key string, fallback int) int {
	valueStr := getEnv(key, "")
	if value, err := strconv.Atoi(valueStr); err == nil {
		return value
	}
	return fallback
}

func getEnvAsBool(key string, fallback bool) bool {
	valueStr := getEnv(key, "")
	if value, err := strconv.ParseBool(valueStr); err == nil {
		return value
	}
	return fallback
}
