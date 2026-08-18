package main

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"strings"
	"sync"
	"syscall"
	"time"

	_ "github.com/mattn/go-sqlite3"
	"github.com/mdp/qrterminal"

	"go.mau.fi/whatsmeow"
	"go.mau.fi/whatsmeow/store"
	"go.mau.fi/whatsmeow/store/sqlstore"
	"go.mau.fi/whatsmeow/types"
	"go.mau.fi/whatsmeow/types/events"
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

func getWebhookBaseURL() string {
	if u := os.Getenv("WEB_BASE_URL"); u != "" {
		return strings.TrimRight(u, "/")
	}
	if u := os.Getenv("PANEL_URL"); u != "" {
		return strings.TrimRight(u, "/")
	}
	return "https://whatsapp-ai-nikhil.vercel.app"
}

func checkBridgeAuth(r *http.Request) bool {
	token := os.Getenv("BRIDGE_AUTH_TOKEN")
	if token == "" {
		return true
	}
	authHeader := r.Header.Get("Authorization")
	expected := "Bearer " + token
	if authHeader == expected || r.Header.Get("X-Bridge-Token") == token {
		return true
	}
	return false
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

func (t *Tenant) resolveGroupName(chatJID types.JID) string {
	ctx := context.Background()
	return GetChatName(ctx, t.client, t.messageStore, chatJID, chatJID.String(), nil, "", t.logger)
}

func (t *Tenant) isAllowedRecipient(senderJID, chatJID types.JID) bool {
	// If an active takeover grant was explicitly armed for this contact/chat, allow it!
	t.mu.Lock()
	activeGrant := false
	if t.grantKind == "duration" && time.Now().Before(t.grantExpiresAt) {
		activeGrant = true
	} else if t.grantKind == "count" && t.grantRemaining > 0 {
		activeGrant = true
	}
	grantTarget := t.grantTargetJID
	t.mu.Unlock()

	if activeGrant && !grantTarget.IsEmpty() {
		if chatJID.User == grantTarget.User || senderJID.User == grantTarget.User || chatJID.String() == grantTarget.String() {
			return true
		}
	}

	// If it's a group chat, check group JID and group name
	if chatJID.Server == "g.us" {
		groupName := strings.ToLower(t.resolveGroupName(chatJID))
		for _, r := range t.recipients {
			trimmed := strings.TrimSpace(r)
			if trimmed == "" {
				continue
			}
			// Match exact group JID or group user ID
			if chatJID.String() == trimmed || chatJID.User == trimmed {
				return true
			}
			// Match group name case-insensitively
			if groupName != "" && (strings.EqualFold(trimmed, groupName) || strings.Contains(groupName, strings.ToLower(trimmed))) {
				return true
			}
		}
	}

	candidates := []string{
		senderJID.User,
		chatJID.User,
	}

	if t.client != nil && t.client.Store != nil {
		if senderJID.Server == "lid" {
			if pn, err := t.client.Store.LIDs.GetPNForLID(context.Background(), senderJID); err == nil && !pn.IsEmpty() {
				candidates = append(candidates, pn.User)
			}
		}
		if chatJID.Server == "lid" {
			if pn, err := t.client.Store.LIDs.GetPNForLID(context.Background(), chatJID); err == nil && !pn.IsEmpty() {
				candidates = append(candidates, pn.User)
			}
		}

		for _, r := range t.recipients {
			normR := normalizePhone(r)
			if normR == "" {
				continue
			}
			pnJID := types.NewJID(normR, types.DefaultUserServer)
			if lid, err := t.client.Store.LIDs.GetLIDForPN(context.Background(), pnJID); err == nil && !lid.IsEmpty() {
				if lid.User == senderJID.User || lid.User == chatJID.User {
					return true
				}
				candidates = append(candidates, lid.User)
			}
		}
	}

	t.logger.Infof("Evaluating allowed recipient for sender %s (chat %s): candidates=%v allowed_recipients=%v", senderJID, chatJID, candidates, t.recipients)

	for _, cand := range candidates {
		normCand := normalizePhone(cand)
		if normCand == "" {
			continue
		}
		for _, r := range t.recipients {
			normR := normalizePhone(r)
			if normR == "" {
				continue
			}
			if normR == normCand || strings.HasSuffix(normCand, normR) || strings.HasSuffix(normR, normCand) {
				return true
			}
		}
	}
	return false
}

func (t *Tenant) resolveContactName(msg *events.Message) string {
	ctx := context.Background()
	senderJID := msg.Info.Sender
	chatJID := msg.Info.Chat

	// 1. Check PushName directly on the message
	if msg.Info.PushName != "" && !isAllDigits(msg.Info.PushName) {
		return msg.Info.PushName
	}

	// 2. Check contacts store with Phone Number JID
	if t.client != nil && t.client.Store != nil {
		var pnJID types.JID
		if senderJID.Server == "lid" && t.client.Store.LIDs != nil {
			if pn, err := t.client.Store.LIDs.GetPNForLID(ctx, senderJID); err == nil && !pn.IsEmpty() {
				pnJID = pn
			}
		} else {
			pnJID = senderJID
		}

		if !pnJID.IsEmpty() && t.client.Store.Contacts != nil {
			if contact, err := t.client.Store.Contacts.GetContact(ctx, pnJID); err == nil {
				if contact.FullName != "" {
					return contact.FullName
				}
				if contact.BusinessName != "" {
					return contact.BusinessName
				}
				if contact.PushName != "" && !isAllDigits(contact.PushName) {
					return contact.PushName
				}
			}
		}

		// Also check senderJID directly in Contacts
		if t.client.Store.Contacts != nil {
			if contact, err := t.client.Store.Contacts.GetContact(ctx, senderJID); err == nil {
				if contact.FullName != "" {
					return contact.FullName
				}
				if contact.BusinessName != "" {
					return contact.BusinessName
				}
				if contact.PushName != "" && !isAllDigits(contact.PushName) {
					return contact.PushName
				}
			}
		}
	}

	// 3. Check SQLite database chats table (only if not purely digits)
	if t.messageStore != nil && t.messageStore.db != nil {
		var name string
		if err := t.messageStore.db.QueryRow("SELECT name FROM chats WHERE jid = ? OR jid = ?", chatJID.String(), senderJID.String()).Scan(&name); err == nil {
			if name != "" && !isAllDigits(name) {
				return name
			}
		}
	}

	// 4. Fallback to Phone Number if known instead of raw LID number
	if t.client != nil && t.client.Store != nil && t.client.Store.LIDs != nil && senderJID.Server == "lid" {
		if pn, err := t.client.Store.LIDs.GetPNForLID(ctx, senderJID); err == nil && !pn.IsEmpty() {
			return "+" + pn.User
		}
	}

	if senderJID.User != "" {
		return senderJID.User
	}
	return "Contact"
}

// isGroupMessageDirectedToOwner checks if a message in a group chat is directed at the owner (via @mention, direct reply/quote, or name mention).
func (t *Tenant) isGroupMessageDirectedToOwner(msg *events.Message) (bool, string) {
	if msg == nil || msg.Message == nil {
		return false, ""
	}

	ownerPN := normalizePhone(t.ownerPhone)
	ownerUser := ""
	if t.client != nil && t.client.Store != nil && t.client.Store.ID != nil {
		ownerUser = t.client.Store.ID.User
	}

	// 1. Check ContextInfo for mentions and replies
	ci := getContextInfo(msg.Message)
	if ci != nil {
		// Mentions
		for _, mj := range ci.GetMentionedJID() {
			normMJ := normalizePhone(mj)
			if (ownerPN != "" && (normMJ == ownerPN || strings.HasSuffix(normMJ, ownerPN))) ||
				(ownerUser != "" && (mj == ownerUser || strings.Contains(mj, ownerUser))) {
				return true, "mentioned you"
			}
		}

		// Reply/Quote to owner's message
		if participant := ci.GetParticipant(); participant != "" {
			normP := normalizePhone(participant)
			if (ownerPN != "" && (normP == ownerPN || strings.HasSuffix(normP, ownerPN))) ||
				(ownerUser != "" && (participant == ownerUser || strings.Contains(participant, ownerUser))) {
				return true, "replied to you"
			}
		}
	}

	// 2. Check message body text for owner's first name/nickname
	text := strings.ToLower(extractTextContent(msg.Message))
	if text != "" {
		ownerNames := []string{}
		if t.ownerPhone != "" && t.client != nil && t.client.Store != nil {
			pnJID := types.NewJID(normalizePhone(t.ownerPhone), types.DefaultUserServer)
			if contact, err := t.client.Store.Contacts.GetContact(context.Background(), pnJID); err == nil {
				if contact.FullName != "" {
					parts := strings.Fields(contact.FullName)
					if len(parts) > 0 && len(parts[0]) >= 3 {
						ownerNames = append(ownerNames, strings.ToLower(parts[0]))
					}
				}
				if contact.PushName != "" && !isAllDigits(contact.PushName) && len(contact.PushName) >= 3 {
					parts := strings.Fields(contact.PushName)
					if len(parts) > 0 && len(parts[0]) >= 3 {
						ownerNames = append(ownerNames, strings.ToLower(parts[0]))
					}
				}
			}
		}
		if t.client != nil && t.client.Store != nil && t.client.Store.PushName != "" {
			parts := strings.Fields(t.client.Store.PushName)
			if len(parts) > 0 && len(parts[0]) >= 3 {
				ownerNames = append(ownerNames, strings.ToLower(parts[0]))
			}
		}

		for _, name := range ownerNames {
			if strings.Contains(text, name) {
				return true, fmt.Sprintf("mentioned %s", name)
			}
		}
	}

	return false, ""
}

// handleEvent dispatches incoming WhatsApp events for this tenant.
func (t *Tenant) handleEvent(evt interface{}) {
	switch v := evt.(type) {
	case *events.Message:
		if v.Message.GetPollUpdateMessage() != nil {
			t.handleTenantPollVote(v)
		} else {
			handleMessage(t.client, t.messageStore, v, t.logger)

			isAllowed := t.isAllowedRecipient(v.Info.Sender, v.Info.Chat)
			isGroup := v.Info.Chat.Server == "g.us"

			// Determine normalized recipient key (for group chats, key by group JID)
			recipientKey := v.Info.Chat.String()
			if !isGroup {
				recipientKey = normalizePhone(v.Info.Chat.User)
				if recipientKey == "" {
					recipientKey = normalizePhone(v.Info.Sender.User)
				}
			}

			if v.Info.IsFromMe && isAllowed {
				if t.isApiSent(string(v.Info.ID)) {
					t.logger.Infof("Ignoring self-echo of API-sent message %s", v.Info.ID)
					return
				}
				// Only reset takeover if owner manually texted an allowed contact (not self-chat)
				if recipientKey != normalizePhone(t.ownerPhone) {
					t.mu.Lock()
					if t.grantKind != "none" {
						t.grantKind = "none"
						t.grantRemaining = 0
						t.grantTargetJID = types.EmptyJID
						t.logger.Infof("Owner sent manual message -> reset takeover grant for %s", t.Hash)
					}
					var oldPollID string
					if t.activePollsByRecipient != nil {
						oldPollID = t.activePollsByRecipient[recipientKey]
						delete(t.activePollsByRecipient, recipientKey)
					}
					if t.lastPollTimeByRecipient != nil {
						delete(t.lastPollTimeByRecipient, recipientKey)
					}
					t.mu.Unlock()

					if oldPollID != "" {
						_ = deleteWhatsAppMessage(t.client, t.ownerPhone, oldPollID)
						go func(pID string) {
							expireURL := fmt.Sprintf("%s/api/polls/%s/expire?hash=%s", getWebhookBaseURL(), pID, t.Hash)
							req, _ := http.NewRequest(http.MethodPost, expireURL, nil)
							if resp, err := http.DefaultClient.Do(req); err == nil && resp != nil {
								_ = resp.Body.Close()
							}
						}(oldPollID)
					}
				}
				return
			}

			if !v.Info.IsFromMe && isAllowed {
				t.mu.Lock()
				t.lastTargetJID = v.Info.Chat
				activeGrant := false
				if t.grantKind == "duration" && time.Now().Before(t.grantExpiresAt) {
					activeGrant = true
				} else if t.grantKind == "count" && t.grantRemaining > 0 {
					activeGrant = true
				}
				t.mu.Unlock()

				if activeGrant {
					t.logger.Infof("Active takeover grant for %s -> drafting AI reply immediately", t.Hash)
					go t.replyToChat(v.Info.Chat)
				} else if t.ownerPhone != "" {
					// For Group Chats, apply Smart Triggering
					triggerReason := ""
					if isGroup {
						directed, reason := t.isGroupMessageDirectedToOwner(v)
						if !directed {
							// Background group chatter: stored in DB, but no poll triggered
							return
						}
						triggerReason = reason
					}

					chatName := t.resolveContactName(v)
					var question string
					if isGroup {
						groupName := t.resolveGroupName(v.Info.Chat)
						textSnippet := strings.TrimSpace(extractTextContent(v.Message))
						if len(textSnippet) > 35 {
							textSnippet = textSnippet[:32] + "..."
						}
						if textSnippet != "" {
							question = fmt.Sprintf("%s in \"%s\" (%s: \"%s\"). Take over?", chatName, groupName, triggerReason, textSnippet)
						} else {
							question = fmt.Sprintf("%s in \"%s\" %s. Take over?", chatName, groupName, triggerReason)
						}
					} else {
						question = fmt.Sprintf("%s texted you. Take over?", chatName)
					}
					options := []string{"Send 1 text", "5 minutes", "2 hours", "Deny"}

					t.mu.Lock()
					if t.activePollsByRecipient == nil {
						t.activePollsByRecipient = make(map[string]string)
					}
					if t.lastPollTimeByRecipient == nil {
						t.lastPollTimeByRecipient = make(map[string]time.Time)
					}
					oldPollID := t.activePollsByRecipient[recipientKey]
					lastPollTime := t.lastPollTimeByRecipient[recipientKey]
					t.mu.Unlock()

					// Cooldown check (60 seconds) for 1-on-1 and group chats:
					// If a poll is already active and was sent less than 60s ago, keep it alive without revoking/recreating.
					if oldPollID != "" && time.Since(lastPollTime) < 60*time.Second {
						t.logger.Infof("Active poll %s was sent %v ago (< 60s cooldown) for recipient %s. Keeping existing poll alive.", oldPollID, time.Since(lastPollTime).Round(time.Second), recipientKey)
						return
					}

					// In group chats, if any poll is already active, keep it ALIVE (do not spam or revoke rapidly)
					if isGroup && oldPollID != "" {
						t.logger.Infof("Active poll %s is already pending for group %s. Keeping existing poll alive.", oldPollID, recipientKey)
						return
					}

					if oldPollID != "" {
						t.logger.Infof("Revoking previous active poll %s for recipient %s (tenant %s)", oldPollID, recipientKey, t.Hash)
						_ = deleteWhatsAppMessage(t.client, t.ownerPhone, oldPollID)
						go func(pID string) {
							expireURL := fmt.Sprintf("%s/api/polls/%s/expire?hash=%s", getWebhookBaseURL(), pID, t.Hash)
							req, _ := http.NewRequest(http.MethodPost, expireURL, nil)
							if resp, err := http.DefaultClient.Do(req); err == nil && resp != nil {
								_ = resp.Body.Close()
							}
						}(oldPollID)
					}

					ok, status, pollID := sendWhatsAppPoll(t.client, t.ownerPhone, question, options, 1)
					if ok && pollID != "" {
						t.recordApiSent(pollID) // CRITICAL: record poll ID so self-echo doesn't trigger manual message reset!
						t.mu.Lock()
						t.activePollsByRecipient[recipientKey] = pollID
						t.lastPollTimeByRecipient[recipientKey] = time.Now()
						t.mu.Unlock()
					}
					fmt.Printf("\n[takeover %s] Sent approval poll to owner %s for incoming message from %s (recipient %s): ok=%v status=%s pollID=%s\n", t.Hash, t.ownerPhone, chatName, recipientKey, ok, status, pollID)

					go func(pID, contact, cName, q string, opts []string) {
						payload, _ := json.Marshal(map[string]interface{}{
							"id":             pID,
							"hash":           t.Hash,
							"contact":        contact,
							"contactDisplay": cName,
							"question":       q,
							"options":        opts,
							"status":         "pending",
						})
						webhookURL := fmt.Sprintf("%s/api/polls", getWebhookBaseURL())
						resp, err := http.Post(webhookURL, "application/json", bytes.NewReader(payload))
						if err == nil && resp != nil {
							_ = resp.Body.Close()
						}
					}(pollID, recipientKey, chatName, question, options)
				}
			}
		}
	case *events.HistorySync:
		t.handleTenantHistorySync(v)
	case *events.Connected:
		t.logger.Infof("Tenant %s connected", t.Hash)
	case *events.LoggedOut:
		t.logger.Warnf("Tenant %s logged out from WhatsApp. Wiping stored session and messages...", t.Hash)
		t.mu.Lock()
		t.paired = false
		t.pairing = false
		t.qrCode = ""
		if t.client != nil {
			t.client.Disconnect()
		}
		t.mu.Unlock()
		_ = os.RemoveAll(t.dir())
		t.logger.Infof("Tenant %s local data wiped.", t.Hash)
	}
}

// setupEventHandler wires message and poll events for this tenant.
func (t *Tenant) setupEventHandler() {
	t.client.AddEventHandler(t.handleEvent)
}

// handleTenantHistorySync processes WhatsApp history sync ONLY for targeted recipients, capping at 75 recent messages per chat.
func (t *Tenant) handleTenantHistorySync(historySync *events.HistorySync) {
	if historySync == nil || historySync.Data == nil {
		return
	}

	totalConvs := len(historySync.Data.Conversations)
	t.logger.Infof("Received history sync chunk with %d conversations. Filtering for targeted recipients...", totalConvs)

	syncedConvs := 0
	syncedMsgs := 0

	for _, conversation := range historySync.Data.Conversations {
		if conversation == nil || conversation.ID == nil {
			continue
		}

		chatJID := *conversation.ID
		jid, err := types.ParseJID(chatJID)
		if err != nil {
			continue
		}

		// Only sync history for allowed recipients (or owner chat)
		isAllowed := t.isAllowedRecipient(jid, jid)
		isOwner := t.ownerPhone != "" && (normalizePhone(jid.User) == normalizePhone(t.ownerPhone))
		if len(t.recipients) > 0 && !isAllowed && !isOwner {
			continue // Skip non-targeted chats entirely
		}

		name := GetChatName(context.Background(), t.client, t.messageStore, jid, chatJID, conversation, "", t.logger)
		messages := conversation.Messages
		if len(messages) == 0 {
			continue
		}

		// Cap to latest 75 messages (between 50 and 100)
		const maxHistoryPerChat = 75
		if len(messages) > maxHistoryPerChat {
			messages = messages[:maxHistoryPerChat]
		}

		latestMsg := messages[0]
		if latestMsg != nil && latestMsg.Message != nil {
			if ts := latestMsg.Message.GetMessageTimestamp(); ts != 0 {
				t.messageStore.StoreChat(chatJID, name, time.Unix(int64(ts), 0))
			}
		}

		for _, msg := range messages {
			if msg == nil || msg.Message == nil {
				continue
			}

			var content string
			if msg.Message.Message != nil {
				if conv := msg.Message.Message.GetConversation(); conv != "" {
					content = conv
				} else if ext := msg.Message.Message.GetExtendedTextMessage(); ext != nil {
					content = ext.GetText()
				}
			}

			repliedTo := ""
			if msg.Message.Message != nil {
				repliedTo = extractQuotedText(msg.Message.Message)
			}

			var mediaType, filename, url string
			var mediaKey, fileSHA256, fileEncSHA256 []byte
			var fileLength uint64
			if msg.Message.Message != nil {
				mediaType, filename, url, mediaKey, fileSHA256, fileEncSHA256, fileLength = extractMediaInfo(msg.Message.Message)
			}

			if content == "" && mediaType == "" {
				continue
			}

			var sender string
			isFromMe := false
			if msg.Message.Key != nil {
				if msg.Message.Key.FromMe != nil {
					isFromMe = *msg.Message.Key.FromMe
				}
				if !isFromMe && msg.Message.Key.Participant != nil && *msg.Message.Key.Participant != "" {
					sender = *msg.Message.Key.Participant
				} else if isFromMe {
					if t.client != nil && t.client.Store != nil && t.client.Store.ID != nil {
						sender = t.client.Store.ID.User
					} else {
						sender = "me"
					}
				} else {
					sender = jid.User
				}
			} else {
				sender = jid.User
			}

			msgID := ""
			if msg.Message.Key != nil && msg.Message.Key.ID != nil {
				msgID = *msg.Message.Key.ID
			}

			timestamp := time.Time{}
			if ts := msg.Message.GetMessageTimestamp(); ts != 0 {
				timestamp = time.Unix(int64(ts), 0)
			} else {
				continue
			}

			_ = t.messageStore.StoreMessage(
				msgID,
				chatJID,
				sender,
				content,
				repliedTo,
				timestamp,
				isFromMe,
				mediaType,
				filename,
				url,
				mediaKey,
				fileSHA256,
				fileEncSHA256,
				fileLength,
				"remote",
			)
			syncedMsgs++
		}
		syncedConvs++
		t.logger.Infof("History sync: Stored %d recent messages for targeted recipient %s (%s)", len(messages), name, chatJID)
	}

	t.logger.Infof("History sync completed: %d messages across %d targeted chats (filtered from %d total conversations)", syncedMsgs, syncedConvs, totalConvs)
}

// handleTenantPollVote handles incoming poll votes from the owner and activates takeover grants.
func (t *Tenant) handleTenantPollVote(msg *events.Message) {
	if msg.Message.GetPollUpdateMessage() == nil {
		return
	}
	vote, err := t.client.DecryptPollVote(context.Background(), msg)
	if err != nil {
		t.logger.Warnf("Failed to decrypt poll vote: %v", err)
		return
	}
	pollMsgID := msg.Message.GetPollUpdateMessage().GetPollCreationMessageKey().GetID()
	question, selected := resolvePollOptions(pollMsgID, vote.GetSelectedOptions())
	timestamp := msg.Info.Timestamp.Format("2006-01-02 15:04:05")
	fmt.Printf("[%s] POLL VOTE from %s on %q: %v\n", timestamp, msg.Info.Sender, question, selected)
	joined := strings.Join(selected, ", ")
	_ = t.messageStore.StorePollVote(pollMsgID, msg.Info.Sender.String(), question, joined, msg.Info.Timestamp)

	if len(selected) > 0 {
		choice := selected[0]
		t.mu.Lock()
		targetJID := t.lastTargetJID
		if t.activePollsByRecipient != nil {
			for rk, pid := range t.activePollsByRecipient {
				if pid == pollMsgID {
					delete(t.activePollsByRecipient, rk)
					if t.lastPollTimeByRecipient != nil {
						delete(t.lastPollTimeByRecipient, rk)
					}
					break
				}
			}
		}
		normChoice := strings.TrimSpace(strings.ToLower(choice))
		isOneText := strings.Contains(normChoice, "1") || strings.Contains(normChoice, "1 text") || normChoice == "send 1 text"
		is5Min := strings.Contains(normChoice, "5 min") || strings.Contains(normChoice, "5 minutes")
		is2Hours := strings.Contains(normChoice, "2 hour") || strings.Contains(normChoice, "2 hr") || strings.Contains(normChoice, "2 hours")
		isDeny := strings.Contains(normChoice, "deny")

		if isOneText {
			t.grantKind = "count"
			t.grantRemaining = 1
			t.grantTargetJID = targetJID
			t.logger.Infof("Takeover granted for %s: 1 text (target %s)", t.Hash, targetJID)
			t.mu.Unlock()
			go t.replyToChat(targetJID)
		} else if is5Min {
			t.grantKind = "duration"
			t.grantExpiresAt = time.Now().Add(5 * time.Minute)
			t.grantTargetJID = targetJID
			t.logger.Infof("Takeover granted for %s: 5 minutes (until %s, target %s)", t.Hash, t.grantExpiresAt.Format("15:04:05"), targetJID)
			t.mu.Unlock()
			go t.replyToChat(targetJID)
		} else if is2Hours {
			t.grantKind = "duration"
			t.grantExpiresAt = time.Now().Add(2 * time.Hour)
			t.grantTargetJID = targetJID
			t.logger.Infof("Takeover granted for %s: 2 hours (until %s, target %s)", t.Hash, t.grantExpiresAt.Format("15:04:05"), targetJID)
			t.mu.Unlock()
			go t.replyToChat(targetJID)
		} else if isDeny {
			t.grantKind = "none"
			t.grantRemaining = 0
			t.grantTargetJID = types.EmptyJID
			t.logger.Infof("Takeover denied for %s", t.Hash)
			t.mu.Unlock()
		} else {
			t.mu.Unlock()
		}
	}
}

// applyWebGrant activates a takeover grant triggered from the Web Dashboard.
func (t *Tenant) applyWebGrant(choice, contact string) {
	t.mu.Lock()
	var targetJID types.JID
	if contact != "" {
		if strings.HasSuffix(contact, "@g.us") || strings.HasSuffix(contact, "@s.whatsapp.net") || strings.HasSuffix(contact, "@lid") {
			if jid, err := types.ParseJID(contact); err == nil {
				targetJID = jid
			}
		} else {
			clean := normalizePhone(contact)
			if clean != "" {
				targetJID = types.NewJID(clean, types.DefaultUserServer)
			}
		}
	}
	if targetJID.IsEmpty() && !t.lastTargetJID.IsEmpty() {
		targetJID = t.lastTargetJID
	}

	normChoice := strings.TrimSpace(strings.ToLower(choice))
	isOneText := strings.Contains(normChoice, "1") || strings.Contains(normChoice, "1 text") || normChoice == "send 1 text"
	is5Min := strings.Contains(normChoice, "5 min") || strings.Contains(normChoice, "5 minutes")
	is2Hours := strings.Contains(normChoice, "2 hour") || strings.Contains(normChoice, "2 hr") || strings.Contains(normChoice, "2 hours")
	isDeny := strings.Contains(normChoice, "deny")

	if isOneText {
		t.grantKind = "count"
		t.grantRemaining = 1
		t.grantTargetJID = targetJID
		t.lastTargetJID = targetJID
		t.logger.Infof("Web Takeover granted for %s: 1 text (target %s)", t.Hash, targetJID)
		t.mu.Unlock()
		if !targetJID.IsEmpty() {
			go t.replyToChat(targetJID)
		}
	} else if is5Min {
		t.grantKind = "duration"
		t.grantExpiresAt = time.Now().Add(5 * time.Minute)
		t.grantTargetJID = targetJID
		t.lastTargetJID = targetJID
		t.logger.Infof("Web Takeover granted for %s: 5 minutes (until %s, target %s)", t.Hash, t.grantExpiresAt.Format("15:04:05"), targetJID)
		t.mu.Unlock()
		if !targetJID.IsEmpty() {
			go t.replyToChat(targetJID)
		}
	} else if is2Hours {
		t.grantKind = "duration"
		t.grantExpiresAt = time.Now().Add(2 * time.Hour)
		t.grantTargetJID = targetJID
		t.lastTargetJID = targetJID
		t.logger.Infof("Web Takeover granted for %s: 2 hours (until %s, target %s)", t.Hash, t.grantExpiresAt.Format("15:04:05"), targetJID)
		t.mu.Unlock()
		if !targetJID.IsEmpty() {
			go t.replyToChat(targetJID)
		}
	} else if isDeny {
		t.grantKind = "none"
		t.grantRemaining = 0
		t.grantTargetJID = types.EmptyJID
		t.logger.Infof("Web Takeover denied for %s", t.Hash)
		t.mu.Unlock()
	} else {
		t.mu.Unlock()
	}
}

// replyToChat drafts a persona-aligned reply using OpenRouter Qwen 3.8 27B and sends it via WhatsApp.
func (t *Tenant) replyToChat(targetJID types.JID) {
	if t.client == nil || !t.client.IsConnected() || targetJID.IsEmpty() {
		return
	}

	chatJID := targetJID.String()
	msgs, err := t.messageStore.GetMessages(chatJID, 20)
	if err != nil || len(msgs) == 0 {
		t.logger.Warnf("No chat history found for %s to generate reply", chatJID)
		return
	}

	isGroup := targetJID.Server == "g.us"
	var historyBuilder strings.Builder
	for i := len(msgs) - 1; i >= 0; i-- {
		m := msgs[i]
		prefix := "From: " + m.Sender
		if m.IsFromMe {
			prefix = "From: Me"
		} else if isGroup {
			senderDisplayName := m.Sender
			if t.client != nil && t.client.Store != nil {
				normS := normalizePhone(m.Sender)
				if normS != "" {
					pnJID := types.NewJID(normS, types.DefaultUserServer)
					if c, err := t.client.Store.Contacts.GetContact(context.Background(), pnJID); err == nil && c.FullName != "" {
						senderDisplayName = c.FullName
					} else if c.PushName != "" && !isAllDigits(c.PushName) {
						senderDisplayName = c.PushName
					}
				}
			}
			prefix = fmt.Sprintf("[%s]", senderDisplayName)
		}
		historyBuilder.WriteString(fmt.Sprintf("%s: %s\n", prefix, m.Content))
	}
	history := historyBuilder.String()

	identityClause := "You are the person who writes the messages labeled 'From: Me' in the conversation history below."
	if t.ownerPhone != "" && t.client != nil && t.client.Store != nil {
		normPhone := normalizePhone(t.ownerPhone)
		pnJID := types.NewJID(normPhone, types.DefaultUserServer)
		if contact, err := t.client.Store.Contacts.GetContact(context.Background(), pnJID); err == nil {
			if contact.FullName != "" {
				identityClause = fmt.Sprintf("You are %s, the person who writes the messages labeled 'From: Me' in the conversation history below. Your name is %s.", contact.FullName, contact.FullName)
			} else if contact.PushName != "" && !isAllDigits(contact.PushName) {
				identityClause = fmt.Sprintf("You are %s, the person who writes the messages labeled 'From: Me' in the conversation history below. Your name is %s.", contact.PushName, contact.PushName)
			}
		}
	}

	var systemPrompt string
	if isGroup {
		groupName := t.resolveGroupName(targetJID)
		systemPrompt = fmt.Sprintf(`%s That is your own writing style: mirror your own message length, tone, capitalization, punctuation, slang, and emoji usage. If your messages are one-liners, reply with one-liners. If you use emojis, use emojis; if you don't, don't.

YOU ARE IN A GROUP CHAT ("%s"):
1. GROUP DYNAMICS & BREVITY:
   - Group texts must be very short, natural, and casual (often 1 to 8 words). Never write long paragraphs or sound like an assistant.
   - Match the group banter, sarcasm, teasing, or casual vibe.
   - If the group uses regional languages or code-mixing (Telugu/Tanglish, Hindi/Hinglish, etc.), ALWAYS prefer and reply in that language or code-mixed style over plain English. Match the casual Romanized transliteration.

2. TARGETED REPLY:
   - Multiple people are in this group chat. Each message is labeled with "[Sender Name]: ...".
   - Respond specifically to the person who addressed, mentioned, or replied to you.
   - Do NOT answer for other group members or interrupt conversations between others unless relevant to you.

3. ABSOLUTE RULES:
   - Never say you are an AI or bot.
   - No formal greetings ("Hey guys", "Hello all").
   - Output ONLY the exact text message to send and nothing else.`, identityClause, groupName)
	} else {
		systemPrompt = fmt.Sprintf(`%s That is your own writing style: mirror your own message length, tone, capitalization, punctuation, slang, and emoji usage. If your messages are one-liners, reply with one-liners. If you use emojis, use emojis; if you don't, don't.

LANGUAGE PREFERENCE:
- If the other person or the chat history uses non-English languages, regional dialects, vernacular phrases, or code-mixed speech (e.g. Hindi/Hinglish, Telugu/Tanglish, etc. written in Latin/English script), ALWAYS prefer and reply in that language or code-mixed style over plain English, even if English is commonly used in the chat.
- Match the casual Romanized transliteration style naturally (e.g., respond in natural regional vernacular/slang instead of reverting to formal English).

READ THE ROOM:
- The last message from the other person is the one you are replying to. Answer what THEY just said and stay on that topic. Never reply with a generic or off-topic one-liner.
- Never repeat a message you already sent in the history, and never send the same text twice in a row.
- Never continue your own monologue: if the other person has not spoken since your last message, you have nothing to reply to.
- Reply naturally and human. Don't mention that you're an AI. Don't use markdown. Output only the message text and nothing else.`, identityClause)
	}

	model := t.aiModel
	if model == "" {
		model = os.Getenv("AI_MODEL")
	}
	if model == "" {
		model = "qwen/qwen3.8-27b"
	}

	apiKey := t.aiApiKey
	if apiKey == "" {
		apiKey = os.Getenv("OPENROUTER_API_KEY")
	}
	if apiKey == "" {
		apiKey = os.Getenv("AI_API_KEY")
	}

	if apiKey == "" {
		t.logger.Warnf("No AI API key found for tenant %s. Skipping auto-reply.", t.Hash)
		return
	}

	type Message struct {
		Role    string `json:"role"`
		Content string `json:"content"`
	}
	type Reasoning struct {
		Effort    string `json:"effort,omitempty"`
		MaxTokens int    `json:"max_tokens,omitempty"`
	}
	type RequestBody struct {
		Model     string     `json:"model"`
		Messages  []Message  `json:"messages"`
		MaxTokens int        `json:"max_tokens,omitempty"`
		Reasoning *Reasoning `json:"reasoning,omitempty"`
	}

	messages := []Message{
		{Role: "system", Content: systemPrompt},
		{Role: "user", Content: history},
	}

	endpoint := "https://openrouter.ai/api/v1/chat/completions"
	var reqBody RequestBody

	// 1. Google Gemini (direct key format AIza...)
	if strings.HasPrefix(apiKey, "AIza") {
		geminiModel := model
		if strings.Contains(geminiModel, "/") {
			parts := strings.Split(geminiModel, "/")
			geminiModel = parts[len(parts)-1]
		}
		endpoint = fmt.Sprintf("https://generativelanguage.googleapis.com/v1beta/models/%s:generateContent?key=%s", geminiModel, apiKey)
		type GeminiPart struct {
			Text string `json:"text"`
		}
		type GeminiContent struct {
			Role  string       `json:"role"`
			Parts []GeminiPart `json:"parts"`
		}
		type GeminiReq struct {
			SystemInstruction *GeminiContent  `json:"system_instruction,omitempty"`
			Contents          []GeminiContent `json:"contents"`
		}
		gReq := GeminiReq{
			SystemInstruction: &GeminiContent{Parts: []GeminiPart{{Text: systemPrompt}}},
			Contents:          []GeminiContent{{Role: "user", Parts: []GeminiPart{{Text: history}}}},
		}
		gBytes, _ := json.Marshal(gReq)
		httpReq, _ := http.NewRequest("POST", endpoint, bytes.NewReader(gBytes))
		httpReq.Header.Set("Content-Type", "application/json")
		client := &http.Client{Timeout: 60 * time.Second}
		resp, err := client.Do(httpReq)
		if err != nil {
			t.logger.Errorf("Gemini request failed: %v", err)
			return
		}
		defer resp.Body.Close()
		bodyBytes, _ := io.ReadAll(resp.Body)
		if resp.StatusCode != http.StatusOK {
			t.logger.Errorf("Gemini API error (HTTP %d): %s", resp.StatusCode, string(bodyBytes))
			return
		}
		var gRes struct {
			Candidates []struct {
				Content struct {
					Parts []struct {
						Text string `json:"text"`
					} `json:"parts"`
				} `json:"content"`
			} `json:"candidates"`
		}
		if err := json.Unmarshal(bodyBytes, &gRes); err == nil && len(gRes.Candidates) > 0 && len(gRes.Candidates[0].Content.Parts) > 0 {
			replyText := strings.TrimSpace(gRes.Candidates[0].Content.Parts[0].Text)
			if replyText != "" {
				t.logger.Infof("Gemini drafted reply for %s: %q", targetJID, replyText)
				ok, sendStatus, sentMsgID := sendWhatsAppMessage(t.client, t.messageStore, targetJID.String(), replyText, "", t.logger)
				t.logger.Infof("Sent Gemini reply to %s: ok=%v status=%s msgID=%s", targetJID, ok, sendStatus, sentMsgID)
				if ok && sentMsgID != "" {
					t.recordApiSent(sentMsgID)
					t.mu.Lock()
					if t.grantKind == "count" {
						if t.grantRemaining > 0 {
							t.grantRemaining--
						}
						if t.grantRemaining <= 0 {
							t.grantKind = "none"
							t.grantTargetJID = types.EmptyJID
						}
					}
					t.mu.Unlock()
				}
			}
		}
		return
	}

	// 2. OpenAI (direct key format sk-... not sk-or-)
	if strings.HasPrefix(apiKey, "sk-") && !strings.HasPrefix(apiKey, "sk-or-") && !strings.HasPrefix(apiKey, "sk-ant-") {
		endpoint = "https://api.openai.com/v1/chat/completions"
		reqBody = RequestBody{
			Model:     model,
			Messages:  messages,
			MaxTokens: 2000,
		}
	} else if strings.HasPrefix(apiKey, "gsk_") {
		// 3. Groq
		endpoint = "https://api.groq.com/openai/v1/chat/completions"
		reqBody = RequestBody{
			Model:     model,
			Messages:  messages,
			MaxTokens: 2000,
		}
	} else {
		// 4. OpenRouter (default)
		reqBody = RequestBody{
			Model:     model,
			Messages:  messages,
			MaxTokens: 2000,
			Reasoning: &Reasoning{Effort: "low"},
		}
	}

	jsonBytes, _ := json.Marshal(reqBody)
	req, err := http.NewRequest("POST", endpoint, bytes.NewReader(jsonBytes))
	if err != nil {
		t.logger.Errorf("Failed to build AI request: %v", err)
		return
	}
	req.Header.Set("Authorization", "Bearer "+apiKey)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("HTTP-Referer", "https://github.com/Nikhil-Mundhra/whatsapp-ai")
	req.Header.Set("X-Title", "WhatsApp TakeOver AI")

	client := &http.Client{Timeout: 60 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		t.logger.Errorf("AI request failed: %v", err)
		return
	}
	defer resp.Body.Close()

	bodyBytes, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != http.StatusOK {
		t.logger.Errorf("AI Provider error (HTTP %d): %s", resp.StatusCode, string(bodyBytes))

		// If OpenRouter failed due to reasoning parameter, retry without reasoning
		if reqBody.Reasoning != nil {
			reqBody.Reasoning = nil
			retryBytes, _ := json.Marshal(reqBody)
			retryReq, _ := http.NewRequest("POST", endpoint, bytes.NewReader(retryBytes))
			retryReq.Header.Set("Authorization", "Bearer "+apiKey)
			retryReq.Header.Set("Content-Type", "application/json")
			retryReq.Header.Set("HTTP-Referer", "https://github.com/Nikhil-Mundhra/whatsapp-ai")
			retryReq.Header.Set("X-Title", "WhatsApp TakeOver AI")
			retryResp, retryErr := client.Do(retryReq)
			if retryErr == nil {
				defer retryResp.Body.Close()
				bodyBytes, _ = io.ReadAll(retryResp.Body)
				if retryResp.StatusCode != http.StatusOK {
					t.logger.Errorf("AI retry without reasoning also failed (HTTP %d): %s", retryResp.StatusCode, string(bodyBytes))
					return
				}
			}
		} else {
			return
		}
	}

	var resData struct {
		Choices []struct {
			Message struct {
				Content   string `json:"content"`
				Reasoning string `json:"reasoning"`
			} `json:"message"`
		} `json:"choices"`
	}
	if err := json.Unmarshal(bodyBytes, &resData); err != nil || len(resData.Choices) == 0 {
		t.logger.Errorf("Failed to parse AI response: %v (raw: %s)", err, string(bodyBytes))
		return
	}

	if resData.Choices[0].Message.Reasoning != "" {
		t.logger.Infof("[reasoning] %s", resData.Choices[0].Message.Reasoning)
	}

	replyText := strings.TrimSpace(resData.Choices[0].Message.Content)
	if strings.Contains(replyText, "</think>") {
		parts := strings.Split(replyText, "</think>")
		replyText = strings.TrimSpace(parts[len(parts)-1])
	}

	if replyText == "" {
		t.logger.Warnf("AI generated empty content (raw: %s)", string(bodyBytes))
		return
	}

	t.logger.Infof("AI drafted reply for %s using %s: %q", targetJID, model, replyText)

	ok, sendStatus, sentMsgID := sendWhatsAppMessage(t.client, t.messageStore, targetJID.String(), replyText, "", t.logger)
	t.logger.Infof("Sent AI reply to %s: ok=%v status=%s msgID=%s", targetJID, ok, sendStatus, sentMsgID)
	if ok && sentMsgID != "" {
		t.recordApiSent(sentMsgID)
		t.mu.Lock()
		if t.grantKind == "count" {
			if t.grantRemaining > 0 {
				t.grantRemaining--
			}
			if t.grantRemaining <= 0 {
				t.grantKind = "none"
				t.grantTargetJID = types.EmptyJID
			}
		}
		t.mu.Unlock()
	}
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
	if t.client == nil || !t.client.IsConnected() {
		return false, "tenant not connected", ""
	}
	ok, status, msgID := sendWhatsAppMessage(t.client, t.messageStore, recipient, message, "", t.logger)
	if ok && msgID != "" {
		t.recordApiSent(msgID)
	}
	return ok, status, msgID
}

func (t *Tenant) sendPollToRecipient(recipient, question string, options []string, selectableCount int) (bool, string, string) {
	if t.client == nil || !t.client.IsConnected() {
		return false, "tenant not connected", ""
	}
	return sendWhatsAppPoll(t.client, recipient, question, options, selectableCount)
}

func connectionsHandler(manager *TenantManager) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if !checkBridgeAuth(r) {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}
		rest := strings.TrimPrefix(r.URL.Path, "/api/connections/")
		parts := strings.Split(strings.TrimSuffix(rest, "/"), "/")
		hash := parts[0]
		if hash == "" {
			http.Error(w, "invalid hash", http.StatusBadRequest)
			return
		}
		sub := ""
		if len(parts) > 1 {
			sub = parts[1]
		}

		switch {
		case sub == "" && r.Method == http.MethodPost:
			var body struct {
				OwnerPhone        string      `json:"ownerPhone"`
				AllowedRecipients interface{} `json:"allowedRecipients"`
				AIApiKey          string      `json:"aiApiKey"`
				AIModel           string      `json:"aiModel"`
			}
			_ = json.NewDecoder(r.Body).Decode(&body)

			var recipients []string
			switch v := body.AllowedRecipients.(type) {
			case []interface{}:
				for _, item := range v {
					if s, ok := item.(string); ok && strings.TrimSpace(s) != "" {
						recipients = append(recipients, strings.TrimSpace(s))
					}
				}
			case []string:
				recipients = v
			case string:
				for _, part := range strings.Split(v, ",") {
					if trimmed := strings.TrimSpace(part); trimmed != "" {
						recipients = append(recipients, trimmed)
					}
				}
			}

			tenant := manager.Get(hash)
			if tenant == nil {
				tenant = &Tenant{
					Hash:       hash,
					logger:     waLog.Stdout(fmt.Sprintf("Tenant-%s", hash), "INFO", true),
					ownerPhone: body.OwnerPhone,
					recipients: recipients,
					aiApiKey:   body.AIApiKey,
					aiModel:    body.AIModel,
				}
				tenant.saveConfig()
				manager.Add(tenant)
			} else {
				if body.OwnerPhone != "" {
					tenant.ownerPhone = body.OwnerPhone
				}
				if len(recipients) > 0 {
					tenant.recipients = recipients
				}
				if body.AIApiKey != "" {
					tenant.aiApiKey = body.AIApiKey
				}
				if body.AIModel != "" {
					tenant.aiModel = body.AIModel
				}
				tenant.saveConfig()
			}
			qr, err := tenant.provision()
			if err != nil {
				w.Header().Set("Content-Type", "application/json")
				w.WriteHeader(http.StatusInternalServerError)
				json.NewEncoder(w).Encode(map[string]interface{}{"error": err.Error()})
				return
			}
			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(map[string]interface{}{
				"hash":     hash,
				"qr":       qr,
				"linked":   tenant.paired,
				"whatsapp": map[string]interface{}{"status": "pairing"},
			})
			return

		case sub == "status" && r.Method == http.MethodGet:
			tenant := manager.Get(hash)
			if tenant == nil {
				http.Error(w, "not found", http.StatusNotFound)
				return
			}
			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(tenant.status())
			return

		case sub == "messages" && r.Method == http.MethodGet:
			tenant := manager.Get(hash)
			if tenant == nil || tenant.messageStore == nil {
				http.Error(w, "not found", http.StatusNotFound)
				return
			}
			limit := 20
			if q := r.URL.Query().Get("limit"); q != "" {
				fmt.Sscanf(q, "%d", &limit)
			}
			msgs, err := tenant.messageStore.GetRecentMessages(limit)
			if err != nil {
				w.WriteHeader(http.StatusInternalServerError)
				json.NewEncoder(w).Encode(map[string]interface{}{"error": err.Error()})
				return
			}
			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(map[string]interface{}{"messages": msgs})
			return

		case sub == "qr" && r.Method == http.MethodGet:
			tenant := manager.Get(hash)
			if tenant == nil {
				http.Error(w, "not found", http.StatusNotFound)
				return
			}
			tenant.mu.Lock()
			qr := tenant.qrCode
			qrAge := int(time.Since(tenant.qrUpdated).Seconds())
			tenant.mu.Unlock()
			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(map[string]interface{}{"qr": qr, "qrAge": qrAge})
			return

		case sub == "grant" && r.Method == http.MethodPost:
			tenant := manager.Get(hash)
			if tenant == nil {
				http.Error(w, "not found", http.StatusNotFound)
				return
			}
			var body struct {
				Option  string `json:"option"`
				Contact string `json:"contact"`
			}
			if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
				http.Error(w, err.Error(), http.StatusBadRequest)
				return
			}
			tenant.applyWebGrant(body.Option, body.Contact)
			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(map[string]interface{}{"success": true, "status": tenant.status()})
			return

		case sub == "send" && r.Method == http.MethodPost:
			tenant := manager.Get(hash)
			if tenant == nil {
				http.Error(w, "not found", http.StatusNotFound)
				return
			}
			var body struct {
				Recipient string `json:"recipient"`
				Message   string `json:"message"`
			}
			if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
				http.Error(w, err.Error(), http.StatusBadRequest)
				return
			}
			if body.Recipient == "" || body.Message == "" {
				http.Error(w, "recipient and message required", http.StatusBadRequest)
				return
			}
			ok, statusStr, msgID := tenant.sendToRecipient(body.Recipient, body.Message)
			if !ok {
				w.Header().Set("Content-Type", "application/json")
				w.WriteHeader(http.StatusInternalServerError)
				json.NewEncoder(w).Encode(map[string]interface{}{"success": false, "error": statusStr})
				return
			}
			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(map[string]interface{}{
				"success":   true,
				"messageId": msgID,
				"status":    statusStr,
			})
			return

		default:
			http.NotFound(w, r)
		}
	}
}

func startMultiTenantServer(port int, logger waLog.Logger) {
	manager := NewTenantManager(logger)

	http.HandleFunc("/api/connections/", connectionsHandler(manager))

	addr := fmt.Sprintf("0.0.0.0:%d", port)
	logger.Infof("Multi-tenant bridge listening on %s", addr)

	srv := &http.Server{Addr: addr}
	go func() {
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			logger.Errorf("Server failed: %v", err)
		}
	}()

	sig := make(chan os.Signal, 1)
	signal.Notify(sig, os.Interrupt, syscall.SIGTERM)
	<-sig
	logger.Infof("Shutting down multi-tenant bridge...")
	_ = srv.Shutdown(context.Background())
}
