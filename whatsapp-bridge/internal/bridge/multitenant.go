package bridge

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
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

	qrCode                        string
	qrUpdated                     time.Time
	paired                        bool
	pairing                       bool
	activePollsByRecipient        map[string]string    // map[recipientNormalizedPhone]pollMsgID
	lastPollTimeByRecipient       map[string]time.Time // map[recipientNormalizedPhone]lastPollSentTime
	lastActivityTimeByRecipient   map[string]time.Time // map[recipientKey]lastMessageTimestamp (incoming or manual)
	lastManualTextTimeByRecipient map[string]time.Time // map[recipientKey]lastOwnerManualTextTime
	sessionStartedAtByRecipient   map[string]time.Time // map[recipientKey]sessionStartTime

	// Health & Connectivity Metrics
	connectedAt       time.Time
	disconnectedAt    time.Time
	lastError         string
	reconnectAttempts int
	isReconnecting    bool

	// Takeover Grant State
	grantKind      string    // "none" | "count" | "duration"
	grantRemaining int       // count remaining
	grantExpiresAt time.Time // expiry for duration grant
	grantArmedAt   time.Time // timestamp when grant was armed
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
	mu        sync.Mutex
	tenants   map[string]*Tenant
	logger    waLog.Logger
	startedAt time.Time
}

func NewTenantManager(logger waLog.Logger) *TenantManager {
	m := &TenantManager{
		tenants:   make(map[string]*Tenant),
		logger:    logger,
		startedAt: time.Now(),
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

func (m *TenantManager) List() []map[string]interface{} {
	m.mu.Lock()
	defer m.mu.Unlock()
	list := make([]map[string]interface{}, 0, len(m.tenants))
	for _, t := range m.tenants {
		list = append(list, t.status())
	}
	return list
}

func (m *TenantManager) Reconnect(hash string) error {
	tenant := m.Get(hash)
	if tenant == nil {
		return fmt.Errorf("tenant %s not found", hash)
	}
	return tenant.reconnect()
}

func (m *TenantManager) Disconnect(hash string) error {
	tenant := m.Get(hash)
	if tenant == nil {
		return fmt.Errorf("tenant %s not found", hash)
	}
	tenant.disconnect()
	return nil
}

func (m *TenantManager) Remove(hash string) error {
	m.mu.Lock()
	tenant := m.tenants[hash]
	delete(m.tenants, hash)
	m.mu.Unlock()

	if tenant != nil {
		tenant.close()
		dir := tenant.dir()
		_ = os.RemoveAll(dir)
		m.logger.Infof("Removed and wiped tenant %s", hash)
		return nil
	}
	return fmt.Errorf("tenant %s not found", hash)
}

// StartSupervisor runs a background watchdog to monitor all tenants and auto-reconnect dropped sessions.
func (m *TenantManager) StartSupervisor(ctx context.Context) {
	go func() {
		ticker := time.NewTicker(15 * time.Second)
		defer ticker.Stop()

		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				m.checkAndReconnectTenants()
			}
		}
	}()
	m.logger.Infof("Multi-tenant background watchdog supervisor started (poll interval: 15s)")
}

func (t *Tenant) initMapsLocked() {
	if t.activePollsByRecipient == nil {
		t.activePollsByRecipient = make(map[string]string)
	}
	if t.lastPollTimeByRecipient == nil {
		t.lastPollTimeByRecipient = make(map[string]time.Time)
	}
	if t.lastActivityTimeByRecipient == nil {
		t.lastActivityTimeByRecipient = make(map[string]time.Time)
	}
	if t.lastManualTextTimeByRecipient == nil {
		t.lastManualTextTimeByRecipient = make(map[string]time.Time)
	}
	if t.sessionStartedAtByRecipient == nil {
		t.sessionStartedAtByRecipient = make(map[string]time.Time)
	}
}

