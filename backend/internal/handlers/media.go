package handlers

import (
	"context"
	"fmt"
	"lomi-backend/config"
	"lomi-backend/internal/database"
	"lomi-backend/internal/models"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
)

// UploadMedia handles media upload (creates record, actual upload via pre-signed URL)
func UploadMedia(c *fiber.Ctx) error {
	user := c.Locals("user").(*jwt.Token)
	claims := user.Claims.(jwt.MapClaims)
	userIDStr := claims["user_id"].(string)
	userID, _ := uuid.Parse(userIDStr)

	fmt.Printf("📸 UploadMedia request - UserID: %s\n", userID)

	var req struct {
		MediaType      string `json:"media_type"` // "photo" or "video"
		FileKey        string `json:"file_key"`   // S3 key (path) after upload to R2/S3
		ThumbnailKey   string `json:"thumbnail_key,omitempty"` // S3 key for thumbnail
		DurationSeconds int   `json:"duration_seconds,omitempty"`
		DisplayOrder   int    `json:"display_order"`
	}
	if err := c.BodyParser(&req); err != nil {
		fmt.Printf("❌ Failed to parse request body: %v\n", err)
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request", "details": err.Error()})
	}

	fmt.Printf("📸 Request data - MediaType: %s, FileKey: %s, DisplayOrder: %d\n", 
		req.MediaType, req.FileKey, req.DisplayOrder)

	// Validate media type
	if req.MediaType != string(models.MediaTypePhoto) && req.MediaType != string(models.MediaTypeVideo) {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid media type"})
	}

	// Count existing media
	var photoCount, videoCount int64
	database.DB.Model(&models.Media{}).
		Where("user_id = ? AND media_type = ?", userID, models.MediaTypePhoto).
		Count(&photoCount)
	database.DB.Model(&models.Media{}).
		Where("user_id = ? AND media_type = ?", userID, models.MediaTypeVideo).
		Count(&videoCount)

	// Enforce limits: max 9 photos, max 1 video
	if req.MediaType == string(models.MediaTypePhoto) && photoCount >= 9 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Maximum 9 photos allowed"})
	}
	if req.MediaType == string(models.MediaTypeVideo) && videoCount >= 1 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Maximum 1 video allowed"})
	}

	// Validate file key is provided
	if req.FileKey == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "file_key is required"})
	}

	media := models.Media{
		UserID:          userID,
		MediaType:       models.MediaType(req.MediaType),
		URL:             req.FileKey, // Store S3 key in URL field
		ThumbnailURL:    req.ThumbnailKey, // Store thumbnail S3 key
		DurationSeconds: req.DurationSeconds,
		DisplayOrder:    req.DisplayOrder,
		IsApproved:      false, // Requires moderation
	}

	if err := database.DB.Create(&media).Error; err != nil {
		fmt.Printf("❌ Failed to create media record: %v\n", err)
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Failed to create media record",
			"details": err.Error(),
		})
	}

	fmt.Printf("✅ Media record created successfully - ID: %s, FileKey: %s\n", media.ID, media.URL)
	return c.Status(fiber.StatusCreated).JSON(media)
}

// GetUserMedia returns all media for a user with pre-signed download URLs
func GetUserMedia(c *fiber.Ctx) error {
	userIDParam := c.Params("user_id")
	userID, err := uuid.Parse(userIDParam)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid user ID"})
	}

	var photos []models.Media
	var videos []models.Media

	database.DB.Where("user_id = ? AND media_type = ? AND is_approved = ?", userID, models.MediaTypePhoto, true).
		Order("display_order ASC").Find(&photos)
	database.DB.Where("user_id = ? AND media_type = ? AND is_approved = ?", userID, models.MediaTypeVideo, true).
		Order("display_order ASC").Find(&videos)

	ctx := context.Background()
	expiresIn := 24 * time.Hour // URLs valid for 24 hours

	// Generate pre-signed URLs for photos
	photosWithURLs := make([]fiber.Map, len(photos))
	for i, photo := range photos {
		bucket := config.Cfg.S3BucketPhotos
		if photo.MediaType == models.MediaTypeVideo {
			bucket = config.Cfg.S3BucketVideos
		}

		downloadURL, err := database.GeneratePresignedDownloadURL(ctx, bucket, photo.URL, expiresIn)
		if err != nil {
			downloadURL = "" // Fallback if URL generation fails
		}

		photoData := fiber.Map{
			"id":              photo.ID,
			"media_type":      photo.MediaType,
			"url":             downloadURL,
			"thumbnail_url":   photo.ThumbnailURL,
			"duration_seconds": photo.DurationSeconds,
			"display_order":   photo.DisplayOrder,
			"created_at":      photo.CreatedAt,
		}

		// Add thumbnail URL if exists
		if photo.ThumbnailURL != "" {
			thumbURL, _ := database.GeneratePresignedDownloadURL(ctx, bucket, photo.ThumbnailURL, expiresIn)
			photoData["thumbnail_url"] = thumbURL
		}

		photosWithURLs[i] = photoData
	}

	// Generate pre-signed URLs for videos
	videosWithURLs := make([]fiber.Map, len(videos))
	for i, video := range videos {
		bucket := config.Cfg.S3BucketVideos

		downloadURL, err := database.GeneratePresignedDownloadURL(ctx, bucket, video.URL, expiresIn)
		if err != nil {
			downloadURL = "" // Fallback if URL generation fails
		}

		videoData := fiber.Map{
			"id":              video.ID,
			"media_type":      video.MediaType,
			"url":             downloadURL,
			"thumbnail_url":   video.ThumbnailURL,
			"duration_seconds": video.DurationSeconds,
			"display_order":   video.DisplayOrder,
			"created_at":      video.CreatedAt,
		}

		// Add thumbnail URL if exists
		if video.ThumbnailURL != "" {
			thumbURL, _ := database.GeneratePresignedDownloadURL(ctx, config.Cfg.S3BucketPhotos, video.ThumbnailURL, expiresIn)
			videoData["thumbnail_url"] = thumbURL
		}

		videosWithURLs[i] = videoData
	}

	return c.JSON(fiber.Map{
		"photos": photosWithURLs,
		"videos": videosWithURLs,
	})
}

