package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	_ "github.com/mattn/go-sqlite3"
	"github.com/mdp/qrterminal"

	"go.mau.fi/whatsmeow"
	"go.mau.fi/whatsmeow/store"
	"go.mau.fi/whatsmeow/store/sqlstore"
	"go.mau.fi/whatsmeow/types"
	waLog "go.mau.fi/whatsmeow/util/log"
)

// TenantConfig is persisted to store/tenants/<hash>/config.json.
type TenantConfig struct {
	OwnerPhone string   `json:"ownerPhone"`
	Recipients []string `json:"recipients"`
	AIApiKey   string   `json:"aiApiKey"`
	AIModel    string   `json:"aiModel"`
}

// Tenant is a single linked WhatsApp account (one per setup hash).
type Tenant struct {
	Hash         string
	mu           sync.Mutex
	client       *whatsmeow.Client
	messageStore *MessageStore
	container    *sqlstore.Container
	logger       waLog.Logger
	ownerPhone   string
	recipients   []string
	aiApiKey     string
	aiModel      string

	qrCode                  string
	qrUpdated               time.Time
	paired                  bool
	pairing                 bool
	activePollsByRecipient  map[string]string    // map[recipientNormalizedPhone]pollMsgID
	lastPollTimeByRecipient map[string]time.Time // map[recipientNormalizedPhone]lastPollSentTime

	// Takeover Grant State
	grantKind      string    // "none" | "count" | "duration"
	grantRemaining int       // count remaining
	grantExpiresAt time.Time // expiry for duration grant
	lastTargetJID  types.JID // target contact to reply to
	grantTargetJID types.JID // explicitly granted target chat for take-over

	apiSentMu     sync.Mutex
	apiSentMsgIDs map[string]time.Time
}

func (t *Tenant) recordApiSent(id string) {
	if id == "" {
		return
	}
	t.apiSentMu.Lock()
	defer t.apiSentMu.Unlock()
	if t.apiSentMsgIDs == nil {
		t.apiSentMsgIDs = make(map[string]time.Time)
	}
	t.apiSentMsgIDs[id] = time.Now()
	cutoff := time.Now().Add(-10 * time.Minute)
	for k, ts := range t.apiSentMsgIDs {
		if ts.Before(cutoff) {
			delete(t.apiSentMsgIDs, k)
		}
	}
}

func (t *Tenant) isApiSent(id string) bool {
	if id == "" {
		return false
	}
	t.apiSentMu.Lock()
	defer t.apiSentMu.Unlock()
	if t.apiSentMsgIDs == nil {
		return false
	}
	_, ok := t.apiSentMsgIDs[id]
	return ok
}

// TenantManager holds all provisioned tenants keyed by setup hash.
type TenantManager struct {
	mu      sync.Mutex
	tenants map[string]*Tenant
	logger  waLog.Logger
}

func NewTenantManager(logger waLog.Logger) *TenantManager {
	m := &TenantManager{
		tenants: make(map[string]*Tenant),
		logger:  logger,
	}
	m.restoreTenants()
	return m
}

func (m *TenantManager) Get(hash string) *Tenant {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.tenants[hash]
}

func (m *TenantManager) Add(t *Tenant) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.tenants[t.Hash] = t
}

func (m *TenantManager) restoreTenants() {
	tenantsDir := filepath.Join("store", "tenants")
	entries, err := os.ReadDir(tenantsDir)
	if err != nil {
		return
	}
	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}
		hash := entry.Name()
		dir := filepath.Join(tenantsDir, hash)
		dbPath := filepath.Join(dir, "whatsapp.db")
		if _, err := os.Stat(dbPath); os.IsNotExist(err) {
			continue
		}

		t := &Tenant{
			Hash:   hash,
			logger: waLog.Stdout(fmt.Sprintf("Tenant-%s", hash), "INFO", true),
		}
		t.loadConfig()

		dbLog := waLog.Stdout(fmt.Sprintf("Tenant-%s/DB", hash), "INFO", true)
		container, err := sqlstore.New(context.Background(), "sqlite3", "file:"+dbPath+"?_foreign_keys=on&_journal_mode=WAL&_busy_timeout=5000", dbLog)
		if err != nil {
			continue
		}
		deviceStore, err := container.GetFirstDevice(context.Background())
		if err != nil || deviceStore == nil || deviceStore.ID == nil {
			_ = container.Close()
			continue
		}

		t.container = container
		t.client = whatsmeow.NewClient(deviceStore, t.logger)
		ms, _ := NewMessageStore(filepath.Join(dir, "messages.db"))
		t.messageStore = ms

		t.setupEventHandler()

		if err := t.client.Connect(); err != nil {
			m.logger.Warnf("Failed to connect restored tenant %s: %v", hash, err)
		} else {
			t.paired = true
			m.Add(t)
			m.logger.Infof("Auto-restored and connected tenant %s (owner=%s)", hash, t.ownerPhone)
		}
	}
}