// expireInactiveSessions sweeps active conversation sessions where the owner has participated manually.
// If an active session goes silent for >= timeout (default 5m), it revokes any pending poll and resets AI grants.
// Unreplied polls (where the owner never messaged back) are intentionally preserved and not expired.
func (t *Tenant) expireInactiveSessions(timeout time.Duration) {
	t.mu.Lock()
	t.initMapsLocked()

	now := time.Now()
	var pollsToExpire []string

	for rk, pollID := range t.activePollsByRecipient {
		sessionStart := t.sessionStartedAtByRecipient[rk]
		lastManual := t.lastManualTextTimeByRecipient[rk]
		lastActivity := t.lastActivityTimeByRecipient[rk]

		// An active manual conversation occurs when the owner has sent a manual message during or after the session began
		hasOwnerParticipated := !lastManual.IsZero() && (lastManual.After(sessionStart) || lastManual.Equal(sessionStart))

		if hasOwnerParticipated && !lastActivity.IsZero() && now.Sub(lastActivity) >= timeout {
			pollsToExpire = append(pollsToExpire, pollID)
			delete(t.activePollsByRecipient, rk)
			delete(t.lastPollTimeByRecipient, rk)
			delete(t.sessionStartedAtByRecipient, rk)
			delete(t.lastManualTextTimeByRecipient, rk)
			delete(t.lastActivityTimeByRecipient, rk)
			t.logger.Infof("Conversation session with %s timed out (> %v of silence after manual text) -> deleted poll %s", rk, timeout, pollID)
		}
	}

	// Check if an armed takeover grant timed out due to inactivity
	if t.grantKind != "none" && !t.grantArmedAt.IsZero() {
		if now.Sub(t.grantArmedAt) >= timeout {
			t.logger.Infof("Takeover grant (%s) for %s timed out (> %v inactivity after being armed) -> revoked", t.grantKind, t.Hash, timeout)
			t.grantKind = "none"
			t.grantRemaining = 0
			t.grantTargetJID = types.EmptyJID
			t.grantExpiresAt = time.Time{}
			t.grantArmedAt = time.Time{}
		}
	}

	t.mu.Unlock()

	for _, pid := range pollsToExpire {
		_ = deleteWhatsAppMessage(t.client, t.ownerPhone, pid)
		go func(pID string) {
			expireURL := fmt.Sprintf("%s/api/polls/%s/expire?hash=%s", getWebhookBaseURL(), pID, t.Hash)
			req, _ := http.NewRequest(http.MethodPost, expireURL, nil)
			if resp, err := http.DefaultClient.Do(req); err == nil && resp != nil {
				_ = resp.Body.Close()
			}
		}(pid)
	}
}

func (m *TenantManager) checkAndReconnectTenants() {
	m.mu.Lock()
	tenants := make([]*Tenant, 0, len(m.tenants))
	for _, t := range m.tenants {
		tenants = append(tenants, t)
	}
	m.mu.Unlock()

	for _, t := range tenants {
		t.expireInactiveSessions(5 * time.Minute)

		t.mu.Lock()
		paired := t.paired
		hasCreds := t.client != nil && t.client.Store != nil && t.client.Store.ID != nil
		connected := t.client != nil && t.client.IsConnected()
		pairing := t.pairing
		isReconnecting := t.isReconnecting
		t.mu.Unlock()

		// If the tenant should be connected but is dropped, trigger auto-reconnect
		if (paired || hasCreds) && !connected && !pairing && !isReconnecting {
			t.logger.Warnf("Watchdog detected disconnected tenant %s. Attempting auto-reconnect...", t.Hash)
			go func(ten *Tenant) {
				if err := ten.reconnect(); err != nil {
					ten.logger.Warnf("Watchdog auto-reconnect failed for %s: %v", ten.Hash, err)
				}
			}(t)
		}
	}
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
			m.logger.Errorf("Failed to open DB for restored tenant %s: %v", hash, err)
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
			m.logger.Warnf("Failed to initial connect restored tenant %s: %v (will auto-retry via watchdog)", hash, err)
			t.paired = true
			t.disconnectedAt = time.Now()
			t.lastError = err.Error()
			m.Add(t)
		} else {
			t.paired = true
			t.connectedAt = time.Now()
			t.lastError = ""
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

	if t.client != nil && t.client.IsConnected() {
		return "", nil
	}
	if t.paired && t.client != nil && t.client.Store != nil && t.client.Store.ID != nil {
		if err := t.client.Connect(); err == nil {
			t.connectedAt = time.Now()
			t.lastError = ""
			return "", nil
		}
	}
	if t.pairing {
		return t.qrCode, nil
	}

	dir := t.dir()
	if err := os.MkdirAll(dir, 0755); err != nil {
		return "", fmt.Errorf("failed to create tenant dir: %v", err)
	}
	t.saveConfig()

	if t.container == nil {
		dbLog := waLog.Stdout(fmt.Sprintf("Tenant-%s/DB", t.Hash), "INFO", true)
		container, err := sqlstore.New(context.Background(), "sqlite3", "file:"+filepath.Join(dir, "whatsapp.db")+"?_foreign_keys=on&_journal_mode=WAL&_busy_timeout=5000", dbLog)
		if err != nil {
			return "", fmt.Errorf("failed to open device store: %v", err)
		}
		t.container = container
	}

	var deviceStore *store.Device
	var err error
	if t.client == nil {
		deviceStore, err = t.container.GetFirstDevice(context.Background())
		if err == sql.ErrNoRows || (deviceStore != nil && deviceStore.ID == nil) {
			deviceStore = t.container.NewDevice()
		} else if err != nil {
			return "", fmt.Errorf("failed to get device: %v", err)
		}
		t.client = whatsmeow.NewClient(deviceStore, t.logger)
	}

	if t.messageStore == nil {
		ms, err := NewMessageStore(filepath.Join(dir, "messages.db"))
		if err != nil {
			return "", fmt.Errorf("failed to init message store: %v", err)
		}
		t.messageStore = ms
	}

	t.setupEventHandler()

	if t.client.Store.ID != nil {
		if err := t.client.Connect(); err != nil {
			return "", fmt.Errorf("failed to connect: %v", err)
		}
		t.paired = true
		t.connectedAt = time.Now()
		t.lastError = ""
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
		client := t.client
		t.mu.Unlock()

		if client == nil {
			return
		}

		qrChan, err := client.GetQRChannel(context.Background())
		if err != nil {
			t.logger.Errorf("Failed to get QR channel: %v", err)
			time.Sleep(2 * time.Second)
			continue
		}
		if err := client.Connect(); err != nil {
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
				t.connectedAt = time.Now()
				t.lastError = ""
				t.reconnectAttempts = 0
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
			client.Disconnect()
			time.Sleep(1 * time.Second)
		}
	}
}

