package bridge

import (
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	waProto "go.mau.fi/whatsmeow/binary/proto"
	"go.mau.fi/whatsmeow/types"
	"go.mau.fi/whatsmeow/types/events"
	waLog "go.mau.fi/whatsmeow/util/log"
	googleProto "google.golang.org/protobuf/proto"
)

func TestGetWebhookBaseURL(t *testing.T) {
	origWeb := os.Getenv("WEB_BASE_URL")
	origPanel := os.Getenv("PANEL_URL")
	defer func() {
		os.Setenv("WEB_BASE_URL", origWeb)
		os.Setenv("PANEL_URL", origPanel)
	}()

	// 1. WEB_BASE_URL set
	os.Setenv("WEB_BASE_URL", "https://custom-webhook.com/")
	os.Setenv("PANEL_URL", "")
	if got := getWebhookBaseURL(); got != "https://custom-webhook.com" {
		t.Errorf("expected 'https://custom-webhook.com', got %q", got)
	}

	// 2. PANEL_URL set
	os.Setenv("WEB_BASE_URL", "")
	os.Setenv("PANEL_URL", "https://panel-webhook.com///")
	if got := getWebhookBaseURL(); got != "https://panel-webhook.com" {
		t.Errorf("expected 'https://panel-webhook.com', got %q", got)
	}

	// 3. Neither set (default)
	os.Setenv("WEB_BASE_URL", "")
	os.Setenv("PANEL_URL", "")
	if got := getWebhookBaseURL(); got != "https://whatsapp-ai-nikhil.vercel.app" {
		t.Errorf("expected default URL, got %q", got)
	}
}

func TestCheckBridgeAuth_Cases(t *testing.T) {
	origToken := os.Getenv("BRIDGE_AUTH_TOKEN")
	defer os.Setenv("BRIDGE_AUTH_TOKEN", origToken)

	// 1. Token unset -> always true
	os.Setenv("BRIDGE_AUTH_TOKEN", "")
	req := httptest.NewRequest(http.MethodGet, "/api/test", nil)
	if !checkBridgeAuth(req) {
		t.Error("expected true when BRIDGE_AUTH_TOKEN is unset")
	}

	// 2. Token set -> check Authorization header
	os.Setenv("BRIDGE_AUTH_TOKEN", "secret_token_123")
	reqAuth := httptest.NewRequest(http.MethodGet, "/api/test", nil)
	reqAuth.Header.Set("Authorization", "Bearer secret_token_123")
	if !checkBridgeAuth(reqAuth) {
		t.Error("expected true with valid Authorization header")
	}

	// 3. Token set -> check X-Bridge-Token header
	reqX := httptest.NewRequest(http.MethodGet, "/api/test", nil)
	reqX.Header.Set("X-Bridge-Token", "secret_token_123")
	if !checkBridgeAuth(reqX) {
		t.Error("expected true with valid X-Bridge-Token header")
	}

	// 4. Token set -> invalid or missing header
	reqBad := httptest.NewRequest(http.MethodGet, "/api/test", nil)
	reqBad.Header.Set("Authorization", "Bearer wrong_token")
	if checkBridgeAuth(reqBad) {
		t.Error("expected false with invalid token")
	}

	reqMissing := httptest.NewRequest(http.MethodGet, "/api/test", nil)
	if checkBridgeAuth(reqMissing) {
		t.Error("expected false with missing auth header")
	}
}