// dir returns the per-tenant data directory (e.g. store/tenants/<hash>).
func (t *Tenant) dir() string {
	return filepath.Join("store", "tenants", t.Hash)
}

func (t *Tenant) configFile() string {
	return filepath.Join(t.dir(), "config.json")
}

func (t *Tenant) saveConfig() {
	cfg := TenantConfig{
		OwnerPhone: t.ownerPhone,
		Recipients: t.recipients,
		AIApiKey:   t.aiApiKey,
		AIModel:    t.aiModel,
	}
	if data, err := json.MarshalIndent(cfg, "", "  "); err == nil {
		_ = os.WriteFile(t.configFile(), data, 0644)
	}
}

func (t *Tenant) loadConfig() {
	data, err := os.ReadFile(t.configFile())
	if err != nil {
		return
	}
	var cfg TenantConfig
	if err := json.Unmarshal(data, &cfg); err == nil {
		t.ownerPhone = cfg.OwnerPhone
		t.recipients = cfg.Recipients
		t.aiApiKey = cfg.AIApiKey
		t.aiModel = cfg.AIModel
	}
}

func normalizePhone(phone string) string {
	var out strings.Builder
	for _, r := range phone {
		if r >= '0' && r <= '9' {
			out.WriteRune(r)
		}
	}
	return out.String()
}

// provision creates (or reloads) the whatsmeow client for this tenant and starts pairing.
func (t *Tenant) provision() (string, error) {
	t.mu.Lock()
	defer t.mu.Unlock()

	if t.paired {
		return "", nil
	}
	if t.pairing {
		return t.qrCode, nil
	}

	dir := t.dir()
	if err := os.MkdirAll(dir, 0755); err != nil {
		return "", fmt.Errorf("failed to create tenant dir: %v", err)
	}
	t.saveConfig()

	dbLog := waLog.Stdout(fmt.Sprintf("Tenant-%s/DB", t.Hash), "INFO", true)
	container, err := sqlstore.New(context.Background(), "sqlite3", "file:"+filepath.Join(dir, "whatsapp.db")+"?_foreign_keys=on&_journal_mode=WAL&_busy_timeout=5000", dbLog)
	if err != nil {
		return "", fmt.Errorf("failed to open device store: %v", err)
	}
	t.container = container

	var deviceStore *store.Device
	if t.client == nil {
		deviceStore, err = container.GetFirstDevice(context.Background())
		if err == sql.ErrNoRows || (deviceStore != nil && deviceStore.ID == nil) {
			deviceStore = container.NewDevice()
		} else if err != nil {
			return "", fmt.Errorf("failed to get device: %v", err)
		}
		t.client = whatsmeow.NewClient(deviceStore, t.logger)
	}

	ms, err := NewMessageStore(filepath.Join(dir, "messages.db"))
	if err != nil {
		return "", fmt.Errorf("failed to init message store: %v", err)
	}
	t.messageStore = ms

	t.setupEventHandler()

	if t.client.Store.ID != nil {
		if err := t.client.Connect(); err != nil {
			return "", fmt.Errorf("failed to connect: %v", err)
		}
		t.paired = true
		return "", nil
	}

	t.pairing = true
	go t.pairLoop()
	return t.qrCode, nil
}

