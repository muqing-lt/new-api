package common

import (
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
)

type verificationValue struct {
	code string
	time time.Time
}

const (
	EmailVerificationPurpose = "v"
	PasswordResetPurpose     = "r"
)

var verificationMutex sync.Mutex
var verificationMap map[string]verificationValue
var verificationOrder []string
var verificationMapMaxSize = 10
var VerificationValidMinutes = 10

func GenerateVerificationCode(length int) string {
	code := uuid.New().String()
	code = strings.Replace(code, "-", "", -1)
	if length == 0 {
		return code
	}
	return code[:length]
}

func RegisterVerificationCodeWithKey(key string, code string, purpose string) {
	verificationMutex.Lock()
	defer verificationMutex.Unlock()
	fullKey := purpose + key
	verificationMap[fullKey] = verificationValue{
		code: code,
		time: time.Now(),
	}
	removeKeyFromOrderLocked(fullKey)
	verificationOrder = append(verificationOrder, fullKey)
	removeExpiredPairs()
	enforceVerificationMapCapLocked()
}

func VerifyCodeWithKey(key string, code string, purpose string) bool {
	verificationMutex.Lock()
	defer verificationMutex.Unlock()
	value, okay := verificationMap[purpose+key]
	now := time.Now()
	if !okay || int(now.Sub(value.time).Seconds()) >= VerificationValidMinutes*60 {
		if okay {
			delete(verificationMap, purpose+key)
			removeKeyFromOrderLocked(purpose + key)
		}
		return false
	}
	return code == value.code
}

func DeleteKey(key string, purpose string) {
	verificationMutex.Lock()
	defer verificationMutex.Unlock()
	fullKey := purpose + key
	delete(verificationMap, fullKey)
	removeKeyFromOrderLocked(fullKey)
}

// no lock inside, so the caller must lock the verificationMap before calling!
func removeExpiredPairs() {
	now := time.Now()
	for key := range verificationMap {
		if int(now.Sub(verificationMap[key].time).Seconds()) >= VerificationValidMinutes*60 {
			delete(verificationMap, key)
			removeKeyFromOrderLocked(key)
		}
	}
}

// no lock inside, so the caller must lock the verificationMap before calling!
func removeKeyFromOrderLocked(target string) {
	for i := range verificationOrder {
		if verificationOrder[i] == target {
			verificationOrder = append(verificationOrder[:i], verificationOrder[i+1:]...)
			return
		}
	}
}

// no lock inside, so the caller must lock the verificationMap before calling!
func enforceVerificationMapCapLocked() {
	if verificationMapMaxSize <= 0 {
		return
	}
	for len(verificationMap) > verificationMapMaxSize {
		if len(verificationOrder) == 0 {
			// Fallback: remove oldest by timestamp when order metadata is unavailable.
			var oldestKey string
			var oldestTime time.Time
			for key, value := range verificationMap {
				if oldestKey == "" || value.time.Before(oldestTime) {
					oldestKey = key
					oldestTime = value.time
				}
			}
			if oldestKey == "" {
				return
			}
			delete(verificationMap, oldestKey)
			continue
		}
		oldestKey := verificationOrder[0]
		verificationOrder = verificationOrder[1:]
		delete(verificationMap, oldestKey)
	}
}

func init() {
	verificationMutex.Lock()
	defer verificationMutex.Unlock()
	verificationMap = make(map[string]verificationValue)
	verificationOrder = make([]string, 0, verificationMapMaxSize)
}
