package main

import (
	"log"
	"lomi-backend/config"
	"lomi-backend/internal/database"
	"lomi-backend/internal/routes"
	"lomi-backend/internal/services"

	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/cors"
	"github.com/gofiber/fiber/v2/middleware/logger"
	"github.com/gofiber/fiber/v2/middleware/recover"
)

func main() {
	// 1. Load Configuration
	cfg := config.LoadConfig()

	// 2. Connect to Database
	database.ConnectDB(cfg)

	// 3. Connect to Redis
	database.ConnectRedis(cfg)

	// 4. Connect to S3/R2
	database.ConnectS3(cfg)

	// 5. Initialize Notification Service
	services.InitNotificationService(
		cfg.TelegramBotToken,
		cfg.OneSignalAppID,
		cfg.OneSignalAPIKey,
		cfg.FirebaseServerKey,
	)

	// 5. Initialize Fiber App
	app := fiber.New(fiber.Config{
		AppName:      cfg.AppName,
		ServerHeader: "Lomi-Social",
		Prefork:      false, // Set to true for production if needed
	})

	// 6. Middleware
	app.Use(logger.New())  // Request logging
	app.Use(recover.New()) // Panic recovery
	app.Use(cors.New(cors.Config{
		AllowOrigins: "*", // Allow all for dev, restrict in prod
		AllowHeaders: "Origin, Content-Type, Accept, Authorization",
		AllowMethods: "GET, POST, HEAD, PUT, DELETE, PATCH",
	}))

	// 7. Routes
	routes.SetupRoutes(app)

	// 8. Start Moderation Subscriber (in background)
	go func() {
		services.StartModerationSubscriber()
	}()

	// 9. Start Server
	log.Printf("🚀 Server starting on port %s", cfg.AppPort)
	if err := app.Listen(":" + cfg.AppPort); err != nil {
		log.Fatal("Server failed to start: ", err)
	}
}

func setupRoutes(app *fiber.App) {
	api := app.Group("/api/v1")

	// Health Check
	api.Get("/health", func(c *fiber.Ctx) error {
		return c.JSON(fiber.Map{
			"status":  "ok",
			"message": "Lomi Social API is running 💚",
		})
	})
}
