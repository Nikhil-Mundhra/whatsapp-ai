package bridge

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	waLog "go.mau.fi/whatsmeow/util/log"
)

func TestSendHandler(t *testing.T) {
	client, _, tmpDirClient := createTestClient(t)
	defer os.RemoveAll(tmpDirClient)

	store, tmpDirStore := createTestMessageStore(t)
	defer os.RemoveAll(tmpDirStore)
	defer store.Close()

	handler := sendHandler(client, store, waLog.Noop)

	// 1. Method not allowed (GET)
	reqGET := httptest.NewRequest(http.MethodGet, "/api/send", nil)
	wGET := httptest.NewRecorder()
	handler.ServeHTTP(wGET, reqGET)
	if wGET.Code != http.StatusMethodNotAllowed {
		t.Errorf("expected 405, got %d", wGET.Code)
	}

	// 2. Invalid JSON body
	reqBadJSON := httptest.NewRequest(http.MethodPost, "/api/send", strings.NewReader("invalid json"))
	wBadJSON := httptest.NewRecorder()
	handler.ServeHTTP(wBadJSON, reqBadJSON)
	if wBadJSON.Code != http.StatusBadRequest {
		t.Errorf("expected 400 for bad JSON, got %d", wBadJSON.Code)
	}

	// 3. Missing recipient
	bodyNoRecipient, _ := json.Marshal(SendMessageRequest{Message: "hello"})
	reqNoRecipient := httptest.NewRequest(http.MethodPost, "/api/send", bytes.NewReader(bodyNoRecipient))
	wNoRecipient := httptest.NewRecorder()
	handler.ServeHTTP(wNoRecipient, reqNoRecipient)
	if wNoRecipient.Code != http.StatusBadRequest {
		t.Errorf("expected 400 for missing recipient, got %d", wNoRecipient.Code)
	}

	// 4. Missing message and media path
	bodyNoContent, _ := json.Marshal(SendMessageRequest{Recipient: "12345"})
	reqNoContent := httptest.NewRequest(http.MethodPost, "/api/send", bytes.NewReader(bodyNoContent))
	wNoContent := httptest.NewRecorder()
	handler.ServeHTTP(wNoContent, reqNoContent)
	if wNoContent.Code != http.StatusBadRequest {
		t.Errorf("expected 400 for empty message/media, got %d", wNoContent.Code)
	}

	// 5. Valid request but client disconnected -> 500 error response
	bodyValid, _ := json.Marshal(SendMessageRequest{Recipient: "12345", Message: "Hello!"})
	reqValid := httptest.NewRequest(http.MethodPost, "/api/send", bytes.NewReader(bodyValid))
	wValid := httptest.NewRecorder()
	handler.ServeHTTP(wValid, reqValid)
	if wValid.Code != http.StatusInternalServerError {
		t.Errorf("expected 500 for disconnected client, got %d", wValid.Code)
	}

	var res SendMessageResponse
	_ = json.NewDecoder(wValid.Body).Decode(&res)
	if res.Success {
		t.Error("expected success=false for disconnected client send")
	}
}

func TestSendPollHandler(t *testing.T) {
	client, _, tmpDirClient := createTestClient(t)
	defer os.RemoveAll(tmpDirClient)

	handler := sendPollHandler(client)

	// 1. Method not allowed
	reqGET := httptest.NewRequest(http.MethodGet, "/api/send-poll", nil)
	wGET := httptest.NewRecorder()
	handler.ServeHTTP(wGET, reqGET)
	if wGET.Code != http.StatusMethodNotAllowed {
		t.Errorf("expected 405, got %d", wGET.Code)
	}

	// 2. Invalid JSON
	reqBadJSON := httptest.NewRequest(http.MethodPost, "/api/send-poll", strings.NewReader("bad"))
	wBadJSON := httptest.NewRecorder()
	handler.ServeHTTP(wBadJSON, reqBadJSON)
	if wBadJSON.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", wBadJSON.Code)
	}

	// 3. Valid poll request on disconnected client -> 500
	body, _ := json.Marshal(SendPollRequest{
		Recipient:       "12345",
		Question:        "Favorite Color?",
		Options:         []string{"Red", "Blue"},
		SelectableCount: 1,
	})
	req := httptest.NewRequest(http.MethodPost, "/api/send-poll", bytes.NewReader(body))
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, req)
	if w.Code != http.StatusInternalServerError {
		t.Errorf("expected 500, got %d", w.Code)
	}

	var res SendPollResponse
	_ = json.NewDecoder(w.Body).Decode(&res)
	if res.Success {
		t.Error("expected success=false")
	}
}