func (t *Tenant) reconnect() error {
	t.mu.Lock()
	if t.isReconnecting {
		t.mu.Unlock()
		return nil
	}
	if t.client != nil && t.client.IsConnected() {
		t.mu.Unlock()
		return nil
	}
	t.isReconnecting = true
	t.reconnectAttempts++
	client := t.client
	t.mu.Unlock()

	defer func() {
		t.mu.Lock()
		t.isReconnecting = false
		t.mu.Unlock()
	}()

	if client == nil {
		t.mu.Lock()
		t.lastError = "client not initialized"
		t.mu.Unlock()
		return fmt.Errorf("client not initialized")
	}

	t.logger.Infof("Attempting reconnection for tenant %s (attempt %d)...", t.Hash, t.reconnectAttempts)
	err := client.Connect()
	t.mu.Lock()
	if err != nil {
		t.lastError = err.Error()
		t.disconnectedAt = time.Now()
		t.mu.Unlock()
		return err
	}
	t.connectedAt = time.Now()
	t.lastError = ""
	t.reconnectAttempts = 0
	t.mu.Unlock()
	t.logger.Infof("Tenant %s successfully reconnected", t.Hash)
	return nil
}

func (t *Tenant) disconnect() {
	t.mu.Lock()
	defer t.mu.Unlock()
	if t.client != nil {
		if t.client.IsConnected() {
			t.logger.Infof("Disconnecting tenant %s...", t.Hash)
		}
		t.client.Disconnect()
		t.disconnectedAt = time.Now()
	}
}

func (t *Tenant) close() {
	t.disconnect()
	t.mu.Lock()
	defer t.mu.Unlock()
	if t.messageStore != nil {
		_ = t.messageStore.Close()
		t.messageStore = nil
	}
	if t.container != nil {
		_ = t.container.Close()
		t.container = nil
	}
	t.client = nil
	t.paired = false
	t.pairing = false
	t.qrCode = ""
}

func (t *Tenant) status() map[string]interface{} {
	t.mu.Lock()
	defer t.mu.Unlock()
	connected := t.client != nil && t.client.IsConnected()
	return map[string]interface{}{
		"hash":              t.Hash,
		"linked":            t.paired,
		"pairing":           t.pairing,
		"connected":         connected,
		"hasQR":             t.qrCode != "",
		"qrAge":             int(time.Since(t.qrUpdated).Seconds()),
		"ownerPhone":        t.ownerPhone,
		"allowedRecipients": t.recipients,
		"aiModel":           t.aiModel,
		"aiApiKeySet":       t.aiApiKey != "",
		"reconnectAttempts": t.reconnectAttempts,
		"lastError":         t.lastError,
		"connectedAt":       t.connectedAt.Format(time.RFC3339),
		"disconnectedAt":    t.disconnectedAt.Format(time.RFC3339),
	}
}

func (t *Tenant) sendToRecipient(recipient, message string) (bool, string, string) {
	if t.client == nil {
		return false, "tenant not connected", ""
	}
	if !t.client.IsConnected() {
		if t.client.Store != nil && t.client.Store.ID != nil {
			t.logger.Infof("Tenant %s is paired but disconnected. Reconnecting before send...", t.Hash)
			if err := t.reconnect(); err == nil {
				time.Sleep(500 * time.Millisecond)
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
			if err := t.reconnect(); err == nil {
				time.Sleep(500 * time.Millisecond)
			}
		}
		if !t.client.IsConnected() {
			return false, "tenant not connected", ""
		}
	}
	return sendWhatsAppPoll(t.client, recipient, question, options, selectableCount)
}
