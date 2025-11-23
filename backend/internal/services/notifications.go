package services

import (
	"bytes"
	"encoding/json"
	"fmt"
	"log"
	"lomi-backend/internal/database"
	"lomi-backend/internal/models"
	"net/http"
	"time"

	"github.com/google/uuid"
)

// NotificationService handles push notifications
type NotificationService struct {
	TelegramBotToken  string
	OneSignalAppID    string
	OneSignalAPIKey   string
	FirebaseServerKey string
}

var NotificationSvc *NotificationService

func InitNotificationService(telegramBotToken, onesignalAppID, onesignalAPIKey, firebaseServerKey string) {
	NotificationSvc = &NotificationService{
		TelegramBotToken:  telegramBotToken,
		OneSignalAppID:    onesignalAppID,
		OneSignalAPIKey:   onesignalAPIKey,
		FirebaseServerKey: firebaseServerKey,
	}
}

// Notification types
type NotificationType string

const (
	NotificationTypeNewMatch     NotificationType = "new_match"
	NotificationTypeNewMessage   NotificationType = "new_message"
	NotificationTypeGiftReceived NotificationType = "gift_received"
	NotificationTypeSomeoneLiked NotificationType = "someone_liked"
)

// SendNotification sends a push notification
func (ns *NotificationService) SendNotification(userID uuid.UUID, notificationType NotificationType, title string, body string, data map[string]interface{}) error {
	var user models.User
	if err := database.DB.First(&user, "id = ?", userID).Error; err != nil {
		return fmt.Errorf("user not found: %v", err)
	}

	// Send Telegram Mini App silent push (if user is in Telegram)
	if user.TelegramID > 0 {
		if err := ns.sendTelegramPush(user.TelegramID, notificationType, title, body, data); err != nil {
			log.Printf("Failed to send Telegram push: %v", err)
		}
	}

	// Send OneSignal push (for standalone app)
	if ns.OneSignalAppID != "" && ns.OneSignalAPIKey != "" {
		if err := ns.sendOneSignalPush(userID, notificationType, title, body, data); err != nil {
			log.Printf("Failed to send OneSignal push: %v", err)
		}
	}

	// Send Firebase push (for standalone app)
	if ns.FirebaseServerKey != "" {
		if err := ns.sendFirebasePush(userID, notificationType, title, body, data); err != nil {
			log.Printf("Failed to send Firebase push: %v", err)
		}
	}

	return nil
}

// sendTelegramPush sends a silent push notification via Telegram Bot API
func (ns *NotificationService) sendTelegramPush(telegramID int64, notificationType NotificationType, title string, body string, data map[string]interface{}) error {
	// Telegram Mini App silent push using Bot API
	// This is a simplified version - in production, you'd use Telegram's actual push notification API
	payload := map[string]interface{}{
		"chat_id":    telegramID,
		"text":       fmt.Sprintf("%s\n%s", title, body),
		"parse_mode": "HTML",
	}

	payloadBytes, _ := json.Marshal(payload)
	url := fmt.Sprintf("https://api.telegram.org/bot%s/sendMessage", ns.TelegramBotToken)

	resp, err := http.Post(url, "application/json", bytes.NewBuffer(payloadBytes))
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	return nil
}