func TestDownloadHandler(t *testing.T) {
	client, _, tmpDirClient := createTestClient(t)
	defer os.RemoveAll(tmpDirClient)

	store, tmpDirStore := createTestMessageStore(t)
	defer os.RemoveAll(tmpDirStore)
	defer store.Close()

	handler := downloadHandler(client, store)

	// 1. Method not allowed
	reqGET := httptest.NewRequest(http.MethodGet, "/api/download", nil)
	wGET := httptest.NewRecorder()
	handler.ServeHTTP(wGET, reqGET)
	if wGET.Code != http.StatusMethodNotAllowed {
		t.Errorf("expected 405, got %d", wGET.Code)
	}

	// 2. Invalid JSON
	reqBad := httptest.NewRequest(http.MethodPost, "/api/download", strings.NewReader("invalid"))
	wBad := httptest.NewRecorder()
	handler.ServeHTTP(wBad, reqBad)
	if wBad.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", wBad.Code)
	}

	// 3. Missing MessageID or ChatJID
	bodyMissing, _ := json.Marshal(DownloadMediaRequest{MessageID: "msg1"})
	reqMissing := httptest.NewRequest(http.MethodPost, "/api/download", bytes.NewReader(bodyMissing))
	wMissing := httptest.NewRecorder()
	handler.ServeHTTP(wMissing, reqMissing)
	if wMissing.Code != http.StatusBadRequest {
		t.Errorf("expected 400 for missing fields, got %d", wMissing.Code)
	}

	// 4. Download failure (message not in database)
	bodyFail, _ := json.Marshal(DownloadMediaRequest{MessageID: "msg1", ChatJID: "chat1@s.whatsapp.net"})
	reqFail := httptest.NewRequest(http.MethodPost, "/api/download", bytes.NewReader(bodyFail))
	wFail := httptest.NewRecorder()
	handler.ServeHTTP(wFail, reqFail)
	if wFail.Code != http.StatusInternalServerError {
		t.Errorf("expected 500 for failed download, got %d", wFail.Code)
	}

	var resFail DownloadMediaResponse
	_ = json.NewDecoder(wFail.Body).Decode(&resFail)
	if resFail.Success {
		t.Error("expected success=false")
	}

	// 5. Download success (file exists on disk)
	chatJID := "chat_success@s.whatsapp.net"
	chatDir := filepath.Join("store", strings.ReplaceAll(chatJID, ":", "_"))
	_ = os.MkdirAll(chatDir, 0755)
	defer os.RemoveAll("store")

	localFilePath := filepath.Join(chatDir, "photo.jpg")
	_ = os.WriteFile(localFilePath, []byte("fake picture"), 0644)
	_ = store.StoreChat(chatJID, "Success Chat", time.Now())
	_ = store.StoreMessage("img_success", chatJID, "user", "", "", time.Now(), false, "image", "photo.jpg", "https://example.com/photo.jpg", []byte("k"), []byte("s"), []byte("e"), 50, "remote")

	bodySuccess, _ := json.Marshal(DownloadMediaRequest{MessageID: "img_success", ChatJID: chatJID})
	reqSuccess := httptest.NewRequest(http.MethodPost, "/api/download", bytes.NewReader(bodySuccess))
	wSuccess := httptest.NewRecorder()
	handler.ServeHTTP(wSuccess, reqSuccess)
	if wSuccess.Code != http.StatusOK {
		t.Errorf("expected 200 for existing file download, got %d", wSuccess.Code)
	}

	var resSuccess DownloadMediaResponse
	_ = json.NewDecoder(wSuccess.Body).Decode(&resSuccess)
	if !resSuccess.Success || resSuccess.Filename != "photo.jpg" {
		t.Errorf("unexpected download response: %+v", resSuccess)
	}
}

