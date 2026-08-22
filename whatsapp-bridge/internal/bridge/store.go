package bridge

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	_ "github.com/mattn/go-sqlite3"
)

// Message represents a chat message for our client
type Message struct {
	Time      time.Time
	Sender    string
	Content   string
	IsFromMe  bool
	MediaType string
	Filename  string
}

// Database handler for storing message history
type MessageStore struct {
	db *sql.DB
}

// Initialize message store
func NewMessageStore(dbPath string) (*MessageStore, error) {
	// Create directory for database if it doesn't exist
	if err := os.MkdirAll(filepath.Dir(dbPath), 0755); err != nil {
		return nil, fmt.Errorf("failed to create store directory: %v", err)
	}

	// Open SQLite database for messages
	db, err := sql.Open("sqlite3", "file:"+dbPath+"?_foreign_keys=on&_journal_mode=WAL&_busy_timeout=5000")
	if err != nil {
		return nil, fmt.Errorf("failed to open message database: %v", err)
	}

	// Create tables if they don't exist
	_, err = db.Exec(`
		CREATE TABLE IF NOT EXISTS chats (
			jid TEXT PRIMARY KEY,
			name TEXT,
			last_message_time TIMESTAMP
		);
		
		CREATE TABLE IF NOT EXISTS messages (
			id TEXT,
			chat_jid TEXT,
			sender TEXT,
			content TEXT,
			replied_to TEXT,
			timestamp TIMESTAMP,
			is_from_me BOOLEAN,
		media_type TEXT,
		filename TEXT,
		url TEXT,
		media_key BLOB,
		file_sha256 BLOB,
		file_enc_sha256 BLOB,
		file_length INTEGER,
		origin TEXT,
		PRIMARY KEY (id, chat_jid),
		FOREIGN KEY (chat_jid) REFERENCES chats(jid)
	);
	`)
	if err != nil {
		db.Close()
		return nil, fmt.Errorf("failed to create tables: %v", err)
	}

	// Migrate older databases that lack the replied_to column
	if err := migrateSchema(db); err != nil {
		db.Close()
		return nil, fmt.Errorf("failed to migrate schema: %v", err)
	}

	return &MessageStore{db: db}, nil
}