// DeleteMedia deletes a media item
func DeleteMedia(c *fiber.Ctx) error {
	user := c.Locals("user").(*jwt.Token)
	claims := user.Claims.(jwt.MapClaims)
	userIDStr := claims["user_id"].(string)
	userID, _ := uuid.Parse(userIDStr)

	mediaID := c.Params("id")
	var media models.Media
	if err := database.DB.Where("id = ? AND user_id = ?", mediaID, userID).First(&media).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Media not found"})
	}

	if err := database.DB.Delete(&media).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Failed to delete media"})
	}

	return c.JSON(fiber.Map{"message": "Media deleted successfully"})
}

// GetPresignedUploadURL generates a pre-signed URL for direct R2/S3 upload
func GetPresignedUploadURL(c *fiber.Ctx) error {
	user := c.Locals("user").(*jwt.Token)
	claims := user.Claims.(jwt.MapClaims)
	userIDStr := claims["user_id"].(string)
	userID, _ := uuid.Parse(userIDStr)

	mediaType := c.Query("media_type", "photo")
	if mediaType != "photo" && mediaType != "video" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid media_type. Must be 'photo' or 'video'"})
	}

	// Determine bucket and file extension
	var bucket, ext string
	if mediaType == "photo" {
		bucket = config.Cfg.S3BucketPhotos
		ext = ".jpg"
	} else {
		bucket = config.Cfg.S3BucketVideos
		ext = ".mp4"
	}

	// Log S3 configuration
	fmt.Printf("📤 Generating upload URL - UserID: %s, MediaType: %s, Bucket: %s\n", userID, mediaType, bucket)
	fmt.Printf("📤 S3 Config - Endpoint: %s, Region: %s, UseSSL: %v\n", 
		config.Cfg.S3Endpoint, config.Cfg.S3Region, config.Cfg.S3UseSSL)

	// Check if S3 client is initialized
	if database.S3Client == nil {
		fmt.Printf("❌ S3Client is nil - S3 not connected!\n")
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "S3 storage not configured",
			"details": "S3Client is not initialized",
		})
	}

	// Generate unique file key: users/{user_id}/{media_type}/{uuid}.{ext}
	fileID := uuid.New()
	key := fmt.Sprintf("users/%s/%s/%s%s", userID.String(), mediaType, fileID.String(), ext)

	fmt.Printf("📤 Generated file key: %s\n", key)

	// Generate pre-signed URL (expires in 1 hour)
	ctx := context.Background()
	expiresIn := 1 * time.Hour
	uploadURL, err := database.GeneratePresignedUploadURL(ctx, bucket, key, expiresIn)
	if err != nil {
		fmt.Printf("❌ Failed to generate presigned URL: %v\n", err)
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Failed to generate upload URL",
			"details": err.Error(),
		})
	}

	fmt.Printf("✅ Generated upload URL successfully (length: %d)\n", len(uploadURL))

	return c.JSON(fiber.Map{
		"upload_url": uploadURL,
		"file_key":   key,
		"file_name":  fileID.String() + ext,
		"bucket":     bucket,
		"expires_in": int(expiresIn.Seconds()),
		"method":     "PUT",
		"headers": fiber.Map{
			"Content-Type": getContentType(ext),
		},
	})
}

// getContentType returns the appropriate Content-Type for file extension
func getContentType(ext string) string {
	switch ext {
	case ".jpg", ".jpeg":
		return "image/jpeg"
	case ".png":
		return "image/png"
	case ".mp4":
		return "video/mp4"
	case ".mov":
		return "video/quicktime"
	default:
		return "application/octet-stream"
	}
}

