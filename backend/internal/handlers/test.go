package handlers

import (
	"context"
	"fmt"
	"lomi-backend/config"
	"lomi-backend/internal/database"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
)

// TestEndpoint is a simple endpoint to verify backend is reachable
func TestEndpoint(c *fiber.Ctx) error {
	return c.JSON(fiber.Map{
		"status":  "ok",
		"message": "Backend is reachable! ✅",
		"method":  c.Method(),
		"path":    c.Path(),
		"ip":      c.IP(),
		"headers": c.GetReqHeaders(),
	})
}

// TestAuthEndpoint tests if auth endpoint is reachable
func TestAuthEndpoint(c *fiber.Ctx) error {
	return c.JSON(fiber.Map{
		"status":  "ok",
		"message": "Auth endpoint is reachable! ✅",
		"method":  c.Method(),
		"path":    c.Path(),
		"note":    "This endpoint accepts POST requests with Authorization: tma <initData>",
	})
}

// TestS3Connection tests S3/R2 connection and configuration
func TestS3Connection(c *fiber.Ctx) error {
	// Check if S3Client is initialized
	if database.S3Client == nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error":   "S3Client is not initialized",
			"status":  "failed",
			"details": "S3 connection was not established during startup",
		})
	}

	// Get configuration
	cfg := config.Cfg
	configInfo := fiber.Map{
		"endpoint":        cfg.S3Endpoint,
		"region":          cfg.S3Region,
		"use_ssl":         cfg.S3UseSSL,
		"bucket_photos":   cfg.S3BucketPhotos,
		"bucket_videos":   cfg.S3BucketVideos,
		"access_key_set":  cfg.S3AccessKey != "",
		"secret_key_set":  cfg.S3SecretKey != "",
	}

	// Try to generate a test presigned URL
	ctx := context.Background()
	testKey := fmt.Sprintf("test/%s.jpg", uuid.New().String())
	testBucket := cfg.S3BucketPhotos

	uploadURL, err := database.GeneratePresignedUploadURL(ctx, testBucket, testKey, 1*time.Hour)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error":   "Failed to generate test presigned URL",
			"status":  "failed",
			"details": err.Error(),
			"config":  configInfo,
		})
	}

	return c.JSON(fiber.Map{
		"status":        "ok",
		"message":       "S3/R2 connection is working! ✅",
		"s3_initialized": true,
		"config":        configInfo,
		"test_upload_url": uploadURL,
		"test_file_key":  testKey,
		"test_bucket":    testBucket,
		"note":          "Use the test_upload_url to test uploading a file to R2",
	})
}

// TestMediaUpload tests the complete media upload flow
func TestMediaUpload(c *fiber.Ctx) error {
	user := c.Locals("user").(*jwt.Token)
	claims := user.Claims.(jwt.MapClaims)
	userIDStr := claims["user_id"].(string)
	userID, _ := uuid.Parse(userIDStr)

	// Step 1: Get upload URL
	mediaType := c.Query("media_type", "photo")
	var bucket, ext string
	if mediaType == "photo" {
		bucket = config.Cfg.S3BucketPhotos
		ext = ".jpg"
	} else {
		bucket = config.Cfg.S3BucketVideos
		ext = ".mp4"
	}

	fileID := uuid.New()
	key := fmt.Sprintf("users/%s/%s/%s%s", userID.String(), mediaType, fileID.String(), ext)

	ctx := context.Background()
	expiresIn := 1 * time.Hour
	uploadURL, err := database.GeneratePresignedUploadURL(ctx, bucket, key, expiresIn)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error":   "Failed to generate upload URL",
			"details": err.Error(),
		})
	}

	// Return test information
	return c.JSON(fiber.Map{
		"status": "ok",
		"message": "Media upload test endpoint",
		"steps": []string{
			"1. Get upload URL (this response)",
			"2. Upload file to upload_url using PUT method",
			"3. Create media record using POST /api/v1/users/media",
		},
		"upload_url": uploadURL,
		"file_key":  key,
		"bucket":    bucket,
		"method":    "PUT",
		"headers": fiber.Map{
			"Content-Type": "image/jpeg",
		},
		"curl_example": fmt.Sprintf(
			"curl -X PUT '%s' -H 'Content-Type: image/jpeg' --data-binary @test.jpg",
			uploadURL,
		),
		"next_step": fiber.Map{
			"endpoint": "/api/v1/users/media",
			"method":   "POST",
			"body": fiber.Map{
				"media_type":   mediaType,
				"file_key":     key,
				"display_order": 0,
			},
		},
	})
}
