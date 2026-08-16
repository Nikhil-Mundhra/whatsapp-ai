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

	qrCode     string
	qrUpdated  time.Time
	paired     bool
	pairing    bool
	activePoll string

	// Takeover Grant State
	grantKind      string    // "none" | "count" | "duration"
	grantRemaining int       // count remaining
	grantExpiresAt time.Time // expiry for duration grant
	lastTargetJID  types.JID // target contact to reply to
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
		container, err := sqlstore.New(context.Background(), "sqlite3", "file:"+dbPath+"?_foreign_keys=on", dbLog)
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

func (t *Tenant) isAllowedRecipient(senderJID, chatJID types.JID) bool {
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

// setupEventHandler wires message and poll events for this tenant.
func (t *Tenant) setupEventHandler() {
	t.client.AddEventHandler(func(evt interface{}) {
		switch v := evt.(type) {
		case *events.Message:
			if v.Message.GetPollUpdateMessage() != nil {
				t.handleTenantPollVote(v)
			} else {
				handleMessage(t.client, t.messageStore, v, t.logger)

				sender := v.Info.Sender.User
				isAllowed := t.isAllowedRecipient(v.Info.Sender, v.Info.Chat)

				if v.Info.IsFromMe && isAllowed {
					t.mu.Lock()
					if t.grantKind != "none" {
						t.grantKind = "none"
						t.grantRemaining = 0
						t.logger.Infof("Owner sent manual message -> reset takeover grant for %s", t.Hash)
					}
					t.mu.Unlock()
					return
				}

				if !v.Info.IsFromMe && isAllowed {
					t.mu.Lock()
					t.lastTargetJID = v.Info.Chat
					activeGrant := false
					if t.grantKind == "duration" && time.Now().Before(t.grantExpiresAt) {
						activeGrant = true
					} else if t.grantKind == "count" && t.grantRemaining > 0 {
						t.grantRemaining--
						if t.grantRemaining == 0 {
							t.grantKind = "none"
						}
						activeGrant = true
					}
					t.mu.Unlock()

					if activeGrant {
						t.logger.Infof("Active takeover grant for %s -> drafting AI reply immediately", t.Hash)
						go t.replyToChat(v.Info.Chat)
					} else if t.ownerPhone != "" {
						chatName := GetChatName(context.Background(), t.client, t.messageStore, v.Info.Chat, v.Info.Chat.String(), nil, sender, t.logger)
						if chatName == "" || chatName == sender {
							chatName = sender
						}
						question := fmt.Sprintf("%s texted you. Take over?", chatName)
						options := []string{"Send 1 text", "5 minutes", "2 hours", "Deny"}
						ok, status, pollID := sendWhatsAppPoll(t.client, t.ownerPhone, question, options, 1)
						t.mu.Lock()
						t.activePoll = pollID
						t.mu.Unlock()
						fmt.Printf("\n[takeover %s] Sent approval poll to owner %s for incoming message from %s: ok=%v status=%s pollID=%s\n", t.Hash, t.ownerPhone, chatName, ok, status, pollID)

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
							resp, err := http.Post("https://whatsapp-ai-nikhil.vercel.app/api/polls", "application/json", bytes.NewReader(payload))
							if err == nil && resp != nil {
								_ = resp.Body.Close()
							}
						}(pollID, sender, chatName, question, options)
					}
				}
			}
		case *events.HistorySync:
			handleHistorySync(t.client, t.messageStore, v, t.logger)
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
	})
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
		switch choice {
		case "Send 1 text":
			t.grantKind = "count"
			t.grantRemaining = 1
			t.logger.Infof("Takeover granted for %s: 1 text", t.Hash)
			t.mu.Unlock()
			go t.replyToChat(targetJID)
		case "5 minutes":
			t.grantKind = "duration"
			t.grantExpiresAt = time.Now().Add(5 * time.Minute)
			t.logger.Infof("Takeover granted for %s: 5 minutes (until %s)", t.Hash, t.grantExpiresAt.Format("15:04:05"))
			t.mu.Unlock()
			go t.replyToChat(targetJID)
		case "2 hours":
			t.grantKind = "duration"
			t.grantExpiresAt = time.Now().Add(2 * time.Hour)
			t.logger.Infof("Takeover granted for %s: 2 hours (until %s)", t.Hash, t.grantExpiresAt.Format("15:04:05"))
			t.mu.Unlock()
			go t.replyToChat(targetJID)
		case "Deny":
			t.grantKind = "none"
			t.grantRemaining = 0
			t.logger.Infof("Takeover denied for %s", t.Hash)
			t.mu.Unlock()
		default:
			t.mu.Unlock()
		}
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

	var historyBuilder strings.Builder
	for i := len(msgs) - 1; i >= 0; i-- {
		m := msgs[i]
		prefix := "From: " + m.Sender
		if m.IsFromMe {
			prefix = "From: Me"
		}
		historyBuilder.WriteString(fmt.Sprintf("%s: %s\n", prefix, m.Content))
	}
	history := historyBuilder.String()

	systemPrompt := `You are the person who writes the messages labeled 'From: Me' in the conversation history below. That is your own writing style: mirror your own message length, tone, capitalization, punctuation, slang, and emoji usage. If your messages are one-liners, reply with one-liners. If you use emojis, use emojis; if you don't, don't. Stay in the same language you use. Do NOT copy or mirror the other person's style.

READ THE ROOM:
- The last message from the other person is the one you are replying to. Answer what THEY just said and stay on that topic. Never reply with a generic or off-topic one-liner.
- Never repeat a message you already sent in the history, and never send the same text twice in a row.
- Never continue your own monologue: if the other person has not spoken since your last message, you have nothing to reply to.
- Reply naturally and human. Don't mention that you're an AI. Don't use markdown. Output only the message text and nothing else.`

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
		Enabled bool `json:"enabled"`
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
				ok, sendStatus := sendWhatsAppMessage(t.client, t.messageStore, targetJID.String(), replyText, "", t.logger)
				t.logger.Infof("Sent Gemini reply to %s: ok=%v status=%s", targetJID, ok, sendStatus)
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
			MaxTokens: 250,
		}
	} else if strings.HasPrefix(apiKey, "gsk_") {
		// 3. Groq
		endpoint = "https://api.groq.com/openai/v1/chat/completions"
		reqBody = RequestBody{
			Model:     model,
			Messages:  messages,
			MaxTokens: 250,
		}
	} else {
		// 4. OpenRouter (default)
		reqBody = RequestBody{
			Model:     model,
			Messages:  messages,
			MaxTokens: 250,
			Reasoning: &Reasoning{Enabled: true},
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
				Content string `json:"content"`
			} `json:"message"`
		} `json:"choices"`
	}
	if err := json.Unmarshal(bodyBytes, &resData); err != nil || len(resData.Choices) == 0 {
		t.logger.Errorf("Failed to parse AI response: %v (raw: %s)", err, string(bodyBytes))
		return
	}

	replyText := strings.TrimSpace(resData.Choices[0].Message.Content)
	if replyText == "" {
		t.logger.Warnf("AI generated empty content")
		return
	}

	t.logger.Infof("AI drafted reply for %s using %s: %q", targetJID, model, replyText)

	ok, sendStatus := sendWhatsAppMessage(t.client, t.messageStore, targetJID.String(), replyText, "", t.logger)
	t.logger.Infof("Sent AI reply to %s: ok=%v status=%s", targetJID, ok, sendStatus)
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
	container, err := sqlstore.New(context.Background(), "sqlite3", "file:"+filepath.Join(dir, "whatsapp.db")+"?_foreign_keys=on", dbLog)
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
	qrChan, _ := t.client.GetQRChannel(context.Background())
	if err := t.client.Connect(); err != nil {
		t.logger.Errorf("Failed to connect for QR channel: %v", err)
		return
	}
	for evt := range qrChan {
		switch evt.Event {
		case "code":
			t.mu.Lock()
			t.qrCode = evt.Code
			t.qrUpdated = time.Now()
			t.mu.Unlock()
			fmt.Printf("\nScan this QR code to link tenant %s:\n", t.Hash)
			qrterminal.GenerateHalfBlock(evt.Code, qrterminal.L, os.Stdout)
		case "success":
			t.mu.Lock()
			t.paired = true
			t.pairing = false
			t.qrCode = ""
			t.mu.Unlock()
			t.logger.Infof("Tenant %s paired successfully", t.Hash)
			return
		case "timeout":
			t.logger.Warnf("Tenant %s QR pairing timed out", t.Hash)
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

func (t *Tenant) sendToRecipient(recipient, message string) (bool, string) {
	if t.client == nil || !t.client.IsConnected() {
		return false, "tenant not connected"
	}
	return sendWhatsAppMessage(t.client, t.messageStore, recipient, message, "", t.logger)
}

func (t *Tenant) sendPollToRecipient(recipient, question string, options []string, selectableCount int) (bool, string, string) {
	if t.client == nil || !t.client.IsConnected() {
		return false, "tenant not connected", ""
	}
	return sendWhatsAppPoll(t.client, recipient, question, options, selectableCount)
}

func startMultiTenantServer(port int, logger waLog.Logger) {
	manager := NewTenantManager(logger)

	http.HandleFunc("/api/connections/", func(w http.ResponseWriter, r *http.Request) {
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

		default:
			http.NotFound(w, r)
		}
	})

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
