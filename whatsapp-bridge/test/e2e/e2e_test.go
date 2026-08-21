package e2e_test

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"

	"whatsapp-client/internal/bridge"
	waLog "go.mau.fi/whatsmeow/util/log"
)

func TestE2E_HealthEndpoint(t *testing.T) {
	mgr := bridge.NewTenantManager(waLog.Noop)

	handler := bridge.HealthHandler(mgr)
	req := httptest.NewRequest(http.MethodGet, "/api/health", nil)
	rr := httptest.NewRecorder()

	handler.ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("expected 200 OK from health endpoint, got %d", rr.Code)
	}

	var resp map[string]interface{}
	if err := json.NewDecoder(rr.Body).Decode(&resp); err != nil {
		t.Fatalf("failed to decode health response: %v", err)
	}

	if resp["status"] != "healthy" {
		t.Errorf("expected status 'healthy', got %v", resp["status"])
	}
}

func TestE2E_ConnectionsEndpoint_Auth(t *testing.T) {
	mgr := bridge.NewTenantManager(waLog.Noop)
	handler := bridge.ConnectionsHandler(mgr)

	// Set auth token
	os.Setenv("BRIDGE_AUTH_TOKEN", "e2e_secret_token")
	defer os.Unsetenv("BRIDGE_AUTH_TOKEN")

	// 1. Unauthorized request
	reqUnauth := httptest.NewRequest(http.MethodGet, "/api/connections", nil)
	rrUnauth := httptest.NewRecorder()
	handler.ServeHTTP(rrUnauth, reqUnauth)

	if rrUnauth.Code != http.StatusUnauthorized {
		t.Errorf("expected 401 Unauthorized, got %d", rrUnauth.Code)
	}

	// 2. Authorized request with Bearer token
	reqAuth := httptest.NewRequest(http.MethodGet, "/api/connections", nil)
	reqAuth.Header.Set("Authorization", "Bearer e2e_secret_token")
	rrAuth := httptest.NewRecorder()
	handler.ServeHTTP(rrAuth, reqAuth)

	if rrAuth.Code != http.StatusOK {
		t.Errorf("expected 200 OK with valid bearer token, got %d", rrAuth.Code)
	}
}

func TestE2E_MultiTenantManagerOperations(t *testing.T) {
	mgr := bridge.NewTenantManager(waLog.Noop)

	// Verify manager operations
	if mgr.Get("non_existent") != nil {
		t.Errorf("expected nil for non-existent tenant")
	}

	list := mgr.List()
	if list == nil {
		t.Errorf("expected non-nil tenant list")
	}
}
