"use client";

import { CloseIcon, RobotIcon } from "../Icons/WhatsAppIcons";

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
                background: "#ecfdf5",
                color: "#065f46",
                border: "1px solid #a7f3d0",
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
                background: "#fef2f2",
                color: "#b91c1c",
                border: "1px solid #fecaca",
                padding: "10px 14px",
                borderRadius: 8,
                fontSize: 13,
              }}
            >
              {error}
            </div>
          )}

          {/* Owner Phone Card */}
          <div className="wa-card">
            <label style={{ display: "grid", gap: 6 }}>
              <span style={{ fontWeight: 600, fontSize: 13, color: "#0f172a" }}>
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
                  border: "1px solid #cbd5e1",
                  fontSize: 14,
                  outline: "none",
                }}
              />
              <span style={{ fontSize: 11, color: "#64748b" }}>
                The WhatsApp phone number that receives native Take-Over approval polls.
              </span>
            </label>
          </div>

          {/* Allowed Recipients Card */}
          <div className="wa-card">
            <label style={{ display: "grid", gap: 6 }}>
              <span style={{ fontWeight: 600, fontSize: 13, color: "#0f172a" }}>
                ALLOWED_RECIPIENTS
              </span>
              <input
                type="text"
                value={configForm.allowedRecipients}
                onChange={(e) =>
                  setConfigForm({ ...configForm, allowedRecipients: e.target.value })
                }
                placeholder="e.g. 14155550199, 447123456789"
                style={{
                  padding: "8px 12px",
                  borderRadius: 6,
                  border: "1px solid #cbd5e1",
                  fontSize: 14,
                  outline: "none",
                }}
              />
              <span style={{ fontSize: 11, color: "#64748b" }}>
                Comma-separated contacts permitted for AI take-over.
              </span>
            </label>
          </div>

          {/* AI Key & Model Card */}
          <div className="wa-card">
            <div style={{ display: "grid", gap: 12 }}>
              <div style={{ display: "grid", gap: 6 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontWeight: 600, fontSize: 13, color: "#0f172a" }}>
                    AI API KEY
                  </span>
                  {keyStatus?.state === "checking" && (
                    <span style={{ fontSize: 11, color: "#64748b" }}>⏳ Checking key...</span>
                  )}
                  {keyStatus?.state === "valid" && (
                    <span style={{ fontSize: 11, color: "#16a34a", fontWeight: 600 }}>
                      ✓ {keyStatus.message}
                    </span>
                  )}
                  {keyStatus?.state === "invalid" && (
                    <span style={{ fontSize: 11, color: "#dc2626", fontWeight: 600 }}>
                      ✗ {keyStatus.message}
                    </span>
                  )}
                </div>

                <input
                  type="password"
                  value={configForm.aiApiKey}
                  onChange={onApiKeyChange}
                  placeholder="Gemini, OpenAI, Claude, or OpenRouter Key"
                  style={{
                    padding: "8px 12px",
                    borderRadius: 6,
                    border: `1px solid ${
                      keyStatus?.state === "valid"
                        ? "#22c55e"
                        : keyStatus?.state === "invalid"
                        ? "#ef4444"
                        : "#cbd5e1"
                    }`,
                    fontSize: 14,
                    outline: "none",
                  }}
                />
              </div>

              {/* AI Model Selector */}
              <div style={{ display: "grid", gap: 6 }}>
                <span style={{ fontWeight: 600, fontSize: 13, color: "#0f172a" }}>
                  AI INFERENCE MODEL
                </span>
                {keyStatus?.models && keyStatus.models.length > 0 ? (
                  <select
                    value={configForm.aiModel}
                    onChange={(e) =>
                      setConfigForm({ ...configForm, aiModel: e.target.value })
                    }
                    style={{
                      padding: "8px 12px",
                      borderRadius: 6,
                      border: "1px solid #cbd5e1",
                      fontSize: 13,
                      background: "#ffffff",
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
                      padding: "8px 12px",
                      borderRadius: 6,
                      border: "1px solid #cbd5e1",
                      fontSize: 13,
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
              marginTop: 10,
              padding: "12px 18px",
              background: "#fff1f2",
              border: "1px solid #fecdd3",
              color: "#e11d48",
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
