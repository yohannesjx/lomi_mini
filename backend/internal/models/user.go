package models

import (
	"database/sql/driver"
	"encoding/json"
	"errors"
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// Enums
type Gender string
type RelationshipGoal string
type Religion string
type VerificationStatus string

const (
	GenderMale   Gender = "male"
	GenderFemale Gender = "female"
	GenderOther  Gender = "other"

	GoalFriends RelationshipGoal = "friends"
	GoalDating  RelationshipGoal = "dating"
	GoalSerious RelationshipGoal = "serious"

	ReligionOrthodox   Religion = "orthodox"
	ReligionMuslim     Religion = "muslim"
	ReligionProtestant Religion = "protestant"
	ReligionCatholic   Religion = "catholic"
	ReligionOther      Religion = "other"
	ReligionNone       Religion = "none"

	VerificationPending  VerificationStatus = "pending"
	VerificationApproved VerificationStatus = "approved"
	VerificationRejected VerificationStatus = "rejected"
)

// JSONB Types for GORM
type JSONStringArray []string

func (a *JSONStringArray) Scan(value interface{}) error {
	bytes, ok := value.([]byte)
	if !ok {
		return errors.New("type assertion to []byte failed")
	}
	return json.Unmarshal(bytes, a)
}

func (a JSONStringArray) Value() (driver.Value, error) {
	return json.Marshal(a)
}

type JSONMap map[string]interface{}

func (m *JSONMap) Scan(value interface{}) error {
	bytes, ok := value.([]byte)
	if !ok {
		return errors.New("type assertion to []byte failed")
	}
	return json.Unmarshal(bytes, m)
}

func (m JSONMap) Value() (driver.Value, error) {
	return json.Marshal(m)
}

// User Model
type User struct {
	ID uuid.UUID `gorm:"type:uuid;default:uuid_generate_v4();primaryKey"`

	// Telegram Integration
	TelegramID        int64  `gorm:"uniqueIndex;not null"`
	TelegramUsername  string `gorm:"size:255"`
	TelegramFirstName string `gorm:"size:255"`
	TelegramLastName  string `gorm:"size:255"`

	// Profile Information
	Name             string           `gorm:"size:255;not null"`
	Age              int              `gorm:"not null"`
	Gender           Gender           `gorm:"type:gender_type;not null"`
	City             string           `gorm:"size:255;not null"`
	Bio              string           `gorm:"type:text"`
	RelationshipGoal RelationshipGoal `gorm:"type:relationship_goal;default:'dating'"`
	Religion         Religion         `gorm:"type:religion_type"`

	// JSON Fields
	Languages JSONStringArray `gorm:"type:jsonb;default:'[]'"`
	Interests JSONStringArray `gorm:"type:jsonb;default:'[]'"`

	// Location
	Latitude  float64 `gorm:"type:decimal(10,8)"`
	Longitude float64 `gorm:"type:decimal(11,8)"`

	// Verification
	IsVerified         bool               `gorm:"default:false"`
	VerificationStatus VerificationStatus `gorm:"type:verification_status"`

	// Settings
	IsActive         bool      `gorm:"default:true;index"`
	IsOnline         bool      `gorm:"default:false"`
	LastSeenAt       time.Time `gorm:"type:timestamptz"`
	ShowOnlineStatus bool      `gorm:"default:true"`

	// Preferences
	Preferences JSONMap `gorm:"type:jsonb;default:'{}'"`

	// Economy
	CoinBalance int     `gorm:"default:0;check:coin_balance >= 0"`
	GiftBalance float64 `gorm:"type:decimal(10,2);default:0.00;check:gift_balance >= 0"`

	// Daily Free Reveal (for "Who Likes You" feature)
	DailyFreeRevealUsed bool      `gorm:"default:false"`
	LastRevealDate      time.Time `gorm:"type:date"`

	// Onboarding Progress
	// 0 = fresh (just logged in)
	// 1 = age & gender done
	// 2 = city done
	// 3 = looking for + goal done
	// 4 = religion done
	// 5 = photos uploaded (at least 3)
	// 6 = video recorded (optional)
	// 7 = bio & interests done
	// 8 = completed
	OnboardingStep      int  `gorm:"default:0;check:onboarding_step >= 0 AND onboarding_step <= 8"`
	OnboardingCompleted bool `gorm:"default:false;index"`

	// Tutorial & First-Time Experience
	HasSeenSwipeTutorial bool `gorm:"default:false;index"` // Column added via migration 003

	// Timestamps
	CreatedAt time.Time      `gorm:"type:timestamptz;default:now()"`
	UpdatedAt time.Time      `gorm:"type:timestamptz;default:now()"`
	DeletedAt gorm.DeletedAt `gorm:"index"`
}

// BeforeCreate hook to generate UUID if not present
func (u *User) BeforeCreate(tx *gorm.DB) (err error) {
	if u.ID == uuid.Nil {
		u.ID = uuid.New()
	}
	return
}
