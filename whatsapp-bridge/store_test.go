package main

import (
	"os"
	"testing"
	"time"
)

func TestNewMessageStore_Errors(t *testing.T) {
	// Invalid path where directory cannot be created
	_, err := NewMessageStore("/dev/null/subfolder/messages.db")
	if err == nil {
		t.Error("expected error creating MessageStore with invalid path, got nil")
	}
}

func TestMigrateSchema_Idempotent(t *testing.T) {
	store, tmpDir := createTestMessageStore(t)
	defer os.RemoveAll(tmpDir)
	defer store.Close()

	// Calling migrateSchema on an already migrated database should succeed gracefully
	err := migrateSchema(store.db)
	if err != nil {
		t.Errorf("expected migrateSchema to be idempotent, got error: %v", err)
	}
}

func TestMessageStore_AllOperations(t *testing.T) {
	store, tmpDir := createTestMessageStore(t)
	defer os.RemoveAll(tmpDir)

	now := time.Now().Truncate(time.Second)

	// 1. StoreChat and GetChats
	err := store.StoreChat("chat1@s.whatsapp.net", "Chat One", now)
	if err != nil {
		t.Fatalf("StoreChat failed: %v", err)
	}
	err = store.StoreChat("chat2@s.whatsapp.net", "Chat Two", now.Add(10*time.Minute))
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

	// 2. StoreMessage empty content and media (skipped)
	err = store.StoreMessage("empty_msg", "chat1@s.whatsapp.net", "user", "", "", now, false, "", "", "", nil, nil, nil, 0, "remote")
	if err != nil {
		t.Fatalf("StoreMessage empty should succeed: %v", err)
	}

	// 3. StoreMessage with content and media
	err = store.StoreMessage("msg1", "chat1@s.whatsapp.net", "user", "Hello text", "quote1", now, false, "", "", "", nil, nil, nil, 0, "remote")
	if err != nil {
		t.Fatalf("StoreMessage failed: %v", err)
	}

	err = store.StoreMessage("msg2", "chat1@s.whatsapp.net", "owner", "Media caption", "", now.Add(time.Second), true, "image", "pic.jpg", "https://example.com/pic.jpg", []byte("key"), []byte("sha"), []byte("enc"), 1024, "api")
	if err != nil {
		t.Fatalf("StoreMessage media failed: %v", err)
	}

	// 4. GetMessages
	msgs, err := store.GetMessages("chat1@s.whatsapp.net", 10)
	if err != nil {
		t.Fatalf("GetMessages failed: %v", err)
	}
	if len(msgs) != 2 {
		t.Fatalf("expected 2 messages, got %d", len(msgs))
	}
	if msgs[0].Content != "Media caption" || msgs[1].Content != "Hello text" {
		t.Errorf("unexpected message order or content: %+v", msgs)
	}

	// 5. StorePollVote with empty pollMsgID (skipped)
	err = store.StorePollVote("", "voter@s.whatsapp.net", "question", "option", now)
	if err != nil {
		t.Fatalf("StorePollVote empty ID should succeed: %v", err)
	}

	// 6. StorePollVote with valid pollMsgID
	err = store.StorePollVote("poll1", "voter@s.whatsapp.net", "Favorite animal?", "Dog", now)
	if err != nil {
		t.Fatalf("StorePollVote failed: %v", err)
	}

	// 7. GetRecentMessages (limit <= 0 tests default limit 20)
	recentDef, err := store.GetRecentMessages(0)
	if err != nil {
		t.Fatalf("GetRecentMessages(0) failed: %v", err)
	}
	if len(recentDef) != 2 {
		t.Errorf("expected 2 recent messages, got %d", len(recentDef))
	}

	// Message from chat with empty name in chats table (testing coalesce)
	_ = store.StoreChat("orphan@s.whatsapp.net", "", now.Add(2*time.Second))
	err = store.StoreMessage("msg_no_chat", "orphan@s.whatsapp.net", "orphan_user", "Orphan text", "", now.Add(2*time.Second), false, "", "", "", nil, nil, nil, 0, "remote")
	if err != nil {
		t.Fatalf("StoreMessage orphan failed: %v", err)
	}

	recentCustom, err := store.GetRecentMessages(5)
	if err != nil {
		t.Fatalf("GetRecentMessages(5) failed: %v", err)
	}
	if len(recentCustom) != 3 {
		t.Errorf("expected 3 recent messages, got %d", len(recentCustom))
	}

	// 8. StoreMediaInfo and GetMediaInfo
	err = store.StoreMediaInfo("msg1", "chat1@s.whatsapp.net", "https://example.com/updated", []byte("newkey"), []byte("newsha"), []byte("newenc"), 2048)
	if err != nil {
		t.Fatalf("StoreMediaInfo failed: %v", err)
	}

	mType, fName, url, key, sha, encSha, fLen, err := store.GetMediaInfo("msg1", "chat1@s.whatsapp.net")
	if err != nil {
		t.Fatalf("GetMediaInfo failed: %v", err)
	}
	if url != "https://example.com/updated" || string(key) != "newkey" || string(sha) != "newsha" || string(encSha) != "newenc" || fLen != 2048 {
		t.Errorf("unexpected media info: type=%s, name=%s, url=%s, key=%s, len=%d", mType, fName, url, string(key), fLen)
	}

	// Non-existent message
	_, _, _, _, _, _, _, err = store.GetMediaInfo("nonexistent", "chat1@s.whatsapp.net")
	if err == nil {
		t.Errorf("expected error for nonexistent message GetMediaInfo")
	}

	// 9. Close
	err = store.Close()
	if err != nil {
		t.Fatalf("Close failed: %v", err)
	}

	// 10. Operations on closed database return errors
	if _, err := store.GetChats(); err == nil {
		t.Error("expected error on closed db GetChats")
	}
	if _, err := store.GetMessages("chat1@s.whatsapp.net", 10); err == nil {
		t.Error("expected error on closed db GetMessages")
	}
	if _, err := store.GetRecentMessages(10); err == nil {
		t.Error("expected error on closed db GetRecentMessages")
	}
}
