package bridge

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	waLog "go.mau.fi/whatsmeow/util/log"
	"go.mau.fi/whatsmeow/types"
	"go.mau.fi/whatsmeow"
)

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

// HealthHandler exposes the health check endpoint for internal and E2E testing.
func HealthHandler(manager *TenantManager) http.HandlerFunc {
	return healthHandler(manager)
}

func healthHandler(manager *TenantManager) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		list := manager.List()
		connectedCount := 0
		for _, t := range list {
			if c, ok := t["connected"].(bool); ok && c {
				connectedCount++
			}
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"status":           "healthy",
			"uptimeSeconds":    int(time.Since(manager.startedAt).Seconds()),
			"totalTenants":     len(list),
			"connectedTenants": connectedCount,
			"tenants":          list,
		})
	}
}

// ConnectionsHandler exposes the connections management endpoint for internal and E2E testing.
func ConnectionsHandler(manager *TenantManager) http.HandlerFunc {
	return connectionsHandler(manager)
}

func connectionsHandler(manager *TenantManager) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if !checkBridgeAuth(r) {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}

		path := strings.TrimPrefix(r.URL.Path, "/api/connections")
		path = strings.TrimPrefix(path, "/")
		parts := strings.Split(strings.TrimSuffix(path, "/"), "/")
		hash := parts[0]

		// GET /api/connections or /api/connections/ -> list all tenants
		if hash == "" {
			if r.Method == http.MethodGet {
				w.Header().Set("Content-Type", "application/json")
				json.NewEncoder(w).Encode(map[string]interface{}{
					"connections": manager.List(),
				})
				return
			}
			http.Error(w, "invalid hash", http.StatusBadRequest)
			return
		}

		sub := ""
		if len(parts) > 1 {
			sub = parts[1]
		}

		switch {
		case sub == "" && r.Method == http.MethodPost:
			handleProvisionOrUpdate(w, r, manager, hash)
		case sub == "" && r.Method == http.MethodDelete:
			handleDeleteTenant(w, r, manager, hash)
		case sub == "" && r.Method == http.MethodGet:
			handleStatus(w, r, manager.Get(hash))
		case sub == "status" && r.Method == http.MethodGet:
			handleStatus(w, r, manager.Get(hash))
		case sub == "reconnect" && r.Method == http.MethodPost:
			handleReconnect(w, r, manager, hash)
		case sub == "disconnect" && r.Method == http.MethodPost:
			handleDisconnect(w, r, manager, hash)
		case sub == "messages" && r.Method == http.MethodGet:
			handleRecentMessages(w, r, manager.Get(hash))
		case sub == "qr" && r.Method == http.MethodGet:
			handleQR(w, r, manager.Get(hash))
		case sub == "grant" && r.Method == http.MethodPost:
			handleGrant(w, r, manager.Get(hash))
		case sub == "send" && r.Method == http.MethodPost:
			handleSend(w, r, manager.Get(hash))
		case sub == "avatar" && r.Method == http.MethodGet:
			handleProfilePicture(w, r, manager.Get(hash))
		case len(parts) >= 4 && parts[1] == "chats" && parts[3] == "settings":
			handleChatSettings(w, r, manager.Get(hash), parts[2])
		default:
			http.NotFound(w, r)
		}
	}
}

func handleProvisionOrUpdate(w http.ResponseWriter, r *http.Request, manager *TenantManager, hash string) {
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
}

func handleReconnect(w http.ResponseWriter, r *http.Request, manager *TenantManager, hash string) {
	tenant := manager.Get(hash)
	if tenant == nil {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}
	err := tenant.reconnect()
	w.Header().Set("Content-Type", "application/json")
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success": false,
			"error":   err.Error(),
			"status":  tenant.status(),
		})
		return
	}
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"status":  tenant.status(),
	})
}

func handleDisconnect(w http.ResponseWriter, r *http.Request, manager *TenantManager, hash string) {
	tenant := manager.Get(hash)
	if tenant == nil {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}
	tenant.disconnect()
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"status":  tenant.status(),
	})
}

func handleDeleteTenant(w http.ResponseWriter, r *http.Request, manager *TenantManager, hash string) {
	if err := manager.Remove(hash); err != nil {
		http.Error(w, err.Error(), http.StatusNotFound)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"hash":    hash,
	})
}

