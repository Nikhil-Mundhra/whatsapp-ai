package main

import (
	"crypto/sha256"
	"os"
	"path/filepath"
	"testing"
	"time"

	waProto "go.mau.fi/whatsmeow/binary/proto"
	"go.mau.fi/whatsmeow/types"
	waLog "go.mau.fi/whatsmeow/util/log"
	"google.golang.org/protobuf/proto"
)

func TestCleanPhoneDigits(t *testing.T) {
	tests := []struct {
		input    string
		expected string
	}{
		{"+1 (555) 123-4567", "15551234567"},
		{"919876543210", "919876543210"},
		{"+44 20 7946 0958", "442079460958"},
		{"abc-123-def", "123"},
		{"", ""},
	}

	for _, tt := range tests {
		got := cleanPhoneDigits(tt.input)
		if got != tt.expected {
			t.Errorf("cleanPhoneDigits(%q) = %q; want %q", tt.input, got, tt.expected)
		}
	}
}

func TestIsAllDigits(t *testing.T) {
	tests := []struct {
		input    string
		expected bool
	}{
		{"", true},
		{"   ", true},
		{"1234567890", true},
		{"+1 555-1234", true},
		{"123abc456", false},
		{"Alice", false},
	}

	for _, tt := range tests {
		got := isAllDigits(tt.input)
		if got != tt.expected {
			t.Errorf("isAllDigits(%q) = %v; want %v", tt.input, got, tt.expected)
		}
	}
}

func TestExtractDirectPathFromURL(t *testing.T) {
	tests := []struct {
		input    string
		expected string
	}{
		{
			"https://mmg.whatsapp.net/v/t62.7118-24/13812002_698058036224062_3424455886509161511_n.enc?ccb=11-4&oh=123",
			"/v/t62.7118-24/13812002_698058036224062_3424455886509161511_n.enc",
		},
		{
			"https://example.com/file.enc",
			"https://example.com/file.enc",
		},
		{
			"https://mmg.whatsapp.net/simple/path",
			"/simple/path",
		},
	}

	for _, tt := range tests {
		got := extractDirectPathFromURL(tt.input)
		if got != tt.expected {
			t.Errorf("extractDirectPathFromURL(%q) = %q; want %q", tt.input, got, tt.expected)
		}
	}
}

func TestMin(t *testing.T) {
	if min(3, 5) != 3 {
		t.Errorf("min(3, 5) = %d; want 3", min(3, 5))
	}
	if min(10, 2) != 2 {
		t.Errorf("min(10, 2) = %d; want 2", min(10, 2))
	}
	if min(4, 4) != 4 {
		t.Errorf("min(4, 4) = %d; want 4", min(4, 4))
	}
}

func TestPlaceholderWaveform(t *testing.T) {
	wf1 := placeholderWaveform(10)
	if len(wf1) != 64 {
		t.Fatalf("expected waveform length 64, got %d", len(wf1))
	}

	for i, b := range wf1 {
		if b > 100 {
			t.Errorf("waveform byte at %d exceeds 100: %d", i, b)
		}
	}

	// Test determinism
	wf2 := placeholderWaveform(10)
	for i := range wf1 {
		if wf1[i] != wf2[i] {
			t.Fatalf("placeholderWaveform is non-deterministic at index %d", i)
		}
	}
}

func TestAnalyzeOggOpusInvalid(t *testing.T) {
	_, _, err := analyzeOggOpus([]byte("random invalid bytes"))
	if err == nil {
		t.Error("expected error for non-Ogg bytes, got nil")
	}

	_, _, err = analyzeOggOpus([]byte("Ogg"))
	if err == nil {
		t.Error("expected error for truncated header, got nil")
	}
}

