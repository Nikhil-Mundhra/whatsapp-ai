package bridge

import (
	"context"
	"os"
	"path/filepath"
	"testing"

	"go.mau.fi/whatsmeow"
	"go.mau.fi/whatsmeow/store"
	"go.mau.fi/whatsmeow/types"
	waLog "go.mau.fi/whatsmeow/util/log"
)

type mockContactStore struct {
	store.ContactStore
	contacts map[types.JID]types.ContactInfo
}

func (m *mockContactStore) GetContact(ctx context.Context, jid types.JID) (types.ContactInfo, error) {
	if m == nil || m.contacts == nil {
		return types.ContactInfo{}, nil
	}
	if c, ok := m.contacts[jid]; ok {
		return c, nil
	}
	return types.ContactInfo{}, nil
}

type mockLIDStore struct {
	store.LIDStore
	pnToLID map[types.JID]types.JID
	lidToPN map[types.JID]types.JID
}

func (m *mockLIDStore) GetPNForLID(ctx context.Context, lid types.JID) (types.JID, error) {
	if m == nil || m.lidToPN == nil {
		return types.EmptyJID, nil
	}
	if pn, ok := m.lidToPN[lid]; ok {
		return pn, nil
	}
	return types.EmptyJID, nil
}

func (m *mockLIDStore) GetLIDForPN(ctx context.Context, pn types.JID) (types.JID, error) {
	if m == nil || m.pnToLID == nil {
		return types.EmptyJID, nil
	}
	if lid, ok := m.pnToLID[pn]; ok {
		return lid, nil
	}
	return types.EmptyJID, nil
}

func createTestClient(t *testing.T) (*whatsmeow.Client, *store.Device, string) {
	tmpDir, err := os.MkdirTemp("", "wa_test_client")
	if err != nil {
		t.Fatalf("failed to create temp dir: %v", err)
	}

	dev := &store.Device{
		Log: waLog.Noop,
		ID: &types.JID{
			User:   "1234567890",
			Server: "s.whatsapp.net",
		},
		PushName: "TestOwner",
		Contacts: &mockContactStore{
			contacts: make(map[types.JID]types.ContactInfo),
		},
		LIDs: &mockLIDStore{
			pnToLID: make(map[types.JID]types.JID),
			lidToPN: make(map[types.JID]types.JID),
		},
	}

	client := whatsmeow.NewClient(dev, waLog.Noop)
	return client, dev, tmpDir
}

func createTestMessageStore(t *testing.T) (*MessageStore, string) {
	tmpDir, err := os.MkdirTemp("", "msgstore_test")
	if err != nil {
		t.Fatalf("failed to create temp dir: %v", err)
	}
	dbPath := filepath.Join(tmpDir, "messages.db")
	ms, err := NewMessageStore(dbPath)
	if err != nil {
		t.Fatalf("failed to create message store: %v", err)
	}
	return ms, tmpDir
}