func TestConnectionsHandler_AllRoutes(t *testing.T) {
	mgr := NewTenantManager(waLog.Noop)
	handler := connectionsHandler(mgr)

	// 1. Auth failure
	origToken := os.Getenv("BRIDGE_AUTH_TOKEN")
	os.Setenv("BRIDGE_AUTH_TOKEN", "bridge_secret_999")
	defer os.Setenv("BRIDGE_AUTH_TOKEN", origToken)

	reqUnauth := httptest.NewRequest(http.MethodGet, "/api/connections/hash1/status", nil)
	wUnauth := httptest.NewRecorder()
	handler.ServeHTTP(wUnauth, reqUnauth)
	if wUnauth.Code != http.StatusUnauthorized {
		t.Errorf("expected 401 Unauthorized, got %d", wUnauth.Code)
	}

	// Helper function for authenticated requests
	authReq := func(method, path string, body []byte) *http.Request {
		req := httptest.NewRequest(method, path, bytes.NewReader(body))
		req.Header.Set("Authorization", "Bearer bridge_secret_999")
		req.Header.Set("Content-Type", "application/json")
		return req
	}

	// 2. Missing hash
	reqNoHash := authReq(http.MethodPost, "/api/connections/", nil)
	wNoHash := httptest.NewRecorder()
	handler.ServeHTTP(wNoHash, reqNoHash)
	if wNoHash.Code != http.StatusBadRequest {
		t.Errorf("expected 400 for empty hash, got %d", wNoHash.Code)
	}

	// 3. POST /api/connections/<hash> with AllowedRecipients as []interface{}
	body1, _ := json.Marshal(map[string]interface{}{
		"ownerPhone":        "+15551234567",
		"allowedRecipients": []interface{}{"+15559876543", "Test Group"},
		"aiApiKey":          "sk-test",
		"aiModel":           "gpt-4o",
	})
	reqPost1 := authReq(http.MethodPost, "/api/connections/tenant_one", body1)
	wPost1 := httptest.NewRecorder()
	handler.ServeHTTP(wPost1, reqPost1)
	if wPost1.Code != http.StatusOK {
		t.Errorf("expected 200 for tenant creation, got %d (body: %s)", wPost1.Code, wPost1.Body.String())
	}
	defer os.RemoveAll(filepath.Join("store", "tenants", "tenant_one"))

	// 4. POST /api/connections/<hash> updating existing tenant with AllowedRecipients as comma-separated string
	body2, _ := json.Marshal(map[string]interface{}{
		"ownerPhone":        "+15551234567",
		"allowedRecipients": "+15559876543, Updated Group",
		"aiApiKey":          "sk-test-updated",
		"aiModel":           "claude-3-5-sonnet",
	})
	reqPost2 := authReq(http.MethodPost, "/api/connections/tenant_one", body2)
	wPost2 := httptest.NewRecorder()
	handler.ServeHTTP(wPost2, reqPost2)
	if wPost2.Code != http.StatusOK {
		t.Errorf("expected 200 for tenant update, got %d", wPost2.Code)
	}

	// 5. POST /api/connections/<hash> with AllowedRecipients as []string
	body3, _ := json.Marshal(map[string]interface{}{
		"ownerPhone":        "+15551234567",
		"allowedRecipients": []string{"+15559876543"},
	})
	reqPost3 := authReq(http.MethodPost, "/api/connections/tenant_two", body3)
	wPost3 := httptest.NewRecorder()
	handler.ServeHTTP(wPost3, reqPost3)
	if wPost3.Code != http.StatusOK {
		t.Errorf("expected 200 for tenant creation, got %d", wPost3.Code)
	}
	defer os.RemoveAll(filepath.Join("store", "tenants", "tenant_two"))

	// 6. GET /api/connections/<hash>/status (found vs not found)
	reqStatus404 := authReq(http.MethodGet, "/api/connections/unknown_hash/status", nil)
	wStatus404 := httptest.NewRecorder()
	handler.ServeHTTP(wStatus404, reqStatus404)
	if wStatus404.Code != http.StatusNotFound {
		t.Errorf("expected 404 for unknown tenant status, got %d", wStatus404.Code)
	}

	reqStatus200 := authReq(http.MethodGet, "/api/connections/tenant_one/status", nil)
	wStatus200 := httptest.NewRecorder()
	handler.ServeHTTP(wStatus200, reqStatus200)
	if wStatus200.Code != http.StatusOK {
		t.Errorf("expected 200 for tenant status, got %d", wStatus200.Code)
	}

	// 7. GET /api/connections/<hash>/qr (found vs not found)
	reqQR404 := authReq(http.MethodGet, "/api/connections/unknown_hash/qr", nil)
	wQR404 := httptest.NewRecorder()
	handler.ServeHTTP(wQR404, reqQR404)
	if wQR404.Code != http.StatusNotFound {
		t.Errorf("expected 404 for unknown tenant QR, got %d", wQR404.Code)
	}

	reqQR200 := authReq(http.MethodGet, "/api/connections/tenant_one/qr", nil)
	wQR200 := httptest.NewRecorder()
	handler.ServeHTTP(wQR200, reqQR200)
	if wQR200.Code != http.StatusOK {
		t.Errorf("expected 200 for tenant QR, got %d", wQR200.Code)
	}

	// 8. GET /api/connections/<hash>/messages (found vs not found)
	reqMsgs404 := authReq(http.MethodGet, "/api/connections/unknown_hash/messages", nil)
	wMsgs404 := httptest.NewRecorder()
	handler.ServeHTTP(wMsgs404, reqMsgs404)
	if wMsgs404.Code != http.StatusNotFound {
		t.Errorf("expected 404 for unknown tenant messages, got %d", wMsgs404.Code)
	}

	reqMsgs200 := authReq(http.MethodGet, "/api/connections/tenant_one/messages?limit=10", nil)
	wMsgs200 := httptest.NewRecorder()
	handler.ServeHTTP(wMsgs200, reqMsgs200)
	if wMsgs200.Code != http.StatusOK {
		t.Errorf("expected 200 for tenant messages, got %d", wMsgs200.Code)
	}

	// 9. POST /api/connections/<hash>/grant (found, not found, bad JSON)
	reqGrant404 := authReq(http.MethodPost, "/api/connections/unknown_hash/grant", []byte(`{"option":"1 text"}`))
	wGrant404 := httptest.NewRecorder()
	handler.ServeHTTP(wGrant404, reqGrant404)
	if wGrant404.Code != http.StatusNotFound {
		t.Errorf("expected 404 for unknown tenant grant, got %d", wGrant404.Code)
	}

	reqGrantBad := authReq(http.MethodPost, "/api/connections/tenant_one/grant", []byte(`invalid json`))
	wGrantBad := httptest.NewRecorder()
	handler.ServeHTTP(wGrantBad, reqGrantBad)
	if wGrantBad.Code != http.StatusBadRequest {
		t.Errorf("expected 400 for bad grant JSON, got %d", wGrantBad.Code)
	}

	reqGrant200 := authReq(http.MethodPost, "/api/connections/tenant_one/grant", []byte(`{"option":"5 min","contact":"15551234567"}`))
	wGrant200 := httptest.NewRecorder()
	handler.ServeHTTP(wGrant200, reqGrant200)
	if wGrant200.Code != http.StatusOK {
		t.Errorf("expected 200 for grant, got %d", wGrant200.Code)
	}

	// 10. POST /api/connections/<hash>/send (found, not found, bad JSON, missing fields, send fail)
	reqSend404 := authReq(http.MethodPost, "/api/connections/unknown_hash/send", []byte(`{"recipient":"123","message":"hi"}`))
	wSend404 := httptest.NewRecorder()
	handler.ServeHTTP(wSend404, reqSend404)
	if wSend404.Code != http.StatusNotFound {
		t.Errorf("expected 404 for unknown tenant send, got %d", wSend404.Code)
	}

	reqSendBad := authReq(http.MethodPost, "/api/connections/tenant_one/send", []byte(`invalid`))
	wSendBad := httptest.NewRecorder()
	handler.ServeHTTP(wSendBad, reqSendBad)
	if wSendBad.Code != http.StatusBadRequest {
		t.Errorf("expected 400 for bad send JSON, got %d", wSendBad.Code)
	}

	reqSendMissing := authReq(http.MethodPost, "/api/connections/tenant_one/send", []byte(`{"recipient":""}`))
	wSendMissing := httptest.NewRecorder()
	handler.ServeHTTP(wSendMissing, reqSendMissing)
	if wSendMissing.Code != http.StatusBadRequest {
		t.Errorf("expected 400 for missing fields in send, got %d", wSendMissing.Code)
	}

	reqSendFail := authReq(http.MethodPost, "/api/connections/tenant_one/send", []byte(`{"recipient":"12345","message":"Hello"}`))
	wSendFail := httptest.NewRecorder()
	handler.ServeHTTP(wSendFail, reqSendFail)
	if wSendFail.Code != http.StatusInternalServerError {
		t.Errorf("expected 500 for disconnected send, got %d", wSendFail.Code)
	}

	// 11. Unknown subpath (404)
	reqUnknown := authReq(http.MethodGet, "/api/connections/tenant_one/unknown-subroute", nil)
	wUnknown := httptest.NewRecorder()
	handler.ServeHTTP(wUnknown, reqUnknown)
	if wUnknown.Code != http.StatusNotFound {
		t.Errorf("expected 404 for unknown subroute, got %d", wUnknown.Code)
	}
}