func TestRegisterAndResolvePollOptions(t *testing.T) {
	msgID := "poll_msg_123"
	question := "What is your favorite color?"
	options := []string{"Red", "Green", "Blue"}

	registerPollOptions(msgID, question, options)

	// Hash the "Red" and "Blue" options
	redHash := sha256.Sum256([]byte("Red"))
	blueHash := sha256.Sum256([]byte("Blue"))

	q, selected := resolvePollOptions(msgID, [][]byte{redHash[:], blueHash[:]})
	if q != question {
		t.Errorf("expected question %q, got %q", question, q)
	}
	if len(selected) != 2 || selected[0] != "Red" || selected[1] != "Blue" {
		t.Errorf("expected [Red Blue], got %v", selected)
	}

	// Unknown poll message ID
	qUnknown, selectedUnknown := resolvePollOptions("non_existent_id", [][]byte{redHash[:]})
	if qUnknown != "" || selectedUnknown != nil {
		t.Errorf("expected empty results for unknown poll, got %q, %v", qUnknown, selectedUnknown)
	}
}

func TestExtractTextContent(t *testing.T) {
	if got := extractTextContent(nil); got != "" {
		t.Errorf("expected empty string for nil message, got %q", got)
	}

	msg1 := &waProto.Message{
		Conversation: proto.String("Hello World"),
	}
	if got := extractTextContent(msg1); got != "Hello World" {
		t.Errorf("expected 'Hello World', got %q", got)
	}

	msg2 := &waProto.Message{
		ExtendedTextMessage: &waProto.ExtendedTextMessage{
			Text: proto.String("Extended text"),
		},
	}
	if got := extractTextContent(msg2); got != "Extended text" {
		t.Errorf("expected 'Extended text', got %q", got)
	}

	msg3 := &waProto.Message{
		ImageMessage: &waProto.ImageMessage{
			Caption: proto.String("Photo caption"),
		},
	}
	if got := extractTextContent(msg3); got != "Photo caption" {
		t.Errorf("expected 'Photo caption', got %q", got)
	}
}

func TestExtractQuotedText(t *testing.T) {
	if got := extractQuotedText(nil); got != "" {
		t.Errorf("expected empty string for nil, got %q", got)
	}

	msg := &waProto.Message{
		ExtendedTextMessage: &waProto.ExtendedTextMessage{
			Text: proto.String("This is a reply"),
			ContextInfo: &waProto.ContextInfo{
				QuotedMessage: &waProto.Message{
					Conversation: proto.String("Original question"),
				},
			},
		},
	}

	if got := extractQuotedText(msg); got != "Original question" {
		t.Errorf("expected 'Original question', got %q", got)
	}
}

func TestExtractMediaInfo(t *testing.T) {
	mediaType, filename, _, _, _, _, _ := extractMediaInfo(nil)
	if mediaType != "" || filename != "" {
		t.Errorf("expected empty for nil message, got %q, %q", mediaType, filename)
	}

	imgMsg := &waProto.Message{
		ImageMessage: &waProto.ImageMessage{
			URL:        proto.String("https://example.com/image.jpg"),
			FileLength: proto.Uint64(1024),
		},
	}
	mType, fName, url, _, _, _, fLen := extractMediaInfo(imgMsg)
	if mType != "image" || url != "https://example.com/image.jpg" || fLen != 1024 || fName == "" {
		t.Errorf("unexpected image media info: type=%q, name=%q, url=%q, len=%d", mType, fName, url, fLen)
	}

	docMsg := &waProto.Message{
		DocumentMessage: &waProto.DocumentMessage{
			FileName: proto.String("report.pdf"),
		},
	}
	dType, dName, _, _, _, _, _ := extractMediaInfo(docMsg)
	if dType != "document" || dName != "report.pdf" {
		t.Errorf("unexpected document media info: type=%q, name=%q", dType, dName)
	}
}

