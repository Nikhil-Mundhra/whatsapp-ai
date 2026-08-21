"use client";

import React from "react";
import { CloseIcon } from "../../components/Icons/WhatsAppIcons";

export default function TenantDrawer({
  selectedUser,
  setSelectedUser,
  handleUserAction,
  handleDeleteUser,
  actionLoading,
}) {
  if (!selectedUser) return null;

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(0, 0, 0, 0.6)",
        backdropFilter: "blur(3px)",
        zIndex: 100,
        display: "flex",
        justifyContent: "flex-end",
      }}
      onClick={() => setSelectedUser(null)}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 480,
          height: "100%",
          backgroundColor: "var(--wa-panel-bg)",
          borderLeft: "1px solid var(--wa-border)",
          display: "flex",
          flexDirection: "column",
          boxShadow: "-6px 0 24px rgba(0,0,0,0.2)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drawer Header */}
        <div
          style={{
            padding: "16px 20px",
            backgroundColor: "var(--wa-header-bg)",
            borderBottom: "1px solid var(--wa-border)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div
              style={{
                width: 38,
                height: 38,
                borderRadius: "50%",
                backgroundColor: "var(--wa-teal)",
                color: "#ffffff",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontWeight: "700",
                fontSize: "14px",
              }}
            >
              {selectedUser.hash.slice(0, 2)}
            </div>
            <div>
              <h2 style={{ fontSize: "16px", fontWeight: "700", margin: 0 }}>
                Tenant #{selectedUser.hash}
              </h2>
              <p style={{ fontSize: "12px", color: "var(--wa-text-secondary)", margin: 0 }}>
                Detailed Metrics &amp; Health State
              </p>
            </div>
          </div>

          <button
            onClick={() => setSelectedUser(null)}
            style={{
              background: "none",
              border: "none",
              color: "var(--wa-text-muted)",
              cursor: "pointer",
              padding: 4,
            }}
          >
            <CloseIcon size={18} color="var(--wa-icon-color)" />
          </button>
        </div>

        {/* Drawer Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "20px" }}>
          {/* Telemetry Overview Section */}
          <div style={{ marginBottom: 24 }}>
            <h3 style={{ fontSize: "12px", fontWeight: "700", textTransform: "uppercase", color: "var(--wa-text-muted)", marginBottom: 12 }}>
              Storage &amp; Activity
            </h3>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div style={{ padding: "12px", borderRadius: 8, backgroundColor: "var(--wa-card-bg)", border: "1px solid var(--wa-border)" }}>
                <div style={{ fontSize: "11px", color: "var(--wa-text-muted)" }}>Storage Used</div>
                <div style={{ fontSize: "18px", fontWeight: "700", color: "var(--wa-text-primary)", marginTop: 2 }}>
                  {selectedUser.storageUsedFormatted}
                </div>
              </div>
              <div style={{ padding: "12px", borderRadius: 8, backgroundColor: "var(--wa-card-bg)", border: "1px solid var(--wa-border)" }}>
                <div style={{ fontSize: "11px", color: "var(--wa-text-muted)" }}>Total Messages</div>
                <div style={{ fontSize: "18px", fontWeight: "700", color: "var(--wa-text-primary)", marginTop: 2 }}>
                  {selectedUser.totalMessages}
                </div>
              </div>
              <div style={{ padding: "12px", borderRadius: 8, backgroundColor: "var(--wa-card-bg)", border: "1px solid var(--wa-border)" }}>
                <div style={{ fontSize: "11px", color: "var(--wa-text-muted)" }}>AI Takeover Replies</div>
                <div style={{ fontSize: "18px", fontWeight: "700", color: "var(--wa-teal)", marginTop: 2 }}>
                  {selectedUser.aiMessagesSent}
                </div>
              </div>
              <div style={{ padding: "12px", borderRadius: 8, backgroundColor: "var(--wa-card-bg)", border: "1px solid var(--wa-border)" }}>
                <div style={{ fontSize: "11px", color: "var(--wa-text-muted)" }}>Automated Contacts</div>
                <div style={{ fontSize: "18px", fontWeight: "700", color: "var(--wa-teal)", marginTop: 2 }}>
                  {selectedUser.chatsAutomated}
                </div>
              </div>
            </div>
          </div>

          {/* Configuration Section */}
          <div style={{ marginBottom: 24 }}>
            <h3 style={{ fontSize: "12px", fontWeight: "700", textTransform: "uppercase", color: "var(--wa-text-muted)", marginBottom: 12 }}>
              Configuration &amp; Credentials
            </h3>
            <div style={{ backgroundColor: "var(--wa-card-bg)", border: "1px solid var(--wa-border)", borderRadius: 8, padding: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", paddingBottom: 8, borderBottom: "1px solid var(--wa-border)" }}>
                <span style={{ fontSize: "12px", color: "var(--wa-text-secondary)" }}>Owner Phone:</span>
                <span style={{ fontSize: "12px", fontWeight: "600" }}>{selectedUser.ownerPhone || "Unassigned"}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid var(--wa-border)" }}>
                <span style={{ fontSize: "12px", color: "var(--wa-text-secondary)" }}>AI Model:</span>
                <span style={{ fontSize: "12px", fontWeight: "600", fontFamily: "monospace" }}>{selectedUser.aiModel}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid var(--wa-border)" }}>
                <span style={{ fontSize: "12px", color: "var(--wa-text-secondary)" }}>AI API Key:</span>
                <span style={{ fontSize: "12px", fontWeight: "600", color: selectedUser.aiApiKeySet ? "#10b981" : "#ef4444" }}>
                  {selectedUser.aiApiKeySet ? "Configured" : "Missing"}
                </span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", paddingTop: 8 }}>
                <span style={{ fontSize: "12px", color: "var(--wa-text-secondary)" }}>Created At:</span>
                <span style={{ fontSize: "12px" }}>{new Date(selectedUser.createdAt).toLocaleDateString()}</span>
              </div>
            </div>
          </div>

          {/* Whitelisted Contacts */}
          <div style={{ marginBottom: 24 }}>
            <h3 style={{ fontSize: "12px", fontWeight: "700", textTransform: "uppercase", color: "var(--wa-text-muted)", marginBottom: 12 }}>
              Whitelisted Recipients ({selectedUser.allowedRecipients?.length || 0})
            </h3>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {selectedUser.allowedRecipients && selectedUser.allowedRecipients.length > 0 ? (
                selectedUser.allowedRecipients.map((r, i) => {
                  const clean = String(r).replace(/\D/g, "");
                  const isNumber = clean.length >= 7;
                  return (
                    <span
                      key={i}
                      style={{
                        padding: "4px 8px",
                        borderRadius: 6,
                        backgroundColor: isNumber ? "var(--wa-search-input)" : "rgba(0, 168, 132, 0.12)",
                        border: isNumber ? "1px solid var(--wa-border)" : "1px solid rgba(0, 168, 132, 0.3)",
                        fontSize: "12px",
                        fontFamily: isNumber ? "monospace" : "inherit",
                        color: isNumber ? "var(--wa-text-primary)" : "var(--wa-teal)",
                        fontWeight: isNumber ? 500 : 600,
                      }}
                    >
                      {isNumber ? `+${clean}` : String(r)}
                    </span>
                  );
                })
              ) : (
                <span style={{ fontSize: "12px", color: "var(--wa-text-muted)" }}>No contacts whitelisted yet.</span>
              )}
            </div>
          </div>

          {/* Health & Reconnect State */}
          {selectedUser.lastError && (
            <div style={{ marginBottom: 24, padding: 12, borderRadius: 8, backgroundColor: "rgba(239, 68, 68, 0.1)", border: "1px solid rgba(239, 68, 68, 0.2)" }}>
              <div style={{ fontSize: "11px", fontWeight: "700", color: "#ef4444", textTransform: "uppercase", marginBottom: 4 }}>
                Last Connection Error
              </div>
              <div style={{ fontSize: "12px", color: "#ef4444", fontFamily: "monospace" }}>
                {selectedUser.lastError}
              </div>
            </div>
          )}
        </div>

        {/* Drawer Footer Actions */}
        <div
          style={{
            padding: "16px 20px",
            backgroundColor: "var(--wa-header-bg)",
            borderTop: "1px solid var(--wa-border)",
            display: "flex",
            gap: 10,
          }}
        >
          {selectedUser.isConnected ? (
            <button
              onClick={() => handleUserAction(selectedUser.hash, "disconnect")}
              disabled={actionLoading[`${selectedUser.hash}_disconnect`]}
              style={{
                flex: 1,
                padding: "10px",
                backgroundColor: "rgba(234, 179, 8, 0.15)",
                border: "1px solid rgba(234, 179, 8, 0.3)",
                borderRadius: 6,
                color: "#eab308",
                fontSize: "13px",
                fontWeight: "600",
                cursor: "pointer",
              }}
            >
              Disconnect Session
            </button>
          ) : (
            <button
              onClick={() => handleUserAction(selectedUser.hash, "reconnect")}
              disabled={actionLoading[`${selectedUser.hash}_reconnect`]}
              style={{
                flex: 1,
                padding: "10px",
                backgroundColor: "var(--wa-teal)",
                border: "none",
                borderRadius: 6,
                color: "#ffffff",
                fontSize: "13px",
                fontWeight: "600",
                cursor: "pointer",
              }}
            >
              Auto-Reconnect
            </button>
          )}

          <button
            onClick={() => handleDeleteUser(selectedUser.hash)}
            disabled={actionLoading[`${selectedUser.hash}_delete`]}
            style={{
              padding: "10px 14px",
              backgroundColor: "rgba(239, 68, 68, 0.15)",
              border: "1px solid rgba(239, 68, 68, 0.3)",
              borderRadius: 6,
              color: "#ef4444",
              fontSize: "13px",
              fontWeight: "600",
              cursor: "pointer",
            }}
          >
            Delete Tenant
          </button>
        </div>
      </div>
    </div>
  );
}
