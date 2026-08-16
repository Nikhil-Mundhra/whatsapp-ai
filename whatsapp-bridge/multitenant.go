package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
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
	"go.mau.fi/whatsmeow/types/events"
	waLog "go.mau.fi/whatsmeow/util/log"
)

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

	qrCode    string
	qrUpdated time.Time
	paired    bool
	pairing   bool
}

// TenantManager holds all provisioned tenants keyed by setup hash.
type TenantManager struct {
	mu      sync.Mutex
	tenants map[string]*Tenant
	logger  waLog.Logger
}

func NewTenantManager(logger waLog.Logger) *TenantManager {
	return &TenantManager{
		tenants: make(map[string]*Tenant),
		logger:  logger,
	}
}

func (m *TenantManager) Get(hash string) *Tenant {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.tenants[hash]
}

func (m *TenantManager) Has(hash string) bool {
	return m.Get(hash) != nil
}

func (m *TenantManager) Add(t *Tenant) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.tenants[t.Hash] = t
}

// dir returns the per-tenant data directory (e.g. store/tenants/<hash>).
func (t *Tenant) dir() string {
	return filepath.Join("store", "tenants", t.Hash)
}

// provision creates (or reloads) the whatsmeow client for this tenant and
// starts pairing if not yet linked. Returns the QR code to scan.
func (t *Tenant) provision() (string, error) {
	t.mu.Lock()
	defer t.mu.Unlock()

	if t.paired {
		return "", nil
	}
	if t.pairing {
		return t.qrCode, nil
	}
	t.pairing = true

	dir := t.dir()
	if err := os.MkdirAll(dir, 0755); err != nil {
		return "", fmt.Errorf("failed to create tenant dir: %v", err)
	}

	dbLog := waLog.Stdout(fmt.Sprintf("Tenant-%s/DB", t.Hash), "INFO", true)
	container, err := sqlstore.New(context.Background(), "sqlite3", "file:"+filepath.Join(dir, "whatsapp.db")+"?_foreign_keys=on", dbLog)
	if err != nil {
		return "", fmt.Errorf("failed to open device store: %v", err)
	}
	t.container = container

	var deviceStore *store.Device
	if t.client == nil {
		deviceStore, err = container.GetFirstDevice(context.Background())
		if err == sql.ErrNoRows {
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

	t.client.AddEventHandler(func(evt interface{}) {
		switch v := evt.(type) {
		case *events.Message:
			if v.Message.GetPollUpdateMessage() != nil {
				handlePollVote(t.client, t.messageStore, v, t.logger)
			} else {
				handleMessage(t.client, t.messageStore, v, t.logger)
			}
		case *events.HistorySync:
			handleHistorySync(t.client, t.messageStore, v, t.logger)
		case *events.Connected:
			t.logger.Infof("Tenant %s connected", t.Hash)
		case *events.LoggedOut:
			t.logger.Warnf("Tenant %s logged out", t.Hash)
			t.mu.Lock()
			t.paired = false
			t.pairing = false
			t.qrCode = ""
			t.mu.Unlock()
		}
	})

	if t.client.Store.ID != nil {
		// Already linked in a previous run — just connect.
		if err := t.client.Connect(); err != nil {
			return "", fmt.Errorf("failed to connect: %v", err)
		}
		t.paired = true
		return "", nil
	}

	// Fresh device: run the QR pairing loop in the background.
	go t.pairLoop()
	return t.qrCode, nil
}

// pairLoop requests QR codes until the user scans one and pairing succeeds.
func (t *Tenant) pairLoop() {
	defer func() {
		t.mu.Lock()
		t.pairing = false
		t.mu.Unlock()
	}()

	for {
		qrChan, err := t.client.GetQRChannel(context.Background())
		if err != nil {
			t.logger.Errorf("Tenant %s failed to get QR channel: %v", t.Hash, err)
			time.Sleep(2 * time.Second)
			continue
		}
		if err := t.client.Connect(); err != nil {
			t.logger.Errorf("Tenant %s failed to connect: %v", t.Hash, err)
			time.Sleep(2 * time.Second)
			continue
		}

		for evt := range qrChan {
			switch evt.Event {
			case whatsmeow.QRChannelEventCode:
				t.mu.Lock()
				t.qrCode = evt.Code
				t.qrUpdated = time.Now()
				t.mu.Unlock()
				fmt.Printf("\n[tenant %s] Scan this QR code with WhatsApp:\n", t.Hash)
				qrterminal.GenerateHalfBlock(evt.Code, qrterminal.L, os.Stdout)
			case whatsmeow.QRChannelEventError:
				t.logger.Errorf("Tenant %s pairing error: %v", t.Hash, evt.Error)
			case whatsmeow.QRChannelSuccess.Event:
				t.mu.Lock()
				t.paired = true
				t.mu.Unlock()
				fmt.Printf("\n[tenant %s] Linked and authenticated!\n", t.Hash)
				return
			case whatsmeow.QRChannelTimeout.Event:
				t.logger.Infof("Tenant %s QR expired, requesting new one", t.Hash)
			}
		}
		t.client.Disconnect()
	}
}

func (t *Tenant) status() map[string]interface{} {
	t.mu.Lock()
	defer t.mu.Unlock()
	return map[string]interface{}{
		"hash":       t.Hash,
		"linked":     t.paired,
		"pairing":    t.pairing,
		"connected":  t.client != nil && t.client.IsConnected(),
		"hasQR":      t.qrCode != "",
		"qrAge":      int(time.Since(t.qrUpdated).Seconds()),
	}
}

// sendToRecipient sends a plain text message from this tenant.
func (t *Tenant) sendToRecipient(recipient, message string) (bool, string) {
	if t.client == nil || !t.client.IsConnected() {
		return false, "tenant not connected"
	}
	return sendWhatsAppMessage(t.client, t.messageStore, recipient, message, "", t.logger)
}

// sendPollToRecipient sends an interactive poll from this tenant.
func (t *Tenant) sendPollToRecipient(recipient, question string, options []string, selectableCount int) (bool, string, string) {
	if t.client == nil || !t.client.IsConnected() {
		return false, "tenant not connected", ""
	}
	return sendWhatsAppPoll(t.client, recipient, question, options, selectableCount)
}

// startMultiTenantServer wires the multi-tenant REST API and blocks forever.
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
				}
				manager.Add(tenant)
			} else {
				if body.OwnerPhone != "" {
					tenant.ownerPhone = body.OwnerPhone
				}
				if len(recipients) > 0 {
					tenant.recipients = recipients
				}
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

		case sub == "qr" && r.Method == http.MethodGet:
			tenant := manager.Get(hash)
			if tenant == nil {
				http.Error(w, "not found", http.StatusNotFound)
				return
			}
			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(map[string]interface{}{
				"hash": hash,
				"qr":   tenant.qrCode,
			})
			return

		default:
			http.Error(w, "not found", http.StatusNotFound)
		}
	})

	addr := fmt.Sprintf("0.0.0.0:%d", port)
	fmt.Printf("Multi-tenant bridge listening on %s\n", addr)
	go func() {
		if err := http.ListenAndServe(addr, nil); err != nil {
			fmt.Printf("Multi-tenant server error: %v\n", err)
		}
	}()

	exitChan := make(chan os.Signal, 1)
	signal.Notify(exitChan, syscall.SIGINT, syscall.SIGTERM)
	<-exitChan
}