func TestTenantConfigAndDirectory(t *testing.T) {
	tmpDir, err := os.MkdirTemp("", "tenant_cfg_test")
	if err != nil {
		t.Fatalf("failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tmpDir)

	// Create store/tenants inside current workspace or mock dir
	tenant := &Tenant{
		Hash:                          "testhash123",
		ownerPhone:                    "+15551234567",
		recipients:                    []string{"+15559876543", "Family Group"},
		aiApiKey:                      "sk-test-key",
		aiModel:                       "gpt-4o",
		voiceNoteTranscriptionEnabled: false,
		groqApiKey:                    "gsk_my_groq_key",
		visionEnabled:                 true,
		visionApiKey:                  "AIza_my_gemini_key",
		visionModel:                   "gemini-2.0-flash",
	}

	// Ensure directory exists for configFile
	_ = os.MkdirAll(tenant.dir(), 0755)
	defer os.RemoveAll(filepath.Join("store", "tenants", tenant.Hash))

	tenant.saveConfig()

	// Verify config file was written
	cfgPath := tenant.configFile()
	if _, err := os.Stat(cfgPath); os.IsNotExist(err) {
		t.Fatalf("expected config file %s to exist", cfgPath)
	}

	// Reload into a new tenant instance
	loaded := &Tenant{Hash: "testhash123"}
	loaded.loadConfig()

	if loaded.ownerPhone != tenant.ownerPhone {
		t.Errorf("ownerPhone mismatch: %s vs %s", loaded.ownerPhone, tenant.ownerPhone)
	}
	if len(loaded.recipients) != len(tenant.recipients) || loaded.recipients[0] != tenant.recipients[0] {
		t.Errorf("recipients mismatch: %v vs %v", loaded.recipients, tenant.recipients)
	}
	if loaded.aiApiKey != tenant.aiApiKey {
		t.Errorf("aiApiKey mismatch: %s vs %s", loaded.aiApiKey, tenant.aiApiKey)
	}
	if loaded.aiModel != tenant.aiModel {
		t.Errorf("aiModel mismatch: %s vs %s", loaded.aiModel, tenant.aiModel)
	}
	if loaded.voiceNoteTranscriptionEnabled != tenant.voiceNoteTranscriptionEnabled {
		t.Errorf("voiceNoteTranscriptionEnabled mismatch: %v vs %v", loaded.voiceNoteTranscriptionEnabled, tenant.voiceNoteTranscriptionEnabled)
	}
	if loaded.groqApiKey != tenant.groqApiKey {
		t.Errorf("groqApiKey mismatch: %s vs %s", loaded.groqApiKey, tenant.groqApiKey)
	}
	if loaded.visionEnabled != tenant.visionEnabled {
		t.Errorf("visionEnabled mismatch: %v vs %v", loaded.visionEnabled, tenant.visionEnabled)
	}
	if loaded.visionApiKey != tenant.visionApiKey {
		t.Errorf("visionApiKey mismatch: %s vs %s", loaded.visionApiKey, tenant.visionApiKey)
	}
	if loaded.visionModel != tenant.visionModel {
		t.Errorf("visionModel mismatch: %s vs %s", loaded.visionModel, tenant.visionModel)
	}
}

func TestNormalizePhone(t *testing.T) {
	if got := normalizePhone("+1 (555) 123-4567"); got != "15551234567" {
		t.Errorf("normalizePhone failed: %s", got)
	}
	if got := normalizePhone("91-7060410033"); got != "917060410033" {
		t.Errorf("normalizePhone failed: %s", got)
	}
	if got := normalizePhone("abc"); got != "" {
		t.Errorf("normalizePhone failed on non-digits: %s", got)
	}
}

func TestTenantManager_Basic(t *testing.T) {
	mgr := NewTenantManager(waLog.Noop)
	if mgr == nil {
		t.Fatal("NewTenantManager returned nil")
	}

	t1 := &Tenant{Hash: "hash1", ownerPhone: "111"}
	mgr.Add(t1)

	got := mgr.Get("hash1")
	if got != t1 {
		t.Errorf("expected tenant t1, got %v", got)
	}

	if mgr.Get("nonexistent") != nil {
		t.Errorf("expected nil for nonexistent hash")
	}
}

func TestTenant_IsAllowedRecipient_AllBranches(t *testing.T) {
	client, dev, tmpDirClient := createTestClient(t)
	defer os.RemoveAll(tmpDirClient)

	store, tmpDirStore := createTestMessageStore(t)
	defer os.RemoveAll(tmpDirStore)
	defer store.Close()

	tenant := &Tenant{
		Hash:         "testhash",
		logger:       waLog.Noop,
		client:       client,
		messageStore: store,
		recipients:   []string{"+15551112222", "12345-67890@g.us", "Cool Friends Group"},
	}

	// 1. Takeover Grant: Active duration grant
	targetJID := types.NewJID("15559990000", "s.whatsapp.net")
	tenant.grantKind = "duration"
	tenant.grantExpiresAt = time.Now().Add(5 * time.Minute)
	tenant.grantTargetJID = targetJID

	senderJID := types.NewJID("15559990000", "s.whatsapp.net")
	chatJID := types.NewJID("15559990000", "s.whatsapp.net")
	if !tenant.isAllowedRecipient(senderJID, chatJID) {
		t.Error("expected allowed for active duration takeover grant")
	}

	// 2. Takeover Grant: Expired duration grant -> falls through
	tenant.grantExpiresAt = time.Now().Add(-1 * time.Minute)
	unlistedJID := types.NewJID("15559990000", "s.whatsapp.net")
	if tenant.isAllowedRecipient(unlistedJID, unlistedJID) {
		t.Error("expected not allowed for expired duration grant")
	}

	// 3. Takeover Grant: Active count grant
	tenant.grantKind = "count"
	tenant.grantRemaining = 1
	tenant.grantTargetJID = targetJID
	if !tenant.isAllowedRecipient(senderJID, chatJID) {
		t.Error("expected allowed for active count takeover grant")
	}

	// 4. Takeover Grant: Count grant 0 remaining -> falls through
	tenant.grantRemaining = 0
	if tenant.isAllowedRecipient(unlistedJID, unlistedJID) {
		t.Error("expected not allowed for count grant remaining = 0")
	}

	// Reset grant
	tenant.grantKind = "none"
	tenant.grantTargetJID = types.EmptyJID

	// 5. Group chat: Match exact group JID
	groupJID := types.NewJID("12345-67890", "g.us")
	if !tenant.isAllowedRecipient(types.NewJID("someone", "s.whatsapp.net"), groupJID) {
		t.Error("expected allowed for group matching exact JID")
	}

	// 6. Group chat: Match group name
	namedGroupJID := types.NewJID("88888-99999", "g.us")
	_ = store.StoreChat(namedGroupJID.String(), "Cool Friends Group", time.Now())
	if !tenant.isAllowedRecipient(types.NewJID("someone", "s.whatsapp.net"), namedGroupJID) {
		t.Error("expected allowed for group matching group name")
	}

	// 7. Group chat: Non-matching group
	unknownGroupJID := types.NewJID("99999-00000", "g.us")
	if tenant.isAllowedRecipient(types.NewJID("someone", "s.whatsapp.net"), unknownGroupJID) {
		t.Error("expected not allowed for unknown group")
	}

	// 8. Individual chat: Exact phone match
	allowedContact := types.NewJID("15551112222", "s.whatsapp.net")
	if !tenant.isAllowedRecipient(allowedContact, allowedContact) {
		t.Error("expected allowed for exact recipient phone match")
	}

	// 9. Individual chat: LID to PN mapping
	lidStore := dev.LIDs.(*mockLIDStore)
	lidSender := types.NewJID("lid_user_1", "lid")
	pnSender := types.NewJID("15551112222", "s.whatsapp.net")
	lidStore.lidToPN[lidSender] = pnSender
	if !tenant.isAllowedRecipient(lidSender, lidSender) {
		t.Error("expected allowed for LID mapping to allowed PN")
	}

	// 10. Individual chat: Recipient configured as PN whose LID matches sender
	tenant.recipients = []string{"15553334444"}
	pnJID := types.NewJID("15553334444", "s.whatsapp.net")
	lidJID := types.NewJID("lid_user_2", "lid")
	lidStore.pnToLID[pnJID] = lidJID
	if !tenant.isAllowedRecipient(lidJID, lidJID) {
		t.Error("expected allowed when recipient PN translates to sender's LID")
	}

	// 11. Individual chat: Suffix matching (e.g. "+15553334444" vs "5553334444")
	suffixSender := types.NewJID("5553334444", "s.whatsapp.net")
	if !tenant.isAllowedRecipient(suffixSender, suffixSender) {
		t.Error("expected allowed for suffix phone match")
	}

	// 12. Non-matching individual
	randomContact := types.NewJID("19999999999", "s.whatsapp.net")
	if tenant.isAllowedRecipient(randomContact, randomContact) {
		t.Error("expected false for random unlisted contact")
	}

	// 13. Whitelist with BOTH phone number AND @lid of same contact: ensure random contacts are strictly REJECTED
	tenant.recipients = []string{"+15553334444", "lid_user_2@lid"}
	if tenant.isAllowedRecipient(randomContact, randomContact) {
		t.Error("expected false for random contact when whitelist has both PN and LID of allowed contact")
	}

	// 14. Group chat when group is unlisted: ensure group messages are rejected even if individual in group matches suffix
	unlistedGroup := types.NewJID("12036302839281", "g.us")
	if tenant.isAllowedRecipient(randomContact, unlistedGroup) {
		t.Error("expected false for message in unlisted group")
	}
}

func TestTenant_ResolveContactName_AllBranches(t *testing.T) {
	client, dev, tmpDirClient := createTestClient(t)
	defer os.RemoveAll(tmpDirClient)

	store, tmpDirStore := createTestMessageStore(t)
	defer os.RemoveAll(tmpDirStore)
	defer store.Close()

	tenant := &Tenant{
		Hash:         "testhash",
		logger:       waLog.Noop,
		client:       client,
		messageStore: store,
	}

	// 1. PushName directly on message (non-numeric)
	msg1 := &events.Message{
		Info: types.MessageInfo{
			MessageSource: types.MessageSource{
				Sender: types.NewJID("123", "s.whatsapp.net"),
				Chat:   types.NewJID("123", "s.whatsapp.net"),
			},
			PushName: "AlicePush",
		},
	}
	if got := tenant.resolveContactName(msg1); got != "AlicePush" {
		t.Errorf("expected 'AlicePush', got %q", got)
	}

	// 2. Contacts store FullName via LID lookup
	lidStore := dev.LIDs.(*mockLIDStore)
	cStore := dev.Contacts.(*mockContactStore)
	lidJID := types.NewJID("lid_bob", "lid")
	pnJID := types.NewJID("15551234567", "s.whatsapp.net")
	lidStore.lidToPN[lidJID] = pnJID
	cStore.contacts[pnJID] = types.ContactInfo{FullName: "Bob Builder"}

	msg2 := &events.Message{
		Info: types.MessageInfo{
			MessageSource: types.MessageSource{
				Sender: lidJID,
				Chat:   lidJID,
			},
		},
	}
	if got := tenant.resolveContactName(msg2); got != "Bob Builder" {
		t.Errorf("expected 'Bob Builder', got %q", got)
	}

	// 3. Contacts store BusinessName
	contactBiz := types.NewJID("15550001111", "s.whatsapp.net")
	cStore.contacts[contactBiz] = types.ContactInfo{BusinessName: "Corporate Inc"}
	msg3 := &events.Message{
		Info: types.MessageInfo{
			MessageSource: types.MessageSource{
				Sender: contactBiz,
				Chat:   contactBiz,
			},
		},
	}
	if got := tenant.resolveContactName(msg3); got != "Corporate Inc" {
		t.Errorf("expected 'Corporate Inc', got %q", got)
	}

	// 4. Contacts store PushName
	contactPush := types.NewJID("15550002222", "s.whatsapp.net")
	cStore.contacts[contactPush] = types.ContactInfo{PushName: "Charlie Contact"}
	msg4 := &events.Message{
		Info: types.MessageInfo{
			MessageSource: types.MessageSource{
				Sender: contactPush,
				Chat:   contactPush,
			},
		},
	}
	if got := tenant.resolveContactName(msg4); got != "Charlie Contact" {
		t.Errorf("expected 'Charlie Contact', got %q", got)
	}

	// 5. MessageStore chats table name (1-on-1 chat)
	dbChatJID := types.NewJID("15550003333", "s.whatsapp.net")
	_ = store.StoreChat(dbChatJID.String(), "DB Saved Name", time.Now())
	msg5 := &events.Message{
		Info: types.MessageInfo{
			MessageSource: types.MessageSource{
				Sender: dbChatJID,
				Chat:   dbChatJID,
			},
		},
	}
	if got := tenant.resolveContactName(msg5); got != "DB Saved Name" {
		t.Errorf("expected 'DB Saved Name', got %q", got)
	}

	// 6. LID with known PN fallback ("+<phone>")
	lidUnknown := types.NewJID("lid_unknown", "lid")
	pnOnly := types.NewJID("15559998888", "s.whatsapp.net")
	lidStore.lidToPN[lidUnknown] = pnOnly
	msg6 := &events.Message{
		Info: types.MessageInfo{
			MessageSource: types.MessageSource{
				Sender: lidUnknown,
				Chat:   lidUnknown,
			},
		},
	}
	if got := tenant.resolveContactName(msg6); got != "+15559998888" {
		t.Errorf("expected '+15559998888', got %q", got)
	}

	// 7. Sender User fallback
	rawSender := types.NewJID("raw_user_123", "s.whatsapp.net")
	msg7 := &events.Message{
		Info: types.MessageInfo{
			MessageSource: types.MessageSource{
				Sender: rawSender,
				Chat:   rawSender,
			},
		},
	}
	if got := tenant.resolveContactName(msg7); got != "raw_user_123" {
		t.Errorf("expected 'raw_user_123', got %q", got)
	}

	// 8. Empty sender fallback "Contact"
	msg8 := &events.Message{
		Info: types.MessageInfo{
			MessageSource: types.MessageSource{
				Sender: types.EmptyJID,
				Chat:   types.EmptyJID,
			},
		},
	}
	if got := tenant.resolveContactName(msg8); got != "Contact" {
		t.Errorf("expected 'Contact', got %q", got)
	}

	// 9. Group chat message: ensure group name is NEVER returned as sender's contact name
	groupJID := types.NewJID("1203630000000", "g.us")
	_ = store.StoreChat(groupJID.String(), "TotalMathematics Group", time.Now())
	groupMsg := &events.Message{
		Info: types.MessageInfo{
			MessageSource: types.MessageSource{
				Sender: types.NewJID("15557778888", "s.whatsapp.net"),
				Chat:   groupJID,
			},
		},
	}
	if got := tenant.resolveContactName(groupMsg); got == "TotalMathematics Group" {
		t.Errorf("expected sender JID or contact name, but got group title: %q", got)
	}
}

func TestTenant_IsGroupMessageDirectedToOwner(t *testing.T) {
	client, dev, tmpDirClient := createTestClient(t)
	defer os.RemoveAll(tmpDirClient)

	tenant := &Tenant{
		Hash:       "testhash",
		logger:     waLog.Noop,
		client:     client,
		ownerPhone: "+15551234567",
	}
	dev.PushName = "Nikhil Mundhra"

	// 1. nil message
	if ok, _ := tenant.isGroupMessageDirectedToOwner(nil); ok {
		t.Error("expected false for nil message")
	}

	// 2. Mentioned JID in ContextInfo matching owner phone
	msgMention := &events.Message{
		Message: &waProto.Message{
			ExtendedTextMessage: &waProto.ExtendedTextMessage{
				Text: googleProto.String("Hey @15551234567"),
				ContextInfo: &waProto.ContextInfo{
					MentionedJID: []string{"15551234567@s.whatsapp.net"},
				},
			},
		},
	}
	ok, reason := tenant.isGroupMessageDirectedToOwner(msgMention)
	if !ok || reason != "mentioned you" {
		t.Errorf("expected mentioned you, got ok=%v, reason=%s", ok, reason)
	}

	// 3. Participant reply quote in ContextInfo matching owner phone
	msgReply := &events.Message{
		Message: &waProto.Message{
			ExtendedTextMessage: &waProto.ExtendedTextMessage{
				Text: googleProto.String("Yes exactly"),
				ContextInfo: &waProto.ContextInfo{
					Participant: googleProto.String("15551234567@s.whatsapp.net"),
				},
			},
		},
	}
	ok, reason = tenant.isGroupMessageDirectedToOwner(msgReply)
	if !ok || reason != "replied to you" {
		t.Errorf("expected replied to you, got ok=%v, reason=%s", ok, reason)
	}

	// 4. Text content mentioning owner first name
	msgName := &events.Message{
		Message: &waProto.Message{
			Conversation: googleProto.String("Hey nikhil how are you?"),
		},
	}
	ok, reason = tenant.isGroupMessageDirectedToOwner(msgName)
	if !ok || !strings.Contains(reason, "mentioned") {
		t.Errorf("expected name mention trigger, got ok=%v, reason=%s", ok, reason)
	}

	// 5. Undirected background chat message
	msgBackground := &events.Message{
		Message: &waProto.Message{
			Conversation: googleProto.String("Anyone wants pizza for lunch?"),
		},
	}
	ok, _ = tenant.isGroupMessageDirectedToOwner(msgBackground)
	if ok {
		t.Error("expected false for undirected background chatter")
	}
}

func TestTenant_ApplyWebGrant_AllOptions(t *testing.T) {
	tenant := &Tenant{
		Hash:   "testhash",
		logger: waLog.Noop,
	}

	// 1. "1 text" / "send 1 text" with JID contact
	contactJID := "15551234567@s.whatsapp.net"
	tenant.applyWebGrant("send 1 text", contactJID)
	if tenant.grantKind != "count" || tenant.grantRemaining != 1 || tenant.grantTargetJID.String() != contactJID {
		t.Errorf("unexpected 1 text grant: kind=%s, rem=%d, target=%s", tenant.grantKind, tenant.grantRemaining, tenant.grantTargetJID)
	}

	// 2. "5 minutes" with raw phone contact
	tenant.applyWebGrant("5 minutes", "+1 (555) 987-6543")
	if tenant.grantKind != "duration" || time.Until(tenant.grantExpiresAt) > 6*time.Minute || tenant.grantTargetJID.User != "15559876543" {
		t.Errorf("unexpected 5 min grant: kind=%s, target=%s", tenant.grantKind, tenant.grantTargetJID)
	}

	// 3. "2 hours" with blank contact (falls back to lastTargetJID)
	tenant.applyWebGrant("2 hours", "")
	if tenant.grantKind != "duration" || time.Until(tenant.grantExpiresAt) < 110*time.Minute || tenant.grantTargetJID.User != "15559876543" {
		t.Errorf("unexpected 2 hours grant: kind=%s, target=%s", tenant.grantKind, tenant.grantTargetJID)
	}

	// 4. "deny"
	tenant.applyWebGrant("deny", "")
	if tenant.grantKind != "none" || tenant.grantRemaining != 0 || !tenant.grantTargetJID.IsEmpty() {
		t.Errorf("unexpected deny result: kind=%s, target=%s", tenant.grantKind, tenant.grantTargetJID)
	}

	// 5. Unknown option (no-op)
	tenant.applyWebGrant("some random text", "")
	if tenant.grantKind != "none" {
		t.Errorf("expected no change for unknown option")
	}
}

func TestTenant_StatusAndApiSent(t *testing.T) {
	tenant := &Tenant{
		Hash:       "hash777",
		ownerPhone: "+15551234567",
		recipients: []string{"+15559998888"},
		aiModel:    "gpt-4o",
		aiApiKey:   "sk-key",
		paired:     true,
		pairing:    false,
		qrCode:     "fake_qr_code",
		qrUpdated:  time.Now(),
	}

	st := tenant.status()
	if st["hash"] != "hash777" || st["linked"] != true || st["hasQR"] != true || st["aiModel"] != "gpt-4o" || st["aiApiKeySet"] != true {
		t.Errorf("unexpected status map: %+v", st)
	}

	// Test recordApiSent and isApiSent
	if tenant.isApiSent("msg_123") {
		t.Error("expected false for unrecorded message")
	}
	tenant.recordApiSent("msg_123")
	if !tenant.isApiSent("msg_123") {
		t.Error("expected true for recorded message")
	}
	// Empty message ID handling
	tenant.recordApiSent("")
	if tenant.isApiSent("") {
		t.Error("expected false for empty message ID")
	}
}

func TestTenant_SendHelpers_Disconnected(t *testing.T) {
	tenant := &Tenant{
		Hash:   "hash_disc",
		logger: waLog.Noop,
	}

	ok, statusStr, msgID := tenant.sendToRecipient("12345", "hello")
	if ok || statusStr != "tenant not connected" || msgID != "" {
		t.Errorf("expected tenant not connected error, got ok=%v, status=%s", ok, statusStr)
	}

	ok, statusStr, pollID := tenant.sendPollToRecipient("12345", "Q?", []string{"A", "B"}, 1)
	if ok || statusStr != "tenant not connected" || pollID != "" {
		t.Errorf("expected tenant not connected error, got ok=%v, status=%s", ok, statusStr)
	}

	tenant.disconnect()
}

func TestTenant_HandleTenantPollVote_And_HistorySync(t *testing.T) {
	client, _, tmpDirClient := createTestClient(t)
	defer os.RemoveAll(tmpDirClient)

	store, tmpDirStore := createTestMessageStore(t)
	defer os.RemoveAll(tmpDirStore)
	defer store.Close()

	tenant := &Tenant{
		Hash:         "hash_vote",
		logger:       waLog.Noop,
		client:       client,
		messageStore: store,
		ownerPhone:   "+15551234567",
		recipients:   []string{"+15559998888"},
	}

	// 1. handleTenantPollVote on non-poll message
	msgNoPoll := &events.Message{
		Info:    types.MessageInfo{ID: "msg1"},
		Message: &waProto.Message{Conversation: googleProto.String("plain")},
	}
	tenant.handleTenantPollVote(msgNoPoll)

	// 2. handleTenantPollVote on poll message with disconnected client (safe decrypt fail)
	msgPoll := &events.Message{
		Info: types.MessageInfo{ID: "poll1", Timestamp: time.Now()},
		Message: &waProto.Message{
			PollUpdateMessage: &waProto.PollUpdateMessage{
				PollCreationMessageKey: &waProto.MessageKey{
					ID: googleProto.String("poll_creation_id"),
				},
			},
		},
	}
	tenant.handleTenantPollVote(msgPoll)

	// 3. handleTenantHistorySync: nil or empty
	tenant.handleTenantHistorySync(nil)
	tenant.handleTenantHistorySync(&events.HistorySync{Data: &waProto.HistorySync{}})

	// 4. handleTenantHistorySync: targeted recipient chat
	targetChatJID := "15559998888@s.whatsapp.net"
	nonTargetChatJID := "15550000000@s.whatsapp.net"
	ts := uint64(time.Now().Unix())
	msgID1 := "thist1"
	isFromMeFalse := false

	hsData := &events.HistorySync{
		Data: &waProto.HistorySync{
			Conversations: []*waProto.Conversation{
				nil,
				{ID: nil},
				{
					ID: &nonTargetChatJID, // Should be skipped (not allowed and not owner)
					Messages: []*waProto.HistorySyncMsg{
						{
							Message: &waProto.WebMessageInfo{
								MessageTimestamp: googleProto.Uint64(ts),
								Key:              &waProto.MessageKey{ID: &msgID1},
								Message:          &waProto.Message{Conversation: googleProto.String("Ignored")},
							},
						},
					},
				},
				{
					ID: &targetChatJID, // Targeted -> should be stored!
					Messages: []*waProto.HistorySyncMsg{
						{
							Message: &waProto.WebMessageInfo{
								MessageTimestamp: googleProto.Uint64(ts),
								Key: &waProto.MessageKey{
									ID:     &msgID1,
									FromMe: &isFromMeFalse,
								},
								Message: &waProto.Message{Conversation: googleProto.String("Targeted message")},
							},
						},
					},
				},
			},
		},
	}

	tenant.handleTenantHistorySync(hsData)

	msgs, err := store.GetMessages(targetChatJID, 10)
	if err != nil || len(msgs) != 1 {
		t.Fatalf("expected 1 targeted history message stored, got %d (err=%v)", len(msgs), err)
	}
	if msgs[0].Content != "Targeted message" {
		t.Errorf("expected 'Targeted message', got %q", msgs[0].Content)
	}

	// Verify non-targeted was skipped
	msgsIgnored, _ := store.GetMessages(nonTargetChatJID, 10)
	if len(msgsIgnored) != 0 {
		t.Errorf("expected non-targeted messages to be skipped, got %d", len(msgsIgnored))
	}
}

func TestTenant_HandleEvent_AllCases(t *testing.T) {
	client, dev, tmpDirClient := createTestClient(t)
	defer os.RemoveAll(tmpDirClient)

	store, tmpDirStore := createTestMessageStore(t)
	defer os.RemoveAll(tmpDirStore)
	defer store.Close()

	tenantDir, _ := os.MkdirTemp("", "tenant_event_dir")
	defer os.RemoveAll(tenantDir)

	tenant := &Tenant{
		Hash:         "hash_evt",
		logger:       waLog.Noop,
		client:       client,
		messageStore: store,
		ownerPhone:   "+15551234567",
		recipients:   []string{"+15559998888", "12345-67890@g.us"},
		paired:       true,
		pairing:      false,
	}

	// 1. setupEventHandler
	tenant.setupEventHandler()

	// 2. PollUpdateMessage event
	msgPoll := &events.Message{
		Info: types.MessageInfo{ID: "poll_evt_1"},
		Message: &waProto.Message{
			PollUpdateMessage: &waProto.PollUpdateMessage{},
		},
	}
	tenant.handleEvent(msgPoll)

	// 3. Outbound message that was API-sent (isApiSent = true) -> ignored
	tenant.recordApiSent("api_msg_echo")
	msgApiEcho := &events.Message{
		Info: types.MessageInfo{
			MessageSource: types.MessageSource{
				Chat:     types.NewJID("15559998888", "s.whatsapp.net"),
				Sender:   types.NewJID("15551234567", "s.whatsapp.net"),
				IsFromMe: true,
			},
			ID:        "api_msg_echo",
			Timestamp: time.Now(),
		},
		Message: &waProto.Message{Conversation: googleProto.String("API outbound")},
	}
	tenant.handleEvent(msgApiEcho)

	// 4. Outbound manual message by owner to allowed contact -> updates conversation session & preserves active poll
	if tenant.activePollsByRecipient == nil {
		tenant.activePollsByRecipient = make(map[string]string)
	}
	tenant.activePollsByRecipient["15559998888"] = "old_poll_to_delete"

	msgManual := &events.Message{
		Info: types.MessageInfo{
			MessageSource: types.MessageSource{
				Chat:     types.NewJID("15559998888", "s.whatsapp.net"),
				Sender:   types.NewJID("15551234567", "s.whatsapp.net"),
				IsFromMe: true,
			},
			ID:        "manual_msg_1",
			Timestamp: time.Now(),
		},
		Message: &waProto.Message{Conversation: googleProto.String("Manual owner text")},
	}
	tenant.handleEvent(msgManual)

	if tenant.activePollsByRecipient["15559998888"] != "old_poll_to_delete" {
		t.Errorf("expected takeover poll preserved during active conversation, got %s", tenant.activePollsByRecipient["15559998888"])
	}
	if tenant.lastManualTextTimeByRecipient["15559998888"].IsZero() {
		t.Errorf("expected lastManualTextTime to be updated on manual text")
	}

	// 5. Outbound manual message to self-chat (recipientKey == ownerPhone) -> does not reset takeover
	tenant.grantKind = "duration"
	tenant.grantExpiresAt = time.Now().Add(5 * time.Minute)
	msgSelf := &events.Message{
		Info: types.MessageInfo{
			MessageSource: types.MessageSource{
				Chat:     types.NewJID("15551234567", "s.whatsapp.net"),
				Sender:   types.NewJID("15551234567", "s.whatsapp.net"),
				IsFromMe: true,
			},
			ID:        "self_msg_1",
			Timestamp: time.Now(),
		},
		Message: &waProto.Message{Conversation: googleProto.String("Note to self")},
	}
	tenant.handleEvent(msgSelf)
	if tenant.grantKind != "duration" {
		t.Errorf("expected duration grant to remain for self-chat, got %s", tenant.grantKind)
	}

	// 6. Incoming message with active takeover grant -> triggers reply
	msgWithGrant := &events.Message{
		Info: types.MessageInfo{
			MessageSource: types.MessageSource{
				Chat:     types.NewJID("15559998888", "s.whatsapp.net"),
				Sender:   types.NewJID("15559998888", "s.whatsapp.net"),
				IsFromMe: false,
			},
			ID:        "inc_grant_1",
			Timestamp: time.Now(),
		},
		Message: &waProto.Message{Conversation: googleProto.String("Hello with active grant")},
	}
	tenant.handleEvent(msgWithGrant)

	// 7. Incoming message without active grant -> sends approval poll
	tenant.grantKind = "none"
	tenant.grantExpiresAt = time.Time{}
	msgNoGrant := &events.Message{
		Info: types.MessageInfo{
			MessageSource: types.MessageSource{
				Chat:     types.NewJID("15559998888", "s.whatsapp.net"),
				Sender:   types.NewJID("15559998888", "s.whatsapp.net"),
				IsFromMe: false,
			},
			ID:        "inc_nogrant_1",
			Timestamp: time.Now(),
		},
		Message: &waProto.Message{Conversation: googleProto.String("Need approval")},
	}
	tenant.handleEvent(msgNoGrant)

	// 8. Cooldown check: second incoming message immediately (< 60s) keeps poll alive
	msgCooldown := &events.Message{
		Info: types.MessageInfo{
			MessageSource: types.MessageSource{
				Chat:     types.NewJID("15559998888", "s.whatsapp.net"),
				Sender:   types.NewJID("15559998888", "s.whatsapp.net"),
				IsFromMe: false,
			},
			ID:        "inc_cooldown_1",
			Timestamp: time.Now(),
		},
		Message: &waProto.Message{Conversation: googleProto.String("Second message fast")},
	}
	tenant.handleEvent(msgCooldown)

	// 9. Group chat message: undirected background chatter -> no poll
	groupJID := types.NewJID("12345-67890", "g.us")
	msgGroupUndirected := &events.Message{
		Info: types.MessageInfo{
			MessageSource: types.MessageSource{
				Chat:     groupJID,
				Sender:   types.NewJID("other_user", "s.whatsapp.net"),
				IsFromMe: false,
			},
			ID:        "grp_undirected_1",
			Timestamp: time.Now(),
		},
		Message: &waProto.Message{Conversation: googleProto.String("General group banter")},
	}
	tenant.handleEvent(msgGroupUndirected)

	// 10. Group chat message: directed via mention
	dev.PushName = "Nikhil"
	msgGroupDirected := &events.Message{
		Info: types.MessageInfo{
			MessageSource: types.MessageSource{
				Chat:     groupJID,
				Sender:   types.NewJID("other_user", "s.whatsapp.net"),
				IsFromMe: false,
			},
			ID:        "grp_directed_1",
			Timestamp: time.Now(),
		},
		Message: &waProto.Message{
			Conversation: googleProto.String("Hey Nikhil what is the update?"),
		},
	}
	tenant.handleEvent(msgGroupDirected)

	// 11. HistorySync event
	tenant.handleEvent(&events.HistorySync{Data: &waProto.HistorySync{}})

	// 12. Connected event
	tenant.handleEvent(&events.Connected{})

	// 13. LoggedOut event
	tenant.handleEvent(&events.LoggedOut{})
	if tenant.paired || tenant.pairing {
		t.Errorf("expected paired/pairing=false after LoggedOut")
	}
}

func TestTenantManager_RestoreTenants_Branches(t *testing.T) {
	// Create mock store/tenants directory structure
	tenantsDir := filepath.Join("store", "tenants")
	_ = os.MkdirAll(tenantsDir, 0755)
	defer os.RemoveAll(tenantsDir)

	// 1. Non-directory file in tenants dir
	_ = os.WriteFile(filepath.Join(tenantsDir, "some_file.txt"), []byte("not a dir"), 0644)

	// 2. Directory without whatsapp.db
	_ = os.MkdirAll(filepath.Join(tenantsDir, "no_db_tenant"), 0755)

	// 3. Directory with valid config.json and corrupt whatsapp.db
	corruptDir := filepath.Join(tenantsDir, "corrupt_tenant")
	_ = os.MkdirAll(corruptDir, 0755)
	_ = os.WriteFile(filepath.Join(corruptDir, "whatsapp.db"), []byte("not a sqlite db"), 0644)

	mgr := NewTenantManager(waLog.Noop)
	mgr.restoreTenants()
}

func TestHealthHandler(t *testing.T) {
	mgr := NewTenantManager(waLog.Noop)
	t1 := &Tenant{Hash: "TEST1", paired: true}
	mgr.Add(t1)

	req := httptest.NewRequest(http.MethodGet, "/api/health", nil)
	rr := httptest.NewRecorder()
	handler := healthHandler(mgr)
	handler(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rr.Code)
	}
	if !strings.Contains(rr.Body.String(), "healthy") {
		t.Errorf("expected body to contain 'healthy', got %s", rr.Body.String())
	}
}

func TestConnectionsListAndLifecycleHandlers(t *testing.T) {
	mgr := NewTenantManager(waLog.Noop)
	t1 := &Tenant{Hash: "TESTL1", ownerPhone: "12345", paired: true}
	mgr.Add(t1)

	handler := connectionsHandler(mgr)

	// 1. GET /api/connections -> list all
	reqList := httptest.NewRequest(http.MethodGet, "/api/connections", nil)
	rrList := httptest.NewRecorder()
	handler(rrList, reqList)
	if rrList.Code != http.StatusOK {
		t.Errorf("expected 200 for list, got %d", rrList.Code)
	}
	if !strings.Contains(rrList.Body.String(), "TESTL1") {
		t.Errorf("expected list to contain TESTL1, got %s", rrList.Body.String())
	}

	// 2. POST /api/connections/TESTL1/disconnect
	reqDisc := httptest.NewRequest(http.MethodPost, "/api/connections/TESTL1/disconnect", nil)
	rrDisc := httptest.NewRecorder()
	handler(rrDisc, reqDisc)
	if rrDisc.Code != http.StatusOK {
		t.Errorf("expected 200 for disconnect, got %d", rrDisc.Code)
	}

	// 3. POST /api/connections/TESTL1/reconnect (no client attached -> errors gracefully)
	reqRec := httptest.NewRequest(http.MethodPost, "/api/connections/TESTL1/reconnect", nil)
	rrRec := httptest.NewRecorder()
	handler(rrRec, reqRec)
	if rrRec.Code != http.StatusInternalServerError {
		t.Errorf("expected 500 when reconnecting uninitialized client, got %d", rrRec.Code)
	}

	// 4. DELETE /api/connections/TESTL1 -> removes tenant
	reqDel := httptest.NewRequest(http.MethodDelete, "/api/connections/TESTL1", nil)
	rrDel := httptest.NewRecorder()
	handler(rrDel, reqDel)
	if rrDel.Code != http.StatusOK {
		t.Errorf("expected 200 for delete, got %d", rrDel.Code)
	}
	if mgr.Get("TESTL1") != nil {
		t.Errorf("expected TESTL1 to be deleted from manager")
	}
}

func TestNewLifecycleEvents(t *testing.T) {
	tenant := &Tenant{
		Hash:   "EVT_TEST",
		logger: waLog.Noop,
	}

	// Disconnected
	tenant.handleEvent(&events.Disconnected{})

	// StreamReplaced
	tenant.handleEvent(&events.StreamReplaced{})
	if tenant.lastError != "stream replaced by another active session" {
		t.Errorf("expected lastError to be stream replaced, got %q", tenant.lastError)
	}

	// TemporaryBan
	tenant.handleEvent(&events.TemporaryBan{Code: 403, Expire: time.Hour})
	if !strings.Contains(tenant.lastError, "temporarily banned") {
		t.Errorf("expected lastError to contain banned, got %q", tenant.lastError)
	}

	// ConnectFailure
	tenant.handleEvent(&events.ConnectFailure{Reason: events.ConnectFailureReason(1)})
	if !strings.Contains(tenant.lastError, "connect failure") {
		t.Errorf("expected lastError to contain connect failure, got %q", tenant.lastError)
	}
}

func TestConversationAware_UnrepliedPollPersistence(t *testing.T) {
	tenant := &Tenant{
		Hash:       "UNREPLIED_TEST",
		logger:     waLog.Noop,
		ownerPhone: "15551234567",
		recipients: []string{"15559998888"},
	}
	tenant.initMapsLocked()

	// Initial incoming message creates poll
	recipientKey := "15559998888"
	tenant.activePollsByRecipient[recipientKey] = "poll_unreplied_123"
	tenant.lastPollTimeByRecipient[recipientKey] = time.Now().Add(-10 * time.Minute)
	tenant.sessionStartedAtByRecipient[recipientKey] = time.Now().Add(-10 * time.Minute)
	tenant.lastActivityTimeByRecipient[recipientKey] = time.Now().Add(-10 * time.Minute)
	// Notice: owner has NOT replied (lastManualTextTime is zero)

	// Run session expiry sweep
	tenant.expireInactiveSessions(5 * time.Minute)

	// Poll MUST stay alive because owner hasn't replied yet!
	if tenant.activePollsByRecipient[recipientKey] != "poll_unreplied_123" {
		t.Errorf("expected unreplied poll to stay alive indefinitely, but was deleted")
	}
}

func TestConversationAware_InactivityTimeoutAfterManualChat(t *testing.T) {
	tenant := &Tenant{
		Hash:       "INACTIVE_TEST",
		logger:     waLog.Noop,
		ownerPhone: "15551234567",
		recipients: []string{"15559998888"},
	}
	tenant.initMapsLocked()

	recipientKey := "15559998888"
	now := time.Now()
	// Active conversation started and owner participated
	tenant.activePollsByRecipient[recipientKey] = "poll_manual_active_123"
	tenant.lastPollTimeByRecipient[recipientKey] = now.Add(-10 * time.Minute)
	tenant.sessionStartedAtByRecipient[recipientKey] = now.Add(-10 * time.Minute)
	tenant.lastManualTextTimeByRecipient[recipientKey] = now.Add(-7 * time.Minute) // Owner sent manual text
	tenant.lastActivityTimeByRecipient[recipientKey] = now.Add(-6 * time.Minute)   // Last message 6m ago (> 5m silence)

	// Armed "1 text" grant that went stale
	tenant.grantKind = "count"
	tenant.grantRemaining = 1
	tenant.grantArmedAt = now.Add(-6 * time.Minute)

	// Run session expiry sweep (5 min timeout)
	tenant.expireInactiveSessions(5 * time.Minute)

	// Poll should be deleted because owner participated and it went silent for > 5m
	if tenant.activePollsByRecipient[recipientKey] != "" {
		t.Errorf("expected poll to be deleted after 5m of silence in active conversation, got %s", tenant.activePollsByRecipient[recipientKey])
	}
	// Grant should be revoked
	if tenant.grantKind != "none" || tenant.grantRemaining != 0 {
		t.Errorf("expected takeover grant to be revoked after 5m silence, got %s (rem=%d)", tenant.grantKind, tenant.grantRemaining)
	}
}

func TestConversationAware_SinglePollDuringActiveChat(t *testing.T) {
	client, _, tmpDirClient := createTestClient(t)
	defer os.RemoveAll(tmpDirClient)

	store, tmpDirStore := createTestMessageStore(t)
	defer os.RemoveAll(tmpDirStore)
	defer store.Close()

	tenant := &Tenant{
		Hash:         "ACTIVE_CHAT_TEST",
		logger:       waLog.Noop,
		client:       client,
		messageStore: store,
		ownerPhone:   "15551234567",
		recipients:   []string{"15559998888"},
	}
	tenant.initMapsLocked()

	recipientKey := "15559998888"
	tenant.activePollsByRecipient[recipientKey] = "persistent_poll_1"
	tenant.sessionStartedAtByRecipient[recipientKey] = time.Now().Add(-2 * time.Minute)
	tenant.lastManualTextTimeByRecipient[recipientKey] = time.Now().Add(-1 * time.Minute)
	tenant.lastActivityTimeByRecipient[recipientKey] = time.Now().Add(-1 * time.Minute)

	// Owner sends manual message
	msgManual := &events.Message{
		Info: types.MessageInfo{
			MessageSource: types.MessageSource{
				Chat:     types.NewJID("15559998888", "s.whatsapp.net"),
				Sender:   types.NewJID("15551234567", "s.whatsapp.net"),
				IsFromMe: true,
			},
			ID:        "man_1",
			Timestamp: time.Now(),
		},
		Message: &waProto.Message{Conversation: googleProto.String("Hello from owner")},
	}
	tenant.handleEvent(msgManual)

	// Poll MUST NOT be deleted
	if tenant.activePollsByRecipient[recipientKey] != "persistent_poll_1" {
		t.Errorf("expected single poll to be preserved on owner text, got %v", tenant.activePollsByRecipient[recipientKey])
	}

	// Recipient replies 30s later (within 5m window)
	msgIncoming := &events.Message{
		Info: types.MessageInfo{
			MessageSource: types.MessageSource{
				Chat:     types.NewJID("15559998888", "s.whatsapp.net"),
				Sender:   types.NewJID("15559998888", "s.whatsapp.net"),
				IsFromMe: false,
			},
			ID:        "inc_2",
			Timestamp: time.Now(),
		},
		Message: &waProto.Message{Conversation: googleProto.String("Hello back!")},
	}
	tenant.handleEvent(msgIncoming)

	// Poll MUST still be the same single poll
	if tenant.activePollsByRecipient[recipientKey] != "persistent_poll_1" {
		t.Errorf("expected single poll to be preserved on incoming reply, got %v", tenant.activePollsByRecipient[recipientKey])
	}
}

func TestConversationAware_DurationGrantTimeoutDuringSilence(t *testing.T) {
	tenant := &Tenant{
		Hash:       "DURATION_TIMEOUT_TEST",
		logger:     waLog.Noop,
		ownerPhone: "15551234567",
		recipients: []string{"15559998888"},
	}
	tenant.initMapsLocked()

	now := time.Now()
	// 5-minute grant armed 6 minutes ago (silent since armed)
	tenant.grantKind = "duration"
	tenant.grantExpiresAt = now.Add(10 * time.Minute)
	tenant.grantArmedAt = now.Add(-6 * time.Minute)

	tenant.expireInactiveSessions(5 * time.Minute)

	if tenant.grantKind != "none" {
		t.Errorf("expected duration grant to be revoked after > 5m silence, got %s", tenant.grantKind)
	}
}

func TestConversationAware_SupervisorAutoSweep(t *testing.T) {
	mgr := NewTenantManager(waLog.Noop)

	now := time.Now()
	t1 := &Tenant{
		Hash:       "SWEEP_TEST",
		logger:     waLog.Noop,
		ownerPhone: "15551234567",
		recipients: []string{"15559998888"},
	}
	t1.initMapsLocked()
	recipientKey := "15559998888"
	t1.activePollsByRecipient[recipientKey] = "sweep_poll_123"
	t1.lastPollTimeByRecipient[recipientKey] = now.Add(-10 * time.Minute)
	t1.sessionStartedAtByRecipient[recipientKey] = now.Add(-10 * time.Minute)
	t1.lastManualTextTimeByRecipient[recipientKey] = now.Add(-8 * time.Minute)
	t1.lastActivityTimeByRecipient[recipientKey] = now.Add(-7 * time.Minute)

	mgr.Add(t1)

	// Supervisor sweep
	mgr.checkAndReconnectTenants()

	// Sweep should have expired the inactive session poll
	if t1.activePollsByRecipient[recipientKey] != "" {
		t.Errorf("expected supervisor to auto-expire timed out session, but poll remained: %s", t1.activePollsByRecipient[recipientKey])
	}
}