// sendOneSignalPush sends push notification via OneSignal
func (ns *NotificationService) sendOneSignalPush(userID uuid.UUID, notificationType NotificationType, title string, body string, data map[string]interface{}) error {
	payload := map[string]interface{}{
		"app_id":                    ns.OneSignalAppID,
		"include_external_user_ids": []string{userID.String()},
		"headings": map[string]string{
			"en": title,
		},
		"contents": map[string]string{
			"en": body,
		},
		"data":               data,
		"android_channel_id": "lomi_notifications",
	}

	payloadBytes, _ := json.Marshal(payload)
	url := "https://onesignal.com/api/v1/notifications"

	req, err := http.NewRequest("POST", url, bytes.NewBuffer(payloadBytes))
	if err != nil {
		return err
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", fmt.Sprintf("Basic %s", ns.OneSignalAPIKey))

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	return nil
}

// sendFirebasePush sends push notification via Firebase Cloud Messaging
func (ns *NotificationService) sendFirebasePush(userID uuid.UUID, notificationType NotificationType, title string, body string, data map[string]interface{}) error {
	// Get FCM token from user metadata (stored in preferences or separate table)
	var user models.User
	if err := database.DB.First(&user, "id = ?", userID).Error; err != nil {
		return err
	}

	// Extract FCM token from user preferences
	fcmToken, ok := user.Preferences["fcm_token"].(string)
	if !ok || fcmToken == "" {
		return fmt.Errorf("FCM token not found for user")
	}

	payload := map[string]interface{}{
		"to": fcmToken,
		"notification": map[string]string{
			"title": title,
			"body":  body,
		},
		"data":     data,
		"priority": "high",
	}

	payloadBytes, _ := json.Marshal(payload)
	url := "https://fcm.googleapis.com/fcm/send"

	req, err := http.NewRequest("POST", url, bytes.NewBuffer(payloadBytes))
	if err != nil {
		return err
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", fmt.Sprintf("key=%s", ns.FirebaseServerKey))

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	return nil
}

// NotifyNewMatch sends notification when a new match is created
func (ns *NotificationService) NotifyNewMatch(match models.Match, matchedUser models.User) error {
	// Notify both users
	for _, userID := range []uuid.UUID{match.User1ID, match.User2ID} {
		if userID == match.InitiatedBy {
			continue // Don't notify the initiator
		}

		title := "It's a Match! 💚"
		body := fmt.Sprintf("You and %s liked each other!", matchedUser.Name)
		data := map[string]interface{}{
			"type":     string(NotificationTypeNewMatch),
			"match_id": match.ID.String(),
			"user_id":  matchedUser.ID.String(),
		}

		if err := ns.SendNotification(userID, NotificationTypeNewMatch, title, body, data); err != nil {
			log.Printf("Failed to send new match notification: %v", err)
		}
	}

	return nil
}

// NotifyNewMessage sends notification for a new message
func (ns *NotificationService) NotifyNewMessage(message models.Message, sender models.User) error {
	title := fmt.Sprintf("New message from %s", sender.Name)
	body := ""
	if message.MessageType == models.MessageTypeText {
		body = message.Content
		if len(body) > 100 {
			body = body[:100] + "..."
		}
	} else if message.MessageType == models.MessageTypeGift {
		body = "Sent you a gift 🎁"
	} else if message.MessageType == models.MessageTypePhoto {
		body = "📷 Photo"
	} else if message.MessageType == models.MessageTypeVideo {
		body = "🎥 Video"
	} else {
		body = "New message"
	}

	data := map[string]interface{}{
		"type":       string(NotificationTypeNewMessage),
		"match_id":   message.MatchID.String(),
		"message_id": message.ID.String(),
		"sender_id":  sender.ID.String(),
	}

	return ns.SendNotification(message.ReceiverID, NotificationTypeNewMessage, title, body, data)
}

// NotifyGiftReceived sends notification when a gift is received
func (ns *NotificationService) NotifyGiftReceived(giftTransaction models.GiftTransaction, sender models.User) error {
	title := "You received a gift! 🎁"
	body := fmt.Sprintf("%s sent you a gift", sender.Name)
	data := map[string]interface{}{
		"type":                string(NotificationTypeGiftReceived),
		"gift_transaction_id": giftTransaction.ID.String(),
		"sender_id":           sender.ID.String(),
		"gift_id":             giftTransaction.GiftID.String(),
	}

	return ns.SendNotification(giftTransaction.ReceiverID, NotificationTypeGiftReceived, title, body, data)
}

// NotifySomeoneLiked sends notification when someone likes you (but no match yet)
func (ns *NotificationService) NotifySomeoneLiked(liker models.User, likedUserID uuid.UUID) error {
	title := "Someone liked you! 👀"
	body := "Check out who's interested in you"
	data := map[string]interface{}{
		"type":     string(NotificationTypeSomeoneLiked),
		"liker_id": liker.ID.String(),
	}

	return ns.SendNotification(likedUserID, NotificationTypeSomeoneLiked, title, body, data)
}

// NotifySomeoneViewedProfile sends notification when someone spends coins to reveal your profile
func (ns *NotificationService) NotifySomeoneViewedProfile(viewedUserID uuid.UUID, viewerID uuid.UUID) error {
	var viewer models.User
	if err := database.DB.First(&viewer, "id = ?", viewerID).Error; err != nil {
		return err
	}

	title := "Someone just spent coins to see you 👀"
	body := fmt.Sprintf("%s is interested in you!", viewer.Name)
	data := map[string]interface{}{
		"type":      "profile_viewed",
		"viewer_id": viewerID.String(),
	}

	return ns.SendNotification(viewedUserID, NotificationTypeSomeoneLiked, title, body, data)
}

// SendTelegramMessage sends a simple text message via Telegram Bot API
func (ns *NotificationService) SendTelegramMessage(telegramID int64, message string) error {
	if ns.TelegramBotToken == "" {
		return fmt.Errorf("Telegram bot token not configured")
	}

	payload := map[string]interface{}{
		"chat_id": telegramID,
		"text":    message,
	}

	payloadBytes, _ := json.Marshal(payload)
	url := fmt.Sprintf("https://api.telegram.org/bot%s/sendMessage", ns.TelegramBotToken)

	resp, err := http.Post(url, "application/json", bytes.NewBuffer(payloadBytes))
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("Telegram API returned status %d", resp.StatusCode)
	}

	return nil
}

// GetNotificationService returns the global notification service instance
func GetNotificationService() *NotificationService {
	return NotificationSvc
}
