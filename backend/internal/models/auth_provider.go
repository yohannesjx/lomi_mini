package models

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

type AuthProvider struct {
	ID         uuid.UUID      `gorm:"type:uuid;default:uuid_generate_v4();primaryKey"`
	UserID     uuid.UUID      `gorm:"type:uuid;not null;index"`
	User       User           `gorm:"constraint:OnDelete:CASCADE"`
	Provider   string         `gorm:"size:32;not null"`
	ProviderID string         `gorm:"size:255;not null"`
	Email      string         `gorm:"size:255"`
	LinkedAt   time.Time      `gorm:"type:timestamptz;default:now()"`
	CreatedAt  time.Time      `gorm:"type:timestamptz;default:now()"`
	UpdatedAt  time.Time      `gorm:"type:timestamptz;default:now()"`
	DeletedAt  gorm.DeletedAt `gorm:"index"`
}

func (ap *AuthProvider) BeforeCreate(tx *gorm.DB) (err error) {
	if ap.ID == uuid.Nil {
		ap.ID = uuid.New()
	}
	if ap.LinkedAt.IsZero() {
		ap.LinkedAt = time.Now()
	}
	return
}