func (t *Tenant) pairLoop() {
	for {
		t.mu.Lock()
		if t.paired || !t.pairing {
			t.mu.Unlock()
			return
		}
		t.mu.Unlock()

		qrChan, err := t.client.GetQRChannel(context.Background())
		if err != nil {
			t.logger.Errorf("Failed to get QR channel: %v", err)
			time.Sleep(2 * time.Second)
			continue
		}
		if err := t.client.Connect(); err != nil {
			t.logger.Errorf("Failed to connect for QR channel: %v", err)
			time.Sleep(2 * time.Second)
			continue
		}

		paired := false
		for evt := range qrChan {
			switch evt.Event {
			case whatsmeow.QRChannelEventCode:
				t.mu.Lock()
				t.qrCode = evt.Code
				t.qrUpdated = time.Now()
				t.mu.Unlock()
				fmt.Printf("\nScan this QR code to link tenant %s:\n", t.Hash)
				qrterminal.GenerateHalfBlock(evt.Code, qrterminal.L, os.Stdout)
			case whatsmeow.QRChannelSuccess.Event:
				t.mu.Lock()
				t.paired = true
				t.pairing = false
				t.qrCode = ""
				t.mu.Unlock()
				t.logger.Infof("Tenant %s paired successfully", t.Hash)
				paired = true
				return
			case whatsmeow.QRChannelTimeout.Event:
				t.logger.Infof("Tenant %s QR code expired, requesting a new one...", t.Hash)
			case whatsmeow.QRChannelEventError:
				t.logger.Errorf("Tenant %s pairing error: %v", t.Hash, evt.Error)
			}
		}

		if !paired {
			t.client.Disconnect()
			time.Sleep(1 * time.Second)
		}
	}
}

func (t *Tenant) disconnect() {
	t.mu.Lock()
	defer t.mu.Unlock()
	if t.client != nil {
		if t.client.IsConnected() {
			t.logger.Infof("Disconnecting tenant %s...", t.Hash)
		}
		t.client.Disconnect()
	}
}

func (t *Tenant) status() map[string]interface{} {
	t.mu.Lock()
	defer t.mu.Unlock()
	return map[string]interface{}{
		"hash":              t.Hash,
		"linked":            t.paired,
		"pairing":           t.pairing,
		"connected":         t.client != nil && t.client.IsConnected(),
		"hasQR":             t.qrCode != "",
		"qrAge":             int(time.Since(t.qrUpdated).Seconds()),
		"ownerPhone":        t.ownerPhone,
		"allowedRecipients": t.recipients,
		"aiModel":           t.aiModel,
		"aiApiKeySet":       t.aiApiKey != "",
	}
}

func (t *Tenant) sendToRecipient(recipient, message string) (bool, string, string) {
	if t.client == nil {
		return false, "tenant not connected", ""
	}
	if !t.client.IsConnected() {
		if t.client.Store != nil && t.client.Store.ID != nil {
			t.logger.Infof("Tenant %s is paired but disconnected. Reconnecting before send...", t.Hash)
			if err := t.client.Connect(); err == nil {
				time.Sleep(600 * time.Millisecond)
			}
		}
		if !t.client.IsConnected() {
			return false, "tenant not connected", ""
		}
	}
	ok, status, msgID := sendWhatsAppMessage(t.client, t.messageStore, recipient, message, "", t.logger)
	if ok && msgID != "" {
		t.recordApiSent(msgID)
	}
	return ok, status, msgID
}

func (t *Tenant) sendPollToRecipient(recipient, question string, options []string, selectableCount int) (bool, string, string) {
	if t.client == nil {
		return false, "tenant not connected", ""
	}
	if !t.client.IsConnected() {
		if t.client.Store != nil && t.client.Store.ID != nil {
			t.logger.Infof("Tenant %s is paired but disconnected. Reconnecting before send poll...", t.Hash)
			if err := t.client.Connect(); err == nil {
				time.Sleep(600 * time.Millisecond)
			}
		}
		if !t.client.IsConnected() {
			return false, "tenant not connected", ""
		}
	}
	return sendWhatsAppPoll(t.client, recipient, question, options, selectableCount)
}