// migrateSchema adds columns that may be missing from older databases.
func migrateSchema(db *sql.DB) error {
	_, err := db.Exec("ALTER TABLE messages ADD COLUMN replied_to TEXT")
	if err != nil {
		// Ignore "duplicate column name" — column already exists.
		if !strings.Contains(err.Error(), "duplicate column") {
			return err
		}
	}
	_, err = db.Exec("ALTER TABLE messages ADD COLUMN origin TEXT")
	if err != nil {
		// Ignore "duplicate column name" — column already exists.
		if !strings.Contains(err.Error(), "duplicate column") {
			return err
		}
	}
	_, err = db.Exec(`CREATE TABLE IF NOT EXISTS poll_votes (
		poll_msg_id TEXT,
		voter_jid TEXT,
		question TEXT,
		selected_options TEXT,
		timestamp TIMESTAMP,
		PRIMARY KEY (poll_msg_id, voter_jid)
	)`)
	if err != nil {
		return err
	}

	_, err = db.Exec(`CREATE TABLE IF NOT EXISTS chat_settings (
		jid TEXT PRIMARY KEY,
		relationship TEXT,
		friend_circle TEXT,
		custom_prompt TEXT,
		model TEXT,
		updated_at TIMESTAMP
	)`)
	if err != nil {
		return err
	}

	_, err = db.Exec(`CREATE TABLE IF NOT EXISTS semantic_memories (
		id TEXT PRIMARY KEY,
		chat_jid TEXT,
		speaker TEXT,
		snippet TEXT,
		embedding BLOB,
		timestamp TIMESTAMP,
		token_count INTEGER
	)`)
	if err != nil {
		return err
	}
	_, _ = db.Exec("CREATE INDEX IF NOT EXISTS idx_semantic_memories_chat ON semantic_memories(chat_jid, timestamp)")

	_, err = db.Exec(`CREATE TABLE IF NOT EXISTS calendar_events (
		id TEXT PRIMARY KEY,
		tenant_hash TEXT NOT NULL,
		calendar_id TEXT NOT NULL,
		summary TEXT,
		description TEXT,
		location TEXT,
		start_utc TIMESTAMP NOT NULL,
		end_utc TIMESTAMP NOT NULL,
		is_all_day BOOLEAN DEFAULT 0,
		status TEXT DEFAULT 'confirmed',
		updated_at TIMESTAMP NOT NULL
	)`)
	if err != nil {
		return err
	}
	_, _ = db.Exec("CREATE INDEX IF NOT EXISTS idx_cal_events_time ON calendar_events(tenant_hash, start_utc, end_utc)")

	_, err = db.Exec(`CREATE TABLE IF NOT EXISTS pending_actions (
		id TEXT PRIMARY KEY,
		tenant_hash TEXT NOT NULL,
		chat_jid TEXT NOT NULL,
		poll_msg_id TEXT UNIQUE,
		action_type TEXT NOT NULL,
		action_payload TEXT NOT NULL,
		draft_reply_text TEXT NOT NULL,
		status TEXT DEFAULT 'pending',
		created_at TIMESTAMP NOT NULL,
		expires_at TIMESTAMP NOT NULL,
		executed_at TIMESTAMP,
		error_message TEXT
	)`)
	if err != nil {
		return err
	}
	_, _ = db.Exec("CREATE INDEX IF NOT EXISTS idx_pending_actions_poll ON pending_actions(tenant_hash, poll_msg_id)")
	_, _ = db.Exec("CREATE INDEX IF NOT EXISTS idx_pending_actions_status ON pending_actions(tenant_hash, status)")

	_, err = db.Exec(`CREATE TABLE IF NOT EXISTS tool_executions (
		id TEXT PRIMARY KEY,
		tenant_hash TEXT NOT NULL,
		chat_jid TEXT NOT NULL,
		tool_name TEXT NOT NULL,
		input_payload TEXT NOT NULL,
		output_payload TEXT NOT NULL,
		execution_duration_ms INTEGER NOT NULL,
		status TEXT NOT NULL,
		created_at TIMESTAMP NOT NULL
	)`)
	if err != nil {
		return err
	}
	_, _ = db.Exec("CREATE INDEX IF NOT EXISTS idx_tool_exec_tenant ON tool_executions(tenant_hash, created_at)")

	return nil
}

// Close the database connection
func (store *MessageStore) Close() error {
	return store.db.Close()
}

// Store a chat in the database
func (store *MessageStore) StoreChat(jid, name string, lastMessageTime time.Time) error {
	_, err := store.db.Exec(
		"INSERT OR REPLACE INTO chats (jid, name, last_message_time) VALUES (?, ?, ?)",
		jid, name, lastMessageTime,
	)
	return err
}

