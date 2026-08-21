package bridge

import (
	"testing"
	"time"

	"go.mau.fi/whatsmeow/types"
)

func TestCosineSimilarity(t *testing.T) {
	a := []float32{1.0, 2.0, 3.0}
	b := []float32{1.0, 2.0, 3.0}

	sim := CosineSimilarity(a, b)
	if sim < 0.999 || sim > 1.001 {
		t.Errorf("Expected 1.0 for identical vectors, got %f", sim)
	}

	c := []float32{-1.0, -2.0, -3.0}
	simOpp := CosineSimilarity(a, c)
	if simOpp > -0.999 {
		t.Errorf("Expected -1.0 for opposite vectors, got %f", simOpp)
	}

	// Empty vectors or mismatched lengths
	if CosineSimilarity(nil, a) != 0 || CosineSimilarity(a, []float32{1.0}) != 0 {
		t.Errorf("Expected 0 for invalid vector inputs")
	}
}

func TestFloat32SliceByteConversion(t *testing.T) {
	orig := []float32{0.123, -0.456, 78.9, 0.0}
	bytes := Float32SliceToBytes(orig)
	reconstructed := BytesToFloat32Slice(bytes)

	if len(reconstructed) != len(orig) {
		t.Fatalf("Length mismatch: got %d, expected %d", len(reconstructed), len(orig))
	}
	for i := range orig {
		if orig[i] != reconstructed[i] {
			t.Errorf("At index %d: expected %f, got %f", i, orig[i], reconstructed[i])
		}
	}

	if BytesToFloat32Slice([]byte{1, 2, 3}) != nil {
		t.Errorf("Expected nil for malformed byte slice")
	}
}

func TestIsHighSignalMemory(t *testing.T) {
	// High-signal texts
	valid1 := "Let's meet tomorrow at 5pm at the cafe for coffee and work"
	valid2 := "Don't forget to book the flights for our vacation next week"
	if !IsHighSignalMemory(valid1) {
		t.Errorf("Expected valid1 to be high signal: %q", valid1)
	}
	if !IsHighSignalMemory(valid2) {
		t.Errorf("Expected valid2 to be high signal: %q", valid2)
	}

	// Low-signal garbage texts
	garbageList := []string{
		"ok",
		"k",
		"hmm",
		"yaaa",
		"goodnight",
		"sweet dreams",
		"mwahhh",
		"❤️❤️❤️",
		"😘😘😘😘😘",
		"[image - Message ID: 12345]",
		"haha lol",
		"bye",
		"theek hai",
	}

	for _, g := range garbageList {
		if IsHighSignalMemory(g) {
			t.Errorf("Expected garbage text to be rejected: %q", g)
		}
	}
}

func TestBuildConversationChunks(t *testing.T) {
	now := time.Now()
	msgs := []Message{
		{
			Time:     now.Add(-10 * time.Minute),
			Sender:   "214572824805466",
			Content:  "Hey Nikhil what are your thoughts on moving to London next year?",
			IsFromMe: false,
		},
		{
			Time:     now.Add(-9 * time.Minute),
			Sender:   "Me",
			Content:  "I think London is a great idea, we should definitely look for flats in September",
			IsFromMe: true,
		},
		{
			Time:     now.Add(-1 * time.Minute),
			Sender:   "214572824805466",
			Content:  "ok",
			IsFromMe: false,
		},
		{
			Time:     now,
			Sender:   "214572824805466",
			Content:  "gn",
			IsFromMe: false,
		},
	}

	chunks := BuildConversationChunks(msgs, "214572824805466@lid", "Neha", 3*time.Minute)
	if len(chunks) == 0 {
		t.Fatalf("Expected at least 1 high-signal conversation chunk, got 0")
	}

	// The chunk should contain London conversation and speaker label Neha
	if chunks[0].Speaker != "Neha" {
		t.Errorf("Expected Speaker to be Neha, got %s", chunks[0].Speaker)
	}
}

func TestFormatSemanticMemories(t *testing.T) {
	memories := []ScoredMemory{
		{
			Memory: SemanticMemory{
				ID:        "mem_1",
				Timestamp: time.Date(2026, 7, 14, 12, 0, 0, 0, time.UTC),
				Snippet:   "Neha: Why do you always call me Nehaaaa?\nMe: Because 1 a is not enough for you",
			},
			Similarity: 0.89,
		},
	}

	formatted := FormatSemanticMemories(memories)
	if formatted == "" {
		t.Fatalf("Expected non-empty formatted memory block")
	}
	if !testing.Short() && len(formatted) < 20 {
		t.Errorf("Formatted memory too short: %s", formatted)
	}
}

func TestResolveSenderDisplayName(t *testing.T) {
	tenant := &Tenant{
		Hash: "test_tenant",
	}

	targetJID := types.NewJID("214572824805466", "lid")

	// When raw LID is passed and no contact name exists, it cleans digits or returns clean label
	name := tenant.resolveSenderDisplayName("214572824805466", targetJID)
	if name == "" {
		t.Errorf("Expected non-empty sender display name")
	}
}
