package database

import (
	"context"
	"fmt"
	"log"
	"lomi-backend/config"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	awsconfig "github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/s3"
)

var S3Client *s3.Client

// ConnectS3 initializes the S3-compatible client (Cloudflare R2 or MinIO)
func ConnectS3(cfg *config.Config) {
	ctx := context.Background()

	// Create custom resolver for R2/MinIO endpoint
	customResolver := aws.EndpointResolverWithOptionsFunc(func(service, region string, options ...interface{}) (aws.Endpoint, error) {
		return aws.Endpoint{
			URL:           getEndpointURL(cfg.S3Endpoint, cfg.S3UseSSL),
			SigningRegion: cfg.S3Region,
		}, nil
	})

	// Load AWS config with custom endpoint resolver
	awsCfg, err := awsconfig.LoadDefaultConfig(ctx,
		awsconfig.WithEndpointResolverWithOptions(customResolver),
		awsconfig.WithCredentialsProvider(credentials.NewStaticCredentialsProvider(
			cfg.S3AccessKey,
			cfg.S3SecretKey,
			"",
		)),
		awsconfig.WithRegion(cfg.S3Region),
	)
	if err != nil {
		log.Fatal("Failed to load AWS config: ", err)
	}

	// Create S3 client
	S3Client = s3.NewFromConfig(awsCfg, func(o *s3.Options) {
		// Use path-style addressing for R2 and MinIO (required for custom endpoints)
		o.UsePathStyle = true
	})

	// Log connection details (without sensitive data)
	endpointURL := getEndpointURL(cfg.S3Endpoint, cfg.S3UseSSL)
	log.Printf("✅ Connected to S3-compatible storage (R2/MinIO)")
	log.Printf("   Endpoint: %s", endpointURL)
	log.Printf("   Region: %s", cfg.S3Region)
	log.Printf("   Buckets - Photos: %s, Videos: %s, Gifts: %s, Verifications: %s",
		cfg.S3BucketPhotos, cfg.S3BucketVideos, cfg.S3BucketGifts, cfg.S3BucketVerify)
	
	// Test connection by trying to list buckets (non-blocking, just for verification)
	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		
		// Try to list buckets to verify connection
		_, err := S3Client.ListBuckets(ctx, &s3.ListBucketsInput{})
		if err != nil {
			log.Printf("⚠️  S3 connection test failed: %v", err)
			log.Printf("   This might be normal if buckets don't exist yet or permissions are restricted")
		} else {
			log.Printf("✅ S3 connection verified successfully")
		}
	}()
}

// getEndpointURL constructs the full endpoint URL
func getEndpointURL(endpoint string, useSSL bool) string {
	scheme := "http"
	if useSSL {
		scheme = "https"
	}

	// If endpoint already includes scheme, return as is
	if len(endpoint) > 7 && (endpoint[:7] == "http://" || endpoint[:8] == "https://") {
		return endpoint
	}

	return fmt.Sprintf("%s://%s", scheme, endpoint)
}

// GeneratePresignedUploadURL generates a pre-signed URL for uploading to R2/S3
func GeneratePresignedUploadURL(ctx context.Context, bucket, key string, expiresIn time.Duration) (string, error) {
	if S3Client == nil {
		return "", fmt.Errorf("S3Client is not initialized")
	}

	log.Printf("🔗 Generating presigned URL - Bucket: %s, Key: %s, ExpiresIn: %v", bucket, key, expiresIn)
	
	presignClient := s3.NewPresignClient(S3Client)

	request, err := presignClient.PresignPutObject(ctx, &s3.PutObjectInput{
		Bucket: aws.String(bucket),
		Key:    aws.String(key),
	}, func(opts *s3.PresignOptions) {
		opts.Expires = expiresIn
	})
	if err != nil {
		log.Printf("❌ Failed to generate presigned URL: %v", err)
		return "", fmt.Errorf("failed to generate presigned upload URL: %w", err)
	}

	log.Printf("✅ Presigned URL generated successfully (URL length: %d)", len(request.URL))
	return request.URL, nil
}

// GeneratePresignedDownloadURL generates a pre-signed URL for downloading from R2/S3
func GeneratePresignedDownloadURL(ctx context.Context, bucket, key string, expiresIn time.Duration) (string, error) {
	presignClient := s3.NewPresignClient(S3Client)

	request, err := presignClient.PresignGetObject(ctx, &s3.GetObjectInput{
		Bucket: aws.String(bucket),
		Key:    aws.String(key),
	}, func(opts *s3.PresignOptions) {
		opts.Expires = expiresIn
	})
	if err != nil {
		return "", fmt.Errorf("failed to generate presigned download URL: %w", err)
	}

	return request.URL, nil
}