// Store a message in the database
func (store *MessageStore) StoreMessage(id, chatJID, sender, content, repliedTo string, timestamp time.Time, isFromMe bool,
	mediaType, filename, url string, mediaKey, fileSHA256, fileEncSHA256 []byte, fileLength uint64, origin string) error {
	// Only store if there's actual content or media
	if content == "" && mediaType == "" {
		return nil
	}

	_, err := store.db.Exec(
		`INSERT OR REPLACE INTO messages 
		(id, chat_jid, sender, content, replied_to, timestamp, is_from_me, media_type, filename, url, media_key, file_sha256, file_enc_sha256, file_length, origin) 
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		id, chatJID, sender, content, repliedTo, timestamp, isFromMe, mediaType, filename, url, mediaKey, fileSHA256, fileEncSHA256, fileLength, origin,
	)
	return err
}

// StorePollVote records a poll vote so the controller can read the owner's answer.
func (store *MessageStore) StorePollVote(pollMsgID, voterJID, question, selectedOptions string, timestamp time.Time) error {
	if pollMsgID == "" {
		return nil
	}
	_, err := store.db.Exec(
		`INSERT OR REPLACE INTO poll_votes (poll_msg_id, voter_jid, question, selected_options, timestamp)
		VALUES (?, ?, ?, ?, ?)`,
		pollMsgID, voterJID, question, selectedOptions, timestamp,
	)
	return err
}

// Get messages from a chat
func (store *MessageStore) GetMessages(chatJID string, limit int) ([]Message, error) {
	rows, err := store.db.Query(
		"SELECT sender, content, timestamp, is_from_me, media_type, filename FROM messages WHERE chat_jid = ? ORDER BY timestamp DESC LIMIT ?",
		chatJID, limit,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var messages []Message
	for rows.Next() {
		var msg Message
		var timestamp time.Time
		err := rows.Scan(&msg.Sender, &msg.Content, &timestamp, &msg.IsFromMe, &msg.MediaType, &msg.Filename)
		if err != nil {
			return nil, err
		}
		msg.Time = timestamp
		messages = append(messages, msg)
	}

	return messages, nil
}

// GetMessagesFlexible retrieves messages matching primary chatJID or any alternative JIDs/candidate substrings.
func (store *MessageStore) GetMessagesFlexible(chatJID string, altJIDs []string, limit int) ([]Message, error) {
	msgs, err := store.GetMessages(chatJID, limit)
	if err == nil && len(msgs) > 0 {
		return msgs, nil
	}

	for _, alt := range altJIDs {
		if alt == "" || alt == chatJID {
			continue
		}
		if altMsgs, altErr := store.GetMessages(alt, limit); altErr == nil && len(altMsgs) > 0 {
			return altMsgs, nil
		}
	}

	cleanUser := cleanPhoneDigits(chatJID)
	if cleanUser != "" && len(cleanUser) >= 5 {
		pattern := "%" + cleanUser + "%"
		rows, err := store.db.Query(
			"SELECT sender, content, timestamp, is_from_me, media_type, filename FROM messages WHERE chat_jid LIKE ? OR sender LIKE ? ORDER BY timestamp DESC LIMIT ?",
			pattern, pattern, limit,
		)
		if err == nil {
			defer rows.Close()
			var fallbackMsgs []Message
			for rows.Next() {
				var msg Message
				var timestamp time.Time
				if scanErr := rows.Scan(&msg.Sender, &msg.Content, &timestamp, &msg.IsFromMe, &msg.MediaType, &msg.Filename); scanErr == nil {
					msg.Time = timestamp
					fallbackMsgs = append(fallbackMsgs, msg)
				}
			}
			if len(fallbackMsgs) > 0 {
				return fallbackMsgs, nil
			}
		}
	}

	return msgs, err
}

// Get all chats
func (store *MessageStore) GetChats() (map[string]time.Time, error) {
	rows, err := store.db.Query("SELECT jid, last_message_time FROM chats ORDER BY last_message_time DESC")
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	chats := make(map[string]time.Time)
	for rows.Next() {
		var jid string
		var lastMessageTime time.Time
		err := rows.Scan(&jid, &lastMessageTime)
		if err != nil {
			return nil, err
		}
		chats[jid] = lastMessageTime
	}

	return chats, nil
}

// GetRecentMessages retrieves the most recent messages across all chats
func (store *MessageStore) GetRecentMessages(limit int) ([]map[string]interface{}, error) {
	if limit <= 0 {
		limit = 20
	}
	rows, err := store.db.Query(`
		SELECT m.chat_jid, coalesce(c.name, m.sender), m.sender, m.content, m.timestamp, m.is_from_me, m.media_type, coalesce(m.filename, ''), coalesce(m.url, '')
		FROM messages m
		LEFT JOIN chats c ON m.chat_jid = c.jid
		ORDER BY m.timestamp DESC
		LIMIT ?
	`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var result []map[string]interface{}
	for rows.Next() {
		var chatJID, name, sender, content, mediaType, filename, url string
		var timestamp time.Time
		var isFromMe bool
		if err := rows.Scan(&chatJID, &name, &sender, &content, &timestamp, &isFromMe, &mediaType, &filename, &url); err != nil {
			continue
		}
		result = append(result, map[string]interface{}{
			"chatJid":    chatJID,
			"senderName": name,
			"sender":     sender,
			"content":    content,
			"timestamp":  timestamp.Format(time.RFC3339),
			"isFromMe":   isFromMe,
			"mediaType":  mediaType,
			"filename":   filename,
			"url":        url,
		})
	}
	return result, nil
}

// StoreMediaInfo stores additional media info in the database
func (store *MessageStore) StoreMediaInfo(id, chatJID, url string, mediaKey, fileSHA256, fileEncSHA256 []byte, fileLength uint64) error {
	_, err := store.db.Exec(
		"UPDATE messages SET url = ?, media_key = ?, file_sha256 = ?, file_enc_sha256 = ?, file_length = ? WHERE id = ? AND chat_jid = ?",
		url, mediaKey, fileSHA256, fileEncSHA256, fileLength, id, chatJID,
	)
	return err
}

// GetMediaInfo gets media info from the database
func (store *MessageStore) GetMediaInfo(id, chatJID string) (string, string, string, []byte, []byte, []byte, uint64, error) {
	var mediaType, filename, url string
	var mediaKey, fileSHA256, fileEncSHA256 []byte
	var fileLength uint64

	err := store.db.QueryRow(
		"SELECT media_type, filename, url, media_key, file_sha256, file_enc_sha256, file_length FROM messages WHERE id = ? AND chat_jid = ?",
		id, chatJID,
	).Scan(&mediaType, &filename, &url, &mediaKey, &fileSHA256, &fileEncSHA256, &fileLength)

	return mediaType, filename, url, mediaKey, fileSHA256, fileEncSHA256, fileLength, err
}

// ChatSettings stores per-chat relationship context, friend circle, and persona overrides.
type ChatSettings struct {
	JID          string    `json:"jid"`
	Relationship string    `json:"relationship"`
	FriendCircle []string  `json:"friendCircle"`
	CustomPrompt string    `json:"customPrompt"`
	Model        string    `json:"model"`
	UpdatedAt    time.Time `json:"updatedAt"`
}

// SaveChatSettings persists relationship context and friend circle for a chat.
func (store *MessageStore) SaveChatSettings(settings *ChatSettings) error {
	if settings == nil || settings.JID == "" {
		return fmt.Errorf("settings and jid are required")
	}
	friendCircleJSON, _ := json.Marshal(settings.FriendCircle)
	if settings.UpdatedAt.IsZero() {
		settings.UpdatedAt = time.Now()
	}
	_, err := store.db.Exec(
		`INSERT OR REPLACE INTO chat_settings (jid, relationship, friend_circle, custom_prompt, model, updated_at)
		VALUES (?, ?, ?, ?, ?, ?)`,
		settings.JID, settings.Relationship, string(friendCircleJSON), settings.CustomPrompt, settings.Model, settings.UpdatedAt,
	)
	return err
}

// GetChatSettings retrieves settings for a specific chat JID.
func (store *MessageStore) GetChatSettings(jid string) (*ChatSettings, error) {
	if jid == "" {
		return nil, nil
	}
	var cs ChatSettings
	var friendCircleJSON string
	var updatedAt time.Time
	err := store.db.QueryRow(
		"SELECT jid, relationship, friend_circle, custom_prompt, model, updated_at FROM chat_settings WHERE jid = ?",
		jid,
	).Scan(&cs.JID, &cs.Relationship, &friendCircleJSON, &cs.CustomPrompt, &cs.Model, &updatedAt)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}
	cs.UpdatedAt = updatedAt
	if friendCircleJSON != "" {
		_ = json.Unmarshal([]byte(friendCircleJSON), &cs.FriendCircle)
	}
	return &cs, nil
}

// GetChatSettingsFlexible retrieves chat settings using primary JID and candidate/alt JIDs.
func (store *MessageStore) GetChatSettingsFlexible(jid string, altJIDs []string) (*ChatSettings, error) {
	cs, err := store.GetChatSettings(jid)
	if err == nil && cs != nil {
		return cs, nil
	}
	for _, alt := range altJIDs {
		if alt == "" || alt == jid {
			continue
		}
		if altCS, altErr := store.GetChatSettings(alt); altErr == nil && altCS != nil {
			return altCS, nil
		}
	}
	cleanUser := cleanPhoneDigits(jid)
	if cleanUser != "" && len(cleanUser) >= 5 {
		pattern := "%" + cleanUser + "%"
		var csFallback ChatSettings
		var friendCircleJSON string
		var updatedAt time.Time
		err := store.db.QueryRow(
			"SELECT jid, relationship, friend_circle, custom_prompt, model, updated_at FROM chat_settings WHERE jid LIKE ? ORDER BY updated_at DESC LIMIT 1",
			pattern,
		).Scan(&csFallback.JID, &csFallback.Relationship, &friendCircleJSON, &csFallback.CustomPrompt, &csFallback.Model, &updatedAt)
		if err == nil {
			csFallback.UpdatedAt = updatedAt
			if friendCircleJSON != "" {
				_ = json.Unmarshal([]byte(friendCircleJSON), &csFallback.FriendCircle)
			}
			return &csFallback, nil
		}
	}
	return cs, err
}

// SemanticMemory represents a verified historical conversational memory snippet with its vector embedding.
type SemanticMemory struct {
	ID         string    `json:"id"`
	ChatJID    string    `json:"chatJid"`
	Speaker    string    `json:"speaker"`
	Snippet    string    `json:"snippet"`
	Embedding  []float32 `json:"-"`
	Timestamp  time.Time `json:"timestamp"`
	TokenCount int       `json:"tokenCount"`
}

// SaveSemanticMemory persists a semantic memory chunk with its vector embedding.
func (store *MessageStore) SaveSemanticMemory(mem *SemanticMemory) error {
	if mem == nil || mem.ID == "" || mem.Snippet == "" {
		return nil
	}
	embBytes := Float32SliceToBytes(mem.Embedding)
	if mem.Timestamp.IsZero() {
		mem.Timestamp = time.Now()
	}
	_, err := store.db.Exec(`
		INSERT OR REPLACE INTO semantic_memories (id, chat_jid, speaker, snippet, embedding, timestamp, token_count)
		VALUES (?, ?, ?, ?, ?, ?, ?)
	`, mem.ID, mem.ChatJID, mem.Speaker, mem.Snippet, embBytes, mem.Timestamp, mem.TokenCount)
	return err
}

// GetSemanticMemories fetches all stored semantic memory chunks for a chat and its candidate JIDs.
func (store *MessageStore) GetSemanticMemories(chatJID string, altJIDs []string, limit int) ([]SemanticMemory, error) {
	if limit <= 0 {
		limit = 100
	}
	jids := []string{chatJID}
	for _, alt := range altJIDs {
		if alt != "" && alt != chatJID {
			jids = append(jids, alt)
		}
	}

	placeholders := make([]string, len(jids))
	args := make([]interface{}, len(jids)+1)
	for i, j := range jids {
		placeholders[i] = "?"
		args[i] = j
	}
	args[len(jids)] = limit

	query := fmt.Sprintf(`
		SELECT id, chat_jid, speaker, snippet, embedding, timestamp, token_count
		FROM semantic_memories
		WHERE chat_jid IN (%s)
		ORDER BY timestamp DESC
		LIMIT ?
	`, strings.Join(placeholders, ", "))

	rows, err := store.db.Query(query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var memories []SemanticMemory
	for rows.Next() {
		var mem SemanticMemory
		var embBytes []byte
		var ts time.Time
		if scanErr := rows.Scan(&mem.ID, &mem.ChatJID, &mem.Speaker, &mem.Snippet, &embBytes, &ts, &mem.TokenCount); scanErr != nil {
			continue
		}
		mem.Timestamp = ts
		mem.Embedding = BytesToFloat32Slice(embBytes)
		memories = append(memories, mem)
	}

	return memories, nil
}

// GetChatName retrieves the stored name of a chat from the chats table.
func (store *MessageStore) GetChatName(jid string) string {
	if jid == "" {
		return ""
	}
	var name string
	err := store.db.QueryRow("SELECT name FROM chats WHERE jid = ?", jid).Scan(&name)
	if err == nil && name != "" && !isAllDigits(name) {
		return name
	}
	clean := cleanPhoneDigits(jid)
	if clean != "" && len(clean) >= 5 {
		err = store.db.QueryRow("SELECT name FROM chats WHERE jid LIKE ? AND name IS NOT NULL AND name != '' LIMIT 1", "%"+clean+"%").Scan(&name)
		if err == nil && name != "" && !isAllDigits(name) {
			return name
		}
	}
	return ""
}

// GetMessagesForIndexing returns historical messages for a chat to generate memory chunks.
func (store *MessageStore) GetMessagesForIndexing(chatJID string, altJIDs []string, limit int) ([]Message, error) {
	if limit <= 0 {
		limit = 100
	}
	return store.GetMessagesFlexible(chatJID, altJIDs, limit)
}

// CalendarEvent represents a single event normalized in UTC.
type CalendarEvent struct {
	ID          string    `json:"id"`
	TenantHash  string    `json:"tenantHash"`
	CalendarID  string    `json:"calendarId"`
	Summary     string    `json:"summary"`
	Description string    `json:"description"`
	Location    string    `json:"location"`
	StartUTC    time.Time `json:"startUtc"`
	EndUTC      time.Time `json:"endUtc"`
	IsAllDay    bool      `json:"isAllDay"`
	Status      string    `json:"status"` // "confirmed", "tentative", "cancelled"
	UpdatedAt   time.Time `json:"updatedAt"`
}

// SaveCalendarEvents bulk upserts calendar events for a tenant.
func (store *MessageStore) SaveCalendarEvents(tenantHash, calendarID string, events []CalendarEvent) error {
	if len(events) == 0 {
		return nil
	}
	tx, err := store.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	stmt, err := tx.Prepare(`
		INSERT OR REPLACE INTO calendar_events (
			id, tenant_hash, calendar_id, summary, description, location,
			start_utc, end_utc, is_all_day, status, updated_at
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`)
	if err != nil {
		return err
	}
	defer stmt.Close()

	now := time.Now().UTC()
	for _, ev := range events {
		isAllDayInt := 0
		if ev.IsAllDay {
			isAllDayInt = 1
		}
		status := ev.Status
		if status == "" {
			status = "confirmed"
		}
		_, err := stmt.Exec(
			ev.ID, tenantHash, calendarID, ev.Summary, ev.Description, ev.Location,
			ev.StartUTC, ev.EndUTC, isAllDayInt, status, now,
		)
		if err != nil {
			return err
		}
	}
	return tx.Commit()
}

// ClearCalendarEvents removes old cached calendar events for a specific calendar feed.
func (store *MessageStore) ClearCalendarEvents(tenantHash, calendarID string) error {
	_, err := store.db.Exec("DELETE FROM calendar_events WHERE tenant_hash = ? AND calendar_id = ?", tenantHash, calendarID)
	return err
}

// GetCalendarEventsInRange returns confirmed events that overlap with [startUTC, endUTC].
func (store *MessageStore) GetCalendarEventsInRange(tenantHash string, startUTC, endUTC time.Time) ([]CalendarEvent, error) {
	rows, err := store.db.Query(`
		SELECT id, tenant_hash, calendar_id, summary, description, location,
		       start_utc, end_utc, is_all_day, status, updated_at
		FROM calendar_events
		WHERE tenant_hash = ?
		  AND status != 'cancelled'
		  AND start_utc < ?
		  AND end_utc > ?
		ORDER BY start_utc ASC
	`, tenantHash, endUTC, startUTC)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var events []CalendarEvent
	for rows.Next() {
		var ev CalendarEvent
		var isAllDayInt int
		if err := rows.Scan(
			&ev.ID, &ev.TenantHash, &ev.CalendarID, &ev.Summary, &ev.Description, &ev.Location,
			&ev.StartUTC, &ev.EndUTC, &isAllDayInt, &ev.Status, &ev.UpdatedAt,
		); err != nil {
			continue
		}
		ev.IsAllDay = isAllDayInt == 1
		events = append(events, ev)
	}
	return events, nil
}

// PendingAction represents a structured action awaiting owner approval.
type PendingAction struct {
	ID             string     `json:"id"`
	TenantHash     string     `json:"tenantHash"`
	ChatJID        string     `json:"chatJid"`
	PollMsgID      string     `json:"pollMsgId,omitempty"`
	ActionType     string     `json:"actionType"` // "create_calendar_event" | "send_location"
	ActionPayload  string     `json:"actionPayload"`
	DraftReplyText string     `json:"draftReplyText"`
	Status         string     `json:"status"` // "pending" | "approved" | "rejected" | "executed" | "expired" | "overridden"
	CreatedAt      time.Time  `json:"createdAt"`
	ExpiresAt      time.Time  `json:"expiresAt"`
	ExecutedAt     *time.Time `json:"executedAt,omitempty"`
	ErrorMessage   string     `json:"errorMessage,omitempty"`
}

// CreatePendingAction persists a newly proposed action.
func (store *MessageStore) CreatePendingAction(action *PendingAction) error {
	_, err := store.db.Exec(`
		INSERT OR REPLACE INTO pending_actions (
			id, tenant_hash, chat_jid, poll_msg_id, action_type, action_payload,
			draft_reply_text, status, created_at, expires_at, executed_at, error_message
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`, action.ID, action.TenantHash, action.ChatJID, action.PollMsgID, action.ActionType,
		action.ActionPayload, action.DraftReplyText, action.Status, action.CreatedAt,
		action.ExpiresAt, action.ExecutedAt, action.ErrorMessage)
	return err
}

// GetPendingActionByPollID fetches a pending action associated with a poll creation ID.
func (store *MessageStore) GetPendingActionByPollID(tenantHash, pollMsgID string) (*PendingAction, error) {
	var a PendingAction
	var executedAt sql.NullTime
	var errMsg sql.NullString
	err := store.db.QueryRow(`
		SELECT id, tenant_hash, chat_jid, poll_msg_id, action_type, action_payload,
		       draft_reply_text, status, created_at, expires_at, executed_at, error_message
		FROM pending_actions
		WHERE tenant_hash = ? AND poll_msg_id = ?
		LIMIT 1
	`, tenantHash, pollMsgID).Scan(
		&a.ID, &a.TenantHash, &a.ChatJID, &a.PollMsgID, &a.ActionType, &a.ActionPayload,
		&a.DraftReplyText, &a.Status, &a.CreatedAt, &a.ExpiresAt, &executedAt, &errMsg,
	)
	if err != nil {
		return nil, err
	}
	if executedAt.Valid {
		a.ExecutedAt = &executedAt.Time
	}
	if errMsg.Valid {
		a.ErrorMessage = errMsg.String
	}
	return &a, nil
}

// GetPendingActionByID fetches a pending action by its primary key ID.
func (store *MessageStore) GetPendingActionByID(tenantHash, id string) (*PendingAction, error) {
	var a PendingAction
	var executedAt sql.NullTime
	var errMsg sql.NullString
	err := store.db.QueryRow(`
		SELECT id, tenant_hash, chat_jid, poll_msg_id, action_type, action_payload,
		       draft_reply_text, status, created_at, expires_at, executed_at, error_message
		FROM pending_actions
		WHERE tenant_hash = ? AND id = ?
		LIMIT 1
	`, tenantHash, id).Scan(
		&a.ID, &a.TenantHash, &a.ChatJID, &a.PollMsgID, &a.ActionType, &a.ActionPayload,
		&a.DraftReplyText, &a.Status, &a.CreatedAt, &a.ExpiresAt, &executedAt, &errMsg,
	)
	if err != nil {
		return nil, err
	}
	if executedAt.Valid {
		a.ExecutedAt = &executedAt.Time
	}
	if errMsg.Valid {
		a.ErrorMessage = errMsg.String
	}
	return &a, nil
}

// UpdatePendingActionStatus updates status, error message, and execution timestamp.
func (store *MessageStore) UpdatePendingActionStatus(tenantHash, id, status, errorMessage string, executedAt *time.Time) error {
	_, err := store.db.Exec(`
		UPDATE pending_actions
		SET status = ?, error_message = ?, executed_at = ?
		WHERE tenant_hash = ? AND id = ?
	`, status, errorMessage, executedAt, tenantHash, id)
	return err
}

// MarkPendingActionsOverridden marks any pending actions for a chat as overridden.
func (store *MessageStore) MarkPendingActionsOverridden(tenantHash, chatJID string) error {
	_, err := store.db.Exec(`
		UPDATE pending_actions
		SET status = 'overridden'
		WHERE tenant_hash = ? AND chat_jid = ? AND status = 'pending'
	`, tenantHash, chatJID)
	return err
}

// ListPendingActions lists pending actions filtered by status.
func (store *MessageStore) ListPendingActions(tenantHash, status string, limit int) ([]PendingAction, error) {
	if limit <= 0 {
		limit = 50
	}
	var rows *sql.Rows
	var err error
	if status != "" {
		rows, err = store.db.Query(`
			SELECT id, tenant_hash, chat_jid, poll_msg_id, action_type, action_payload,
			       draft_reply_text, status, created_at, expires_at, executed_at, error_message
			FROM pending_actions
			WHERE tenant_hash = ? AND status = ?
			ORDER BY created_at DESC LIMIT ?
		`, tenantHash, status, limit)
	} else {
		rows, err = store.db.Query(`
			SELECT id, tenant_hash, chat_jid, poll_msg_id, action_type, action_payload,
			       draft_reply_text, status, created_at, expires_at, executed_at, error_message
			FROM pending_actions
			WHERE tenant_hash = ?
			ORDER BY created_at DESC LIMIT ?
		`, tenantHash, limit)
	}
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var actions []PendingAction
	for rows.Next() {
		var a PendingAction
		var executedAt sql.NullTime
		var errMsg sql.NullString
		if err := rows.Scan(
			&a.ID, &a.TenantHash, &a.ChatJID, &a.PollMsgID, &a.ActionType, &a.ActionPayload,
			&a.DraftReplyText, &a.Status, &a.CreatedAt, &a.ExpiresAt, &executedAt, &errMsg,
		); err != nil {
			continue
		}
		if executedAt.Valid {
			a.ExecutedAt = &executedAt.Time
		}
		if errMsg.Valid {
			a.ErrorMessage = errMsg.String
		}
		actions = append(actions, a)
	}
	return actions, nil
}

// ToolExecution represents an audit log entry for tool executions.
type ToolExecution struct {
	ID                  string    `json:"id"`
	TenantHash          string    `json:"tenantHash"`
	ChatJID             string    `json:"chatJid"`
	ToolName            string    `json:"toolName"`
	InputPayload        string    `json:"inputPayload"`
	OutputPayload       string    `json:"outputPayload"`
	ExecutionDurationMs int64     `json:"executionDurationMs"`
	Status              string    `json:"status"` // "success" | "failed" | "gated"
	CreatedAt           time.Time `json:"createdAt"`
}

// LogToolExecution records a tool execution audit entry.
func (store *MessageStore) LogToolExecution(exec *ToolExecution) error {
	_, err := store.db.Exec(`
		INSERT INTO tool_executions (
			id, tenant_hash, chat_jid, tool_name, input_payload, output_payload,
			execution_duration_ms, status, created_at
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
	`, exec.ID, exec.TenantHash, exec.ChatJID, exec.ToolName, exec.InputPayload,
		exec.OutputPayload, exec.ExecutionDurationMs, exec.Status, exec.CreatedAt)
	return err
}