func handleStatus(w http.ResponseWriter, r *http.Request, tenant *Tenant) {
	if tenant == nil {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(tenant.status())
}

func handleRecentMessages(w http.ResponseWriter, r *http.Request, tenant *Tenant) {
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
}

func handleQR(w http.ResponseWriter, r *http.Request, tenant *Tenant) {
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
}

func handleGrant(w http.ResponseWriter, r *http.Request, tenant *Tenant) {
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
}

func handleSend(w http.ResponseWriter, r *http.Request, tenant *Tenant) {
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
}

func handleChatSettings(w http.ResponseWriter, r *http.Request, tenant *Tenant, jid string) {
	if tenant == nil || tenant.messageStore == nil {
		http.Error(w, "tenant or message store not found", http.StatusNotFound)
		return
	}

	var altJIDs []string
	if tenant.client != nil && tenant.client.Store != nil && tenant.client.Store.LIDs != nil {
		ctx := context.Background()
		if strings.HasSuffix(jid, "@s.whatsapp.net") {
			if parsed, err := types.ParseJID(jid); err == nil {
				if lid, err := tenant.client.Store.LIDs.GetLIDForPN(ctx, parsed); err == nil && !lid.IsEmpty() {
					altJIDs = append(altJIDs, lid.String())
				}
			}
		} else if strings.HasSuffix(jid, "@lid") {
			if parsed, err := types.ParseJID(jid); err == nil {
				if pn, err := tenant.client.Store.LIDs.GetPNForLID(ctx, parsed); err == nil && !pn.IsEmpty() {
					altJIDs = append(altJIDs, pn.String())
				}
			}
		}
	}

	w.Header().Set("Content-Type", "application/json")
	switch r.Method {
	case http.MethodGet:
		settings, err := tenant.messageStore.GetChatSettingsFlexible(jid, altJIDs)
		if err != nil {
			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(map[string]interface{}{"error": err.Error()})
			return
		}
		if settings == nil {
			settings = &ChatSettings{
				JID:          jid,
				Relationship: "",
				FriendCircle: []string{},
				CustomPrompt: "",
				Model:        "",
			}
		}
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success":  true,
			"settings": settings,
		})

	case http.MethodPost:
		var body struct {
			Relationship string   `json:"relationship"`
			FriendCircle []string `json:"friendCircle"`
			CustomPrompt string   `json:"customPrompt"`
			Model        string   `json:"model"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(map[string]interface{}{"error": "invalid json body"})
			return
		}
		cs := &ChatSettings{
			JID:          jid,
			Relationship: strings.TrimSpace(body.Relationship),
			FriendCircle: body.FriendCircle,
			CustomPrompt: strings.TrimSpace(body.CustomPrompt),
			Model:        strings.TrimSpace(body.Model),
			UpdatedAt:    time.Now(),
		}
		if err := tenant.messageStore.SaveChatSettings(cs); err != nil {
			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(map[string]interface{}{"error": err.Error()})
			return
		}
		// Also save under any alternative LID/PN JID so both reference the same configuration
		for _, alt := range altJIDs {
			if alt != "" && alt != jid {
				altCS := *cs
				altCS.JID = alt
				_ = tenant.messageStore.SaveChatSettings(&altCS)
			}
		}
		tenant.logger.Infof("Updated chat settings for %s (relationship length: %d)", jid, len(cs.Relationship))
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success":  true,
			"settings": cs,
		})

	default:
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
	}
}

func handleProfilePicture(w http.ResponseWriter, r *http.Request, tenant *Tenant) {
	if tenant == nil || tenant.client == nil || !tenant.client.IsConnected() {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusServiceUnavailable)
		json.NewEncoder(w).Encode(map[string]interface{}{"error": "whatsapp client not connected"})
		return
	}

	target := r.URL.Query().Get("jid")
	if target == "" {
		target = r.URL.Query().Get("phone")
	}
	if target == "" {
		http.Error(w, "missing jid parameter", http.StatusBadRequest)
		return
	}

	var targetJID types.JID
	var err error
	if strings.Contains(target, "@") {
		targetJID, err = types.ParseJID(target)
		if err != nil {
			http.Error(w, "invalid jid", http.StatusBadRequest)
			return
		}
	} else {
		clean := cleanPhoneDigits(target)
		if clean == "" {
			http.Error(w, "invalid phone", http.StatusBadRequest)
			return
		}
		targetJID = types.JID{User: clean, Server: "s.whatsapp.net"}
	}

	picInfo, err := tenant.client.GetProfilePictureInfo(r.Context(), targetJID, &whatsmeow.GetProfilePictureParams{
		Preview: true,
	})
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success": false,
			"url":     "",
			"error":   err.Error(),
		})
		return
	}

	if picInfo == nil || picInfo.URL == "" {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success": true,
			"url":     "",
		})
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"url":     picInfo.URL,
		"id":      picInfo.ID,
		"type":    picInfo.Type,
	})
}

func startMultiTenantServer(port int, logger waLog.Logger) {
	manager := NewTenantManager(logger)

	// Start background supervisor
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	manager.StartSupervisor(ctx)

	http.HandleFunc("/api/health", healthHandler(manager))
	http.HandleFunc("/api/connections", connectionsHandler(manager))
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
	cancel()
	_ = srv.Shutdown(context.Background())
}
