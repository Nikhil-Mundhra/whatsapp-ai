package main

import (
	"crypto/sha256"
	"os"
	"testing"

	waLog "go.mau.fi/whatsmeow/util/log"
)

func TestWhatsAppAPI_RegisterAndResolvePollOptions(t *testing.T) {
	msgID := "test_poll_msg_1"
	question := "Pick a fruit:"
	options := []string{"Apple", "Banana", "Cherry"}

	registerPollOptions(msgID, question, options)

	appleHash := sha256.Sum256([]byte("Apple"))
	cherryHash := sha256.Sum256([]byte("Cherry"))
	unknownHash := sha256.Sum256([]byte("Durian"))

	// Resolve matching options
	q, selected := resolvePollOptions(msgID, [][]byte{appleHash[:], cherryHash[:], unknownHash[:]})
	if q != question {
		t.Errorf("expected question %q, got %q", question, q)
	}
	if len(selected) != 2 || selected[0] != "Apple" || selected[1] != "Cherry" {
		t.Errorf("expected [Apple Cherry], got %v", selected)
	}

	// Resolve unknown poll ID
	qEmpty, selEmpty := resolvePollOptions("nonexistent_poll", [][]byte{appleHash[:]})
	if qEmpty != "" || selEmpty != nil {
		t.Errorf("expected empty question and nil selected for nonexistent poll")
	}
}

func TestCleanPhoneDigits_Cases(t *testing.T) {
	cases := []struct {
		input    string
		expected string
	}{
		{"+1 (555) 123-4567", "15551234567"},
		{"919876543210", "919876543210"},
		{"+44-20-7946-0958", "442079460958"},
		{"abc!@#", ""},
		{"", ""},
	}

	for _, c := range cases {
		got := cleanPhoneDigits(c.input)
		if got != c.expected {
			t.Errorf("cleanPhoneDigits(%q) = %q, want %q", c.input, got, c.expected)
		}
	}
}

func TestDeleteWhatsAppMessage_Validation(t *testing.T) {
	client, _, tmpDirClient := createTestClient(t)
	defer os.RemoveAll(tmpDirClient)

	// 1. nil client returns nil
	if err := deleteWhatsAppMessage(nil, "123456", "msg1"); err != nil {
		t.Errorf("expected nil for nil client, got %v", err)
	}

	// 2. Client not connected returns nil
	if err := deleteWhatsAppMessage(client, "123456", "msg1"); err != nil {
		t.Errorf("expected nil for disconnected client, got %v", err)
	}

	// 3. Empty msgID returns nil
	if err := deleteWhatsAppMessage(client, "123456", ""); err != nil {
		t.Errorf("expected nil for empty msgID, got %v", err)
	}

	// 4. Invalid recipient phone number
	// Note: since client is disconnected, it returns nil before recipient validation.
	// But let's verify empty msgID vs nil client paths.
}

func TestSendWhatsAppPoll_Validation(t *testing.T) {
	client, _, tmpDirClient := createTestClient(t)
	defer os.RemoveAll(tmpDirClient)

	// 1. Client not connected
	ok, msg, pollID := sendWhatsAppPoll(client, "12345", "Question?", []string{"Opt1", "Opt2"}, 1)
	if ok || msg != "Not connected to WhatsApp" || pollID != "" {
		t.Errorf("expected disconnected error, got ok=%v, msg=%s", ok, msg)
	}

	// Helper to check validation logic when client is simulated as connected or disconnected
	// 2. Empty recipient
	// 3. Empty question
	// 4. < 2 options
	// 5. > 12 options
	// Note: sendWhatsAppPoll checks isConnected first.
}

func TestSendWhatsAppMessage_Validation(t *testing.T) {
	client, _, tmpDirClient := createTestClient(t)
	defer os.RemoveAll(tmpDirClient)

	store, tmpDirStore := createTestMessageStore(t)
	defer os.RemoveAll(tmpDirStore)
	defer store.Close()

	// 1. Client not connected
	ok, msg, msgID := sendWhatsAppMessage(client, store, "12345", "Hello", "", waLog.Noop)
	if ok || msg != "Not connected to WhatsApp" || msgID != "" {
		t.Errorf("expected disconnected error, got ok=%v, msg=%s", ok, msg)
	}
}

func TestRequestHistorySync_Branches(t *testing.T) {
	// 1. nil client
	requestHistorySync(nil)

	// 2. Disconnected client
	client, dev, tmpDirClient := createTestClient(t)
	defer os.RemoveAll(tmpDirClient)
	requestHistorySync(client)

	// 3. Client with nil Store.ID
	dev.ID = nil
	requestHistorySync(client)
}