func TestMessageStore(t *testing.T) {
	tmpDir, err := os.MkdirTemp("", "msgstore_test")
	if err != nil {
		t.Fatalf("failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tmpDir)

	dbPath := filepath.Join(tmpDir, "test_messages.db")
	store, err := NewMessageStore(dbPath)
	if err != nil {
		t.Fatalf("failed to initialize MessageStore: %v", err)
	}
	defer store.Close()

	now := time.Now().Truncate(time.Second)

	// Test StoreChat and GetChats
	err = store.StoreChat("123456789@s.whatsapp.net", "Alice", now)
	if err != nil {
		t.Fatalf("StoreChat failed: %v", err)
	}

	err = store.StoreChat("987654321@s.whatsapp.net", "Bob", now.Add(time.Minute))
	if err != nil {
		t.Fatalf("StoreChat failed: %v", err)
	}

	chats, err := store.GetChats()
	if err != nil {
		t.Fatalf("GetChats failed: %v", err)
	}
	if len(chats) != 2 {
		t.Errorf("expected 2 chats, got %d", len(chats))
	}

	// Test StoreMessage and GetMessages
	err = store.StoreMessage("msg1", "123456789@s.whatsapp.net", "Alice", "Hello", "", now, false, "", "", "", nil, nil, nil, 0, "remote")
	if err != nil {
		t.Fatalf("StoreMessage failed: %v", err)
	}

	// Empty content + mediaType should not store
	err = store.StoreMessage("msg2", "123456789@s.whatsapp.net", "Alice", "", "", now, false, "", "", "", nil, nil, nil, 0, "remote")
	if err != nil {
		t.Fatalf("StoreMessage empty failed: %v", err)
	}

	msgs, err := store.GetMessages("123456789@s.whatsapp.net", 10)
	if err != nil {
		t.Fatalf("GetMessages failed: %v", err)
	}
	if len(msgs) != 1 {
		t.Fatalf("expected 1 message, got %d", len(msgs))
	}
	if msgs[0].Content != "Hello" || msgs[0].Sender != "Alice" {
		t.Errorf("unexpected message content: %+v", msgs[0])
	}

	// Test GetRecentMessages
	recent, err := store.GetRecentMessages(10)
	if err != nil {
		t.Fatalf("GetRecentMessages failed: %v", err)
	}
	if len(recent) != 1 {
		t.Fatalf("expected 1 recent message, got %d", len(recent))
	}
	if recent[0]["senderName"] != "Alice" {
		t.Errorf("expected senderName 'Alice', got %v", recent[0]["senderName"])
	}

	// Test StoreMediaInfo and GetMediaInfo
	key := []byte("secret_key")
	sha := []byte("sha_hash")
	err = store.StoreMediaInfo("msg1", "123456789@s.whatsapp.net", "https://example.com/file", key, sha, sha, 2048)
	if err != nil {
		t.Fatalf("StoreMediaInfo failed: %v", err)
	}

	_, _, url, mediaKey, _, _, fileLen, err := store.GetMediaInfo("msg1", "123456789@s.whatsapp.net")
	if err != nil {
		t.Fatalf("GetMediaInfo failed: %v", err)
	}
	if url != "https://example.com/file" || string(mediaKey) != string(key) || fileLen != 2048 {
		t.Errorf("unexpected media info: url=%q, key=%s, len=%d", url, string(mediaKey), fileLen)
	}

	// Test StorePollVote
	err = store.StorePollVote("poll_1", "123456789@s.whatsapp.net", "Favorite color?", "Blue", now)
	if err != nil {
		t.Fatalf("StorePollVote failed: %v", err)
	}
}

func TestTenantApiSentTracking(t *testing.T) {
	tenant := &Tenant{}

	if tenant.isApiSent("msg_abc") {
		t.Error("expected isApiSent to be false for untracked message")
	}

	tenant.recordApiSent("msg_abc")
	if !tenant.isApiSent("msg_abc") {
		t.Error("expected isApiSent to be true after recordApiSent")
	}

	// Empty ID should be ignored safely
	tenant.recordApiSent("")
	if tenant.isApiSent("") {
		t.Error("empty ID should return false")
	}
}

func TestGetChatName_ExistingInStore(t *testing.T) {
	tmpDir, err := os.MkdirTemp("", "msgstore_name_test")
	if err != nil {
		t.Fatalf("failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tmpDir)

	dbPath := filepath.Join(tmpDir, "test_name.db")
	store, err := NewMessageStore(dbPath)
	if err != nil {
		t.Fatalf("failed to initialize MessageStore: %v", err)
	}
	defer store.Close()

	chatJID := "123456789@s.whatsapp.net"
	_ = store.StoreChat(chatJID, "Stored Contact Name", time.Now())

	name := GetChatName(nil, nil, store, types.JID{}, chatJID, nil, "", waLog.Noop)
	if name != "Stored Contact Name" {
		t.Errorf("expected 'Stored Contact Name', got %q", name)
	}
}

