package routes

import (
	"lomi-backend/config"
	"lomi-backend/internal/handlers"
	"lomi-backend/internal/middleware"

	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/websocket/v2"
)

func SetupRoutes(app *fiber.App) {
	api := app.Group("/api/v1")

	// Health Check
	api.Get("/health", func(c *fiber.Ctx) error {
		return c.JSON(fiber.Map{"status": "ok", "message": "Lomi Backend is running 🍋"})
	})

	// Test endpoints for debugging
	api.Get("/test", handlers.TestEndpoint)
	api.Post("/test", handlers.TestEndpoint)
	api.Get("/test/auth", handlers.TestAuthEndpoint)
	api.Post("/test/auth", handlers.TestAuthEndpoint)
	api.Get("/test/s3", handlers.TestS3Connection)
	api.Get("/test/jwt", handlers.TestGetJWT)  // Generate JWT for user by ID (testing only)
	api.Post("/test/jwt", handlers.TestGetJWT) // Generate JWT for user by ID (testing only)

	// Public routes
	authHandler := handlers.NewAuthHandler(config.Cfg)

	// Telegram Mini App login (initData method) - Auto-authenticates on app open
	api.Post("/auth/telegram", authHandler.TelegramLogin)
	api.Post("/auth/google", authHandler.GoogleLogin)

	api.Post("/auth/refresh", handlers.RefreshToken) // TODO: Implement

	// Protected routes (require authentication)
	protected := api.Group("", middleware.AuthMiddleware)

	// Test media upload (protected)
	protected.Get("/test/media-upload", handlers.TestMediaUpload)

	// User Profile
	protected.Get("/users/me", handlers.GetMe)
	protected.Put("/users/me", handlers.UpdateProfile)
	protected.Get("/users", handlers.GetAllUsers) // List all users (for testing)

	// Onboarding
	protected.Get("/onboarding/status", handlers.GetOnboardingStatus)
	protected.Patch("/onboarding/progress", handlers.UpdateOnboardingProgress)

	// Media
	protected.Post("/users/media", handlers.UploadMedia)
	protected.Post("/users/media/upload-complete", handlers.UploadComplete) // Batch upload completion
	protected.Get("/users/:user_id/media", handlers.GetUserMedia)
	protected.Delete("/users/media/:id", handlers.DeleteMedia)
	protected.Get("/users/media/upload-url", handlers.GetPresignedUploadURL)

	// Discovery & Swiping (with rate limiting)
	protected.Get("/discover/swipe", handlers.GetSwipeCards)
	protected.Post("/discover/swipe", middleware.SwipeRateLimit(), handlers.SwipeAction)
	protected.Get("/discover/feed", handlers.GetExploreFeed)

	// Matches
	protected.Get("/matches", handlers.GetMatches)
	protected.Get("/matches/:id", handlers.GetMatchDetails)
	protected.Delete("/matches/:id", handlers.Unmatch)

	// Chat (with rate limiting for messages)
	protected.Get("/chats", handlers.GetChats)
	protected.Get("/chats/:id/messages", handlers.GetMessages)
	protected.Post("/chats/:id/messages", middleware.MessageRateLimit(), handlers.SendMessage)
	protected.Put("/chats/:id/read", handlers.MarkMessagesAsRead)

	// Gifts
	protected.Get("/gifts", handlers.GetGifts)
	protected.Post("/gifts/send", handlers.SendGift)

	// Coins (with rate limiting for purchases)
	protected.Get("/coins/balance", handlers.GetCoinBalance)
	protected.Post("/coins/purchase", middleware.PurchaseRateLimit(), handlers.PurchaseCoins)
	protected.Post("/coins/purchase/confirm", handlers.ConfirmCoinPurchase) // Webhook endpoint
	protected.Get("/coins/transactions", handlers.GetCoinTransactions)

	// Payouts
	protected.Get("/payouts/balance", handlers.GetPayoutBalance)
	protected.Post("/payouts/request", handlers.RequestPayout)
	protected.Get("/payouts/history", handlers.GetPayoutHistory)

	// Verification
	protected.Post("/verification/submit", handlers.SubmitVerification)
	protected.Get("/verification/status", handlers.GetVerificationStatus)

	// Reports & Blocks
	protected.Post("/reports", handlers.ReportUser)
	protected.Post("/reports/photo", handlers.ReportPhoto)
	protected.Post("/blocks", handlers.BlockUser)
	protected.Delete("/blocks/:user_id", handlers.UnblockUser)
	protected.Get("/blocks", handlers.GetBlockedUsers)

	// Reward Channels
	protected.Get("/coins/earn/channels", handlers.GetRewardChannels)
	protected.Post("/coins/earn/claim", handlers.ClaimChannelReward)

	// Leaderboard
	protected.Get("/leaderboard/top-gifted", handlers.GetTopGiftedUsers)

	// Who Likes You (Likes Reveal)
	protected.Get("/likes/pending", handlers.GetPendingLikes)
	protected.Post("/likes/reveal", handlers.RevealLike)

	// Admin routes (should have admin middleware in production)
	admin := protected.Group("/admin")
	admin.Get("/reports/pending", handlers.GetPendingReports)
	admin.Put("/reports/:id/review", handlers.ReviewReport)
	admin.Get("/payouts/pending", handlers.GetPendingPayouts)
	admin.Put("/payouts/:id/process", handlers.ProcessPayout)

	// Photo Moderation Monitoring (Phase 3)
	admin.Get("/queue-stats", handlers.GetQueueStats)
	admin.Get("/moderation/dashboard", handlers.GetModerationDashboard)

	// WebSocket (handles auth internally)
	api.Get("/ws", websocket.New(handlers.HandleWebSocket))
}
