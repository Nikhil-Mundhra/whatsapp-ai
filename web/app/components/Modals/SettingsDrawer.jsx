"use client";

import { CloseIcon, RobotIcon, SunIcon, MoonIcon, CheckIcon } from "../Icons/WhatsAppIcons";
import { ContactPicker } from "../UI/ContactPicker";

export function SettingsDrawer({
  isOpen,
  onClose,
  configForm,
  setConfigForm,
  onSave,
  onLogout,
  saving = false,
  error = "",
  success = "",
  keyStatus,
  onApiKeyChange,
  theme = "light",
  onThemeChange,
  chats = [],
  contacts = [],
  hash = "",
}) {
  if (!isOpen) return null;

  return (
    <div className="wa-drawer-backdrop" onClick={onClose}>
      <div className="wa-drawer" onClick={(e) => e.stopPropagation()}>
        {/* Drawer Header */}
        <div className="wa-drawer-header">
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
            }}
          >
            <CloseIcon size={22} color="#ffffff" />
          </button>
          <h3>Take-Over Settings</h3>
        </div>

        {/* Drawer Body Form */}
        <form className="wa-drawer-body" onSubmit={onSave}>
          {success && (
            <div
              style={{
                background: "rgba(16, 185, 129, 0.15)",
                color: "#10b981",
                border: "1px solid rgba(16, 185, 129, 0.3)",
                padding: "10px 14px",
                borderRadius: 8,
                fontSize: 13,
                fontWeight: 600,
              }}
            >
              {success}
            </div>
          )}

          {error && (
            <div
              style={{
                background: "rgba(239, 68, 68, 0.15)",
                color: "#ef4444",
                border: "1px solid rgba(239, 68, 68, 0.3)",
                padding: "10px 14px",
                borderRadius: 8,
                fontSize: 13,
              }}
            >
              {error}
            </div>
          )}

          {/* Theme Selector Card */}
          <div className="wa-card">
            <div style={{ display: "grid", gap: 10 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontWeight: 600, fontSize: 13, color: "var(--wa-text-primary)" }}>
                  Theme Mode
                </span>
                <span style={{ fontSize: 11, color: "var(--wa-text-secondary)" }}>
                  {theme === "dark" ? "Dark Theme" : "Light Theme"}
                </span>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                {/* Light Option */}
                <button
                  type="button"
                  onClick={() => onThemeChange?.("light")}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 8,
                    padding: "10px 12px",
                    borderRadius: 8,
                    border: theme === "light" ? "2px solid #00a884" : "1px solid var(--wa-border-strong)",
                    background: theme === "light" ? "var(--wa-selected-bg)" : "var(--wa-card-bg)",
                    color: "var(--wa-text-primary)",
                    fontWeight: theme === "light" ? 700 : 500,
                    fontSize: 13,
                    cursor: "pointer",
                    transition: "all 0.15s ease",
                  }}
                >
                  <SunIcon size={14} color="currentColor" />
                  <span>Light</span>
                </button>

                {/* Dark Option */}
                <button
                  type="button"
                  onClick={() => onThemeChange?.("dark")}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 8,
                    padding: "10px 12px",
                    borderRadius: 8,
                    border: theme === "dark" ? "2px solid #00a884" : "1px solid var(--wa-border-strong)",
                    background: theme === "dark" ? "var(--wa-selected-bg)" : "var(--wa-card-bg)",
                    color: "var(--wa-text-primary)",
                    fontWeight: theme === "dark" ? 700 : 500,
                    fontSize: 13,
                    cursor: "pointer",
                    transition: "all 0.15s ease",
                  }}
                >
                  <MoonIcon size={14} color="currentColor" />
                  <span>Dark</span>
                </button>
              </div>
            </div>
          </div>

          {/* Owner Phone Card */}
          <div className="wa-card">
            <label style={{ display: "grid", gap: 6 }}>
              <span style={{ fontWeight: 600, fontSize: 13, color: "var(--wa-text-primary)" }}>
                OWNER_PHONE
              </span>
              <input
                type="text"
                value={configForm.ownerPhone}
                onChange={(e) =>
                  setConfigForm({ ...configForm, ownerPhone: e.target.value })
                }
                placeholder="e.g. 14155550100"
                style={{
                  padding: "8px 12px",
                  borderRadius: 6,
                  border: "1px solid var(--wa-border-strong)",
                  fontSize: 14,
                  outline: "none",
                  backgroundColor: "var(--wa-input-bg)",
                  color: "var(--wa-text-primary)",
                }}
              />
              <span style={{ fontSize: 11, color: "var(--wa-text-secondary)" }}>
                The WhatsApp phone number that receives native Take-Over approval polls.
              </span>
            </label>
          </div>

          {/* Allowed Recipients Card */}
          <div className="wa-card">
            <ContactPicker
              value={configForm.allowedRecipients}
              onChange={(newRecipients) =>
                setConfigForm((prev) => ({
                  ...prev,
                  allowedRecipients: newRecipients,
                }))
              }
              chats={chats}
              contacts={contacts}
              hash={hash}
              label="ALLOWED RECIPIENTS (WHITELIST)"
              description="Only these mobile numbers & groups are authorized for AI autonomous take-over reply."
            />
          </div>

          {/* AI Provider & API Key Card */}
          <div className="wa-card">
            <div style={{ display: "grid", gap: 12 }}>
              <span style={{ fontWeight: 600, fontSize: 13, color: "var(--wa-text-primary)" }}>
                AI Persona Provider & Model
              </span>

              {/* API Key */}
              <div>
                <label style={{ fontSize: 12, color: "var(--wa-text-secondary)", display: "block", marginBottom: 4 }}>
                  API Key (OpenRouter, OpenAI, Claude, or Gemini)
                </label>
                <input
                  type="password"
                  value={configForm.aiApiKey}
                  onChange={(e) => {
                    const key = e.target.value;
                    setConfigForm({ ...configForm, aiApiKey: key });
                    onApiKeyChange?.(key);
                  }}
                  placeholder="Enter API Key"
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    borderRadius: 6,
                    border: `1px solid ${
                      keyStatus?.valid
                        ? "#10b981"
                        : keyStatus?.error
                        ? "#ef4444"
                        : "var(--wa-border-strong)"
                    }`,
                    fontSize: 13,
                    outline: "none",
                    backgroundColor: "var(--wa-input-bg)",
                    color: "var(--wa-text-primary)",
                  }}
                />
                {keyStatus?.validating && (
                  <span style={{ fontSize: 11, color: "var(--wa-text-secondary)", marginTop: 3, display: "block" }}>
                    Validating key...
                  </span>
                )}
                {keyStatus?.valid && (
                  <span style={{ fontSize: 11, color: "#10b981", marginTop: 3, display: "flex", alignItems: "center", gap: 4, fontWeight: 600 }}>
                    <CheckIcon size={12} color="#10b981" />
                    <span>Valid {keyStatus.provider} Key</span>
                  </span>
                )}
                {keyStatus?.error && (
                  <span style={{ fontSize: 11, color: "#ef4444", marginTop: 3, display: "block" }}>
                    {keyStatus.error}
                  </span>
                )}
              </div>

              {/* AI Model */}
              <div>
                <label style={{ fontSize: 12, color: "var(--wa-text-secondary)", display: "block", marginBottom: 4 }}>
                  AI Model
                </label>
                {keyStatus?.models && keyStatus.models.length > 0 ? (
                  <select
                    value={configForm.aiModel}
                    onChange={(e) =>
                      setConfigForm({ ...configForm, aiModel: e.target.value })
                    }
                    style={{
                      width: "100%",
                      padding: "8px 12px",
                      borderRadius: 6,
                      border: "1px solid var(--wa-border-strong)",
                      fontSize: 13,
                      backgroundColor: "var(--wa-input-bg)",
                      color: "var(--wa-text-primary)",
                    }}
                  >
                    {keyStatus.models.map((m) => (
                      <option key={m.id || m} value={m.id || m}>
                        {m.name || m.id || m}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    value={configForm.aiModel}
                    onChange={(e) =>
                      setConfigForm({ ...configForm, aiModel: e.target.value })
                    }
                    placeholder="e.g. qwen3.5-32k or gpt-4o-mini"
                    style={{
                      width: "100%",
                      padding: "8px 12px",
                      borderRadius: 6,
                      border: "1px solid var(--wa-border-strong)",
                      fontSize: 13,
                      backgroundColor: "var(--wa-input-bg)",
                      color: "var(--wa-text-primary)",
                    }}
                  />
                )}
              </div>
            </div>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={saving}
            style={{
              background: "#008069",
              color: "#ffffff",
              border: "none",
              borderRadius: 8,
              padding: "12px 18px",
              fontSize: 14,
              fontWeight: 600,
              cursor: "pointer",
              boxShadow: "0 2px 4px rgba(0, 128, 105, 0.3)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
            }}
          >
            <RobotIcon size={16} color="#ffffff" />
            <span>{saving ? "Saving Configuration..." : "Save & Sync with Bridge"}</span>
          </button>

          {/* Large Log Out Button */}
          <button
            type="button"
            onClick={() => {
              if (window.confirm("Are you sure you want to log out and disconnect this session?")) {
                onLogout?.();
              }
            }}
            title="Log out and disconnect this session"
            aria-label="Log out and disconnect this session"
            style={{
              width: "100%",
              marginTop: 6,
              padding: "12px 18px",
              background: "rgba(239, 68, 68, 0.12)",
              border: "1px solid rgba(239, 68, 68, 0.3)",
              color: "#ef4444",
              borderRadius: 8,
              fontSize: 14,
              fontWeight: 600,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              transition: "all 0.15s ease",
            }}
          >
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
              <polyline points="16 17 21 12 16 7"></polyline>
              <line x1="21" y1="12" x2="9" y2="12"></line>
            </svg>
            <span>Log Out</span>
          </button>
        </form>
      </div>
    </div>
  );
}
