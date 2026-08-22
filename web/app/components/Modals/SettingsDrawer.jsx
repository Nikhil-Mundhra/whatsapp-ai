"use client";

import { useState, useEffect } from "react";
import {
  ArrowLeftIcon,
  RobotIcon,
  SunIcon,
  MoonIcon,
  CheckIcon,
  WarningIcon,
  RefreshIcon,
  KeyIcon,
  EditIcon,
  MicIcon,
  ImageIcon,
  CalendarIcon,
  SearchIcon,
} from "../Icons/WhatsAppIcons";
import { ContactPicker } from "../UI/ContactPicker";

const POPULAR_VISION_MODELS = [
  { id: "gemini-2.0-flash", name: "Gemini 2.0 Flash (Recommended & Fast)" },
  { id: "gemini-1.5-flash", name: "Gemini 1.5 Flash (Low Cost)" },
  { id: "gemini-1.5-pro", name: "Gemini 1.5 Pro (Deep Reasoning)" },
  { id: "gpt-4o-mini", name: "GPT-4o Mini (Fast & Compact)" },
  { id: "gpt-4o", name: "GPT-4o (Frontier Vision)" },
  { id: "claude-3-5-sonnet-20241022", name: "Claude 3.5 Sonnet (High Accuracy)" },
  { id: "claude-3-5-haiku-20241022", name: "Claude 3.5 Haiku (Fast Vision)" },
  { id: "qwen/qwen-2.5-vl-72b-instruct", name: "Qwen 2.5 VL 72B (OpenRouter)" },
  { id: "meta-llama/llama-3.2-11b-vision-instruct", name: "Llama 3.2 11B Vision (OpenRouter)" },
];

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
  groqKeyStatus,
  onGroqKeyChange,
  visionKeyStatus,
  onVisionKeyChange,
  theme = "light",
  onThemeChange,
  chats = [],
  contacts = [],
  hash = "",
  aiApiKeySet = false,
  aiApiKeyMasked = "",
  groqApiKeySet = false,
  groqApiKeyMasked = "",
  hasSuperadminGroqFallback = false,
  visionApiKeySet = false,
  visionApiKeyMasked = "",
}) {
  const [isEditingKey, setIsEditingKey] = useState(!aiApiKeySet);
  const [isEditingGroqKey, setIsEditingGroqKey] = useState(false);
  const [isEditingVisionKey, setIsEditingVisionKey] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setIsEditingKey(!aiApiKeySet);
      setIsEditingGroqKey(false);
      setIsEditingVisionKey(false);
    }
  }, [isOpen, aiApiKeySet, groqApiKeySet, visionApiKeySet]);

  if (!isOpen) return null;

  const isVoiceTranscriptionActive = configForm.voiceNoteTranscriptionEnabled !== false;
  const isVisionActive = configForm.visionEnabled !== false;

  return (
    <div className="wa-settings-drawer-backdrop" onClick={onClose}>
      <div className="wa-settings-drawer" onClick={(e) => e.stopPropagation()}>
        {/* Drawer Header */}
        <div className="wa-drawer-header">
          <button
            type="button"
            onClick={onClose}
            title="Back / Close Settings"
            aria-label="Back / Close Settings"
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 4,
              borderRadius: "50%",
              color: "#ffffff",
            }}
          >
            <ArrowLeftIcon size={20} color="#ffffff" />
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

          {/* Primary AI Provider & API Key Card */}
          <div className="wa-card">
            <div style={{ display: "grid", gap: 12 }}>
              <span style={{ fontWeight: 600, fontSize: 13, color: "var(--wa-text-primary)" }}>
                AI Persona Provider & Model
              </span>

              {/* API Key */}
              <div>
                <label style={{ fontSize: 12, color: "var(--wa-text-secondary)", display: "block", marginBottom: 4 }}>
                  Primary API Key (OpenRouter, OpenAI, Claude, or Gemini)
                </label>

                {aiApiKeySet && !isEditingKey ? (
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "8px 12px",
                      borderRadius: 6,
                      border: "1px solid var(--wa-border-strong)",
                      backgroundColor: "var(--wa-input-bg)",
                      gap: 8,
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0, overflow: "hidden" }}>
                      <div
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          width: 26,
                          height: 26,
                          borderRadius: 6,
                          background: "rgba(16, 185, 129, 0.15)",
                          color: "#10b981",
                          flexShrink: 0,
                        }}
                      >
                        <KeyIcon size={14} color="#10b981" />
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
                        <span
                          style={{
                            fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
                            fontSize: 13,
                            fontWeight: 600,
                            color: "var(--wa-text-primary)",
                            letterSpacing: "0.5px",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {aiApiKeyMasked || "••••••••••••••••"}
                        </span>
                        <span style={{ fontSize: 10, color: "#10b981", display: "flex", alignItems: "center", gap: 3, fontWeight: 600 }}>
                          <CheckIcon size={10} color="#10b981" strokeWidth={3} />
                          <span>Active Primary Key</span>
                        </span>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        setIsEditingKey(true);
                      }}
                      style={{
                        padding: "6px 12px",
                        fontSize: 12,
                        fontWeight: 600,
                        color: "var(--wa-text-primary)",
                        background: "var(--wa-card-bg)",
                        border: "1px solid var(--wa-border-strong)",
                        borderRadius: 6,
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        gap: 5,
                        whiteSpace: "nowrap",
                        flexShrink: 0,
                        transition: "all 0.15s ease",
                      }}
                      onMouseOver={(e) => {
                        e.currentTarget.style.borderColor = "#00a884";
                        e.currentTarget.style.color = "#00a884";
                      }}
                      onMouseOut={(e) => {
                        e.currentTarget.style.borderColor = "var(--wa-border-strong)";
                        e.currentTarget.style.color = "var(--wa-text-primary)";
                      }}
                    >
                      <EditIcon size={12} color="currentColor" />
                      <span>Change</span>
                    </button>
                  </div>
                ) : (
                  <div>
                    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                      <input
                        type="password"
                        value={configForm.aiApiKey || ""}
                        onChange={(e) => {
                          const key = e.target.value;
                          setConfigForm({ ...configForm, aiApiKey: key });
                          onApiKeyChange?.(key);
                        }}
                        placeholder={aiApiKeySet ? "Enter new API Key" : "Enter API Key"}
                        autoFocus={aiApiKeySet && isEditingKey}
                        style={{
                          flex: 1,
                          width: "100%",
                          padding: "8px 12px",
                          borderRadius: 6,
                          border: `1px solid ${
                            keyStatus?.state === "valid"
                              ? "#10b981"
                              : keyStatus?.state === "invalid"
                              ? "#ef4444"
                              : "var(--wa-border-strong)"
                          }`,
                          fontSize: 13,
                          outline: "none",
                          backgroundColor: "var(--wa-input-bg)",
                          color: "var(--wa-text-primary)",
                        }}
                      />
                      {aiApiKeySet && (
                        <button
                          type="button"
                          onClick={() => {
                            setConfigForm((prev) => ({ ...prev, aiApiKey: "" }));
                            onApiKeyChange?.("");
                            setIsEditingKey(false);
                          }}
                          style={{
                            padding: "8px 12px",
                            fontSize: 12,
                            fontWeight: 500,
                            color: "var(--wa-text-secondary)",
                            background: "transparent",
                            border: "1px solid var(--wa-border-strong)",
                            borderRadius: 6,
                            cursor: "pointer",
                            whiteSpace: "nowrap",
                            flexShrink: 0,
                          }}
                          onMouseOver={(e) => {
                            e.currentTarget.style.color = "var(--wa-text-primary)";
                            e.currentTarget.style.borderColor = "#00a884";
                          }}
                          onMouseOut={(e) => {
                            e.currentTarget.style.color = "var(--wa-text-secondary)";
                            e.currentTarget.style.borderColor = "var(--wa-border-strong)";
                          }}
                        >
                          Cancel
                        </button>
                      )}
                    </div>
                    {keyStatus?.state === "checking" && (
                      <span style={{ fontSize: 11, color: "var(--wa-text-secondary)", marginTop: 3, display: "flex", alignItems: "center", gap: 4 }}>
                        <RefreshIcon size={12} color="var(--wa-text-secondary)" />
                        <span>{keyStatus.message || "Validating key..."}</span>
                      </span>
                    )}
                    {keyStatus?.state === "valid" && (
                      <span style={{ fontSize: 11, color: "#10b981", marginTop: 3, display: "flex", alignItems: "center", gap: 4, fontWeight: 600 }}>
                        <CheckIcon size={12} color="#10b981" />
                        <span>{keyStatus.message || `Valid ${keyStatus.provider} Key`}</span>
                      </span>
                    )}
                    {keyStatus?.state === "invalid" && (
                      <span style={{ fontSize: 11, color: "#ef4444", marginTop: 3, display: "flex", alignItems: "center", gap: 4 }}>
                        <WarningIcon size={12} color="#ef4444" />
                        <span>{keyStatus.message || "Invalid API key"}</span>
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* AI Model */}
              <div>
                <label style={{ fontSize: 12, color: "var(--wa-text-secondary)", display: "block", marginBottom: 4 }}>
                  AI Model
                </label>
                {keyStatus?.models && keyStatus.models.length > 0 ? (
                  <select
                    value={configForm.aiModel || ""}
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
                    value={configForm.aiModel || ""}
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

          {/* Phase 4.1: Voice Note Transcription (Groq Whisper) Card */}
          <div className="wa-card">
            <div style={{ display: "grid", gap: 12 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      width: 28,
                      height: 28,
                      borderRadius: 6,
                      background: isVoiceTranscriptionActive ? "rgba(0, 168, 132, 0.15)" : "var(--wa-input-bg)",
                      color: isVoiceTranscriptionActive ? "#00a884" : "var(--wa-text-secondary)",
                    }}
                  >
                    <MicIcon size={16} color="currentColor" />
                  </div>
                  <div>
                    <span style={{ fontWeight: 600, fontSize: 13, color: "var(--wa-text-primary)", display: "block" }}>
                      Voice Note Transcription
                    </span>
                    <span style={{ fontSize: 11, color: "var(--wa-text-secondary)" }}>
                      Transcribe incoming .opus voice notes with Groq Whisper
                    </span>
                  </div>
                </div>

                {/* Toggle Switch */}
                <button
                  type="button"
                  role="switch"
                  aria-checked={isVoiceTranscriptionActive}
                  onClick={() =>
                    setConfigForm((prev) => ({
                      ...prev,
                      voiceNoteTranscriptionEnabled: !isVoiceTranscriptionActive,
                    }))
                  }
                  style={{
                    width: 44,
                    height: 24,
                    borderRadius: 12,
                    background: isVoiceTranscriptionActive ? "#00a884" : "var(--wa-border-strong)",
                    border: "none",
                    cursor: "pointer",
                    position: "relative",
                    transition: "background 0.2s ease",
                    padding: 2,
                    flexShrink: 0,
                  }}
                  title={isVoiceTranscriptionActive ? "Disable Voice Transcription" : "Enable Voice Transcription"}
                >
                  <div
                    style={{
                      width: 20,
                      height: 20,
                      borderRadius: "50%",
                      background: "#ffffff",
                      transform: isVoiceTranscriptionActive ? "translateX(20px)" : "translateX(0px)",
                      transition: "transform 0.2s ease",
                      boxShadow: "0 1px 3px rgba(0,0,0,0.25)",
                    }}
                  />
                </button>
              </div>

              {isVoiceTranscriptionActive && (
                <div style={{ display: "grid", gap: 10, paddingTop: 4, borderTop: "1px solid var(--wa-border)" }}>
                  {/* Status Banner */}
                  {groqApiKeySet && !isEditingGroqKey ? (
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "8px 12px",
                        borderRadius: 6,
                        border: "1px solid var(--wa-border-strong)",
                        backgroundColor: "var(--wa-input-bg)",
                        gap: 8,
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0, overflow: "hidden" }}>
                        <div
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            width: 26,
                            height: 26,
                            borderRadius: 6,
                            background: "rgba(16, 185, 129, 0.15)",
                            color: "#10b981",
                            flexShrink: 0,
                          }}
                        >
                          <KeyIcon size={14} color="#10b981" />
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
                          <span
                            style={{
                              fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
                              fontSize: 13,
                              fontWeight: 600,
                              color: "var(--wa-text-primary)",
                              letterSpacing: "0.5px",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {groqApiKeyMasked || "••••••••••••••••"}
                          </span>
                          <span style={{ fontSize: 10, color: "#10b981", display: "flex", alignItems: "center", gap: 3, fontWeight: 600 }}>
                            <CheckIcon size={10} color="#10b981" strokeWidth={3} />
                            <span>Custom Groq Key Active</span>
                          </span>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => setIsEditingGroqKey(true)}
                        style={{
                          padding: "6px 12px",
                          fontSize: 12,
                          fontWeight: 600,
                          color: "var(--wa-text-primary)",
                          background: "var(--wa-card-bg)",
                          border: "1px solid var(--wa-border-strong)",
                          borderRadius: 6,
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          gap: 5,
                          whiteSpace: "nowrap",
                          flexShrink: 0,
                        }}
                      >
                        <EditIcon size={12} color="currentColor" />
                        <span>Change</span>
                      </button>
                    </div>
                  ) : !isEditingGroqKey && hasSuperadminGroqFallback ? (
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "8px 12px",
                        borderRadius: 6,
                        background: "rgba(0, 168, 132, 0.08)",
                        border: "1px solid rgba(0, 168, 132, 0.25)",
                        gap: 8,
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <CheckIcon size={14} color="#00a884" strokeWidth={2.5} />
                        <div>
                          <span style={{ fontSize: 12, fontWeight: 600, color: "#00a884", display: "block" }}>
                            Using Superadmin Groq Key (Fallback)
                          </span>
                          <span style={{ fontSize: 11, color: "var(--wa-text-secondary)" }}>
                            Free system-provided Whisper LPU transcription active
                          </span>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => setIsEditingGroqKey(true)}
                        style={{
                          padding: "5px 10px",
                          fontSize: 11,
                          fontWeight: 600,
                          color: "var(--wa-text-primary)",
                          background: "var(--wa-card-bg)",
                          border: "1px solid var(--wa-border-strong)",
                          borderRadius: 6,
                          cursor: "pointer",
                          whiteSpace: "nowrap",
                          flexShrink: 0,
                        }}
                      >
                        Set Custom Key
                      </button>
                    </div>
                  ) : !isEditingGroqKey ? (
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "8px 12px",
                        borderRadius: 6,
                        background: "rgba(245, 158, 11, 0.08)",
                        border: "1px solid rgba(245, 158, 11, 0.25)",
                        gap: 8,
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <WarningIcon size={14} color="#f59e0b" />
                        <div>
                          <span style={{ fontSize: 12, fontWeight: 600, color: "#f59e0b", display: "block" }}>
                            No Groq API Key Configured
                          </span>
                          <span style={{ fontSize: 11, color: "var(--wa-text-secondary)" }}>
                            Enter a Groq API key to transcribe voice notes
                          </span>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => setIsEditingGroqKey(true)}
                        style={{
                          padding: "5px 10px",
                          fontSize: 11,
                          fontWeight: 600,
                          color: "var(--wa-text-primary)",
                          background: "var(--wa-card-bg)",
                          border: "1px solid var(--wa-border-strong)",
                          borderRadius: 6,
                          cursor: "pointer",
                          whiteSpace: "nowrap",
                          flexShrink: 0,
                        }}
                      >
                        Add Key
                      </button>
                    </div>
                  ) : null}

                  {/* Groq Key Input Field */}
                  {isEditingGroqKey && (
                    <div>
                      <label style={{ fontSize: 12, color: "var(--wa-text-secondary)", display: "block", marginBottom: 4 }}>
                        Custom Groq API Key (Optional - overrides superadmin fallback)
                      </label>
                      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                        <input
                          type="password"
                          value={configForm.groqApiKey || ""}
                          onChange={(e) => {
                            const key = e.target.value;
                            setConfigForm((prev) => ({ ...prev, groqApiKey: key }));
                            onGroqKeyChange?.(key);
                          }}
                          placeholder="gsk_..."
                          autoFocus
                          style={{
                            flex: 1,
                            width: "100%",
                            padding: "8px 12px",
                            borderRadius: 6,
                            border: `1px solid ${
                              groqKeyStatus?.state === "valid"
                                ? "#10b981"
                                : groqKeyStatus?.state === "invalid"
                                ? "#ef4444"
                                : "var(--wa-border-strong)"
                            }`,
                            fontSize: 13,
                            outline: "none",
                            backgroundColor: "var(--wa-input-bg)",
                            color: "var(--wa-text-primary)",
                          }}
                        />
                        <button
                          type="button"
                          onClick={() => {
                            setConfigForm((prev) => ({ ...prev, groqApiKey: "" }));
                            onGroqKeyChange?.("");
                            setIsEditingGroqKey(false);
                          }}
                          style={{
                            padding: "8px 12px",
                            fontSize: 12,
                            fontWeight: 500,
                            color: "var(--wa-text-secondary)",
                            background: "transparent",
                            border: "1px solid var(--wa-border-strong)",
                            borderRadius: 6,
                            cursor: "pointer",
                            whiteSpace: "nowrap",
                            flexShrink: 0,
                          }}
                        >
                          Cancel
                        </button>
                      </div>
                      {groqKeyStatus?.state === "checking" && (
                        <span style={{ fontSize: 11, color: "var(--wa-text-secondary)", marginTop: 3, display: "flex", alignItems: "center", gap: 4 }}>
                          <RefreshIcon size={12} color="var(--wa-text-secondary)" />
                          <span>{groqKeyStatus.message || "Validating Groq key..."}</span>
                        </span>
                      )}
                      {groqKeyStatus?.state === "valid" && (
                        <span style={{ fontSize: 11, color: "#10b981", marginTop: 3, display: "flex", alignItems: "center", gap: 4, fontWeight: 600 }}>
                          <CheckIcon size={12} color="#10b981" />
                          <span>{groqKeyStatus.message || "Valid Groq API Key"}</span>
                        </span>
                      )}
                      {groqKeyStatus?.state === "invalid" && (
                        <span style={{ fontSize: 11, color: "#ef4444", marginTop: 3, display: "flex", alignItems: "center", gap: 4 }}>
                          <WarningIcon size={12} color="#ef4444" />
                          <span>{groqKeyStatus.message || "Invalid Groq API key"}</span>
                        </span>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Phase 4.2: Multimodal Vision & Image Reasoning Card */}
          <div className="wa-card">
            <div style={{ display: "grid", gap: 12 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      width: 28,
                      height: 28,
                      borderRadius: 6,
                      background: isVisionActive ? "rgba(0, 168, 132, 0.15)" : "var(--wa-input-bg)",
                      color: isVisionActive ? "#00a884" : "var(--wa-text-secondary)",
                    }}
                  >
                    <ImageIcon size={16} color="currentColor" />
                  </div>
                  <div>
                    <span style={{ fontWeight: 600, fontSize: 13, color: "var(--wa-text-primary)", display: "block" }}>
                      Multimodal Vision Reasoning
                    </span>
                    <span style={{ fontSize: 11, color: "var(--wa-text-secondary)" }}>
                      Understand incoming photos, screenshots, and receipts
                    </span>
                  </div>
                </div>

                {/* Toggle Switch */}
                <button
                  type="button"
                  role="switch"
                  aria-checked={isVisionActive}
                  onClick={() =>
                    setConfigForm((prev) => ({
                      ...prev,
                      visionEnabled: !isVisionActive,
                    }))
                  }
                  style={{
                    width: 44,
                    height: 24,
                    borderRadius: 12,
                    background: isVisionActive ? "#00a884" : "var(--wa-border-strong)",
                    border: "none",
                    cursor: "pointer",
                    position: "relative",
                    transition: "background 0.2s ease",
                    padding: 2,
                    flexShrink: 0,
                  }}
                  title={isVisionActive ? "Disable Vision Reasoning" : "Enable Vision Reasoning"}
                >
                  <div
                    style={{
                      width: 20,
                      height: 20,
                      borderRadius: "50%",
                      background: "#ffffff",
                      transform: isVisionActive ? "translateX(20px)" : "translateX(0px)",
                      transition: "transform 0.2s ease",
                      boxShadow: "0 1px 3px rgba(0,0,0,0.25)",
                    }}
                  />
                </button>
              </div>

              {isVisionActive && (
                <div style={{ display: "grid", gap: 12, paddingTop: 4, borderTop: "1px solid var(--wa-border)" }}>
                  {/* Status Banner */}
                  {visionApiKeySet && !isEditingVisionKey ? (
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "8px 12px",
                        borderRadius: 6,
                        border: "1px solid var(--wa-border-strong)",
                        backgroundColor: "var(--wa-input-bg)",
                        gap: 8,
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0, overflow: "hidden" }}>
                        <div
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            width: 26,
                            height: 26,
                            borderRadius: 6,
                            background: "rgba(16, 185, 129, 0.15)",
                            color: "#10b981",
                            flexShrink: 0,
                          }}
                        >
                          <KeyIcon size={14} color="#10b981" />
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
                          <span
                            style={{
                              fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
                              fontSize: 13,
                              fontWeight: 600,
                              color: "var(--wa-text-primary)",
                              letterSpacing: "0.5px",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {visionApiKeyMasked || "••••••••••••••••"}
                          </span>
                          <span style={{ fontSize: 10, color: "#10b981", display: "flex", alignItems: "center", gap: 3, fontWeight: 600 }}>
                            <CheckIcon size={10} color="#10b981" strokeWidth={3} />
                            <span>Dedicated Vision Key Active</span>
                          </span>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => setIsEditingVisionKey(true)}
                        style={{
                          padding: "6px 12px",
                          fontSize: 12,
                          fontWeight: 600,
                          color: "var(--wa-text-primary)",
                          background: "var(--wa-card-bg)",
                          border: "1px solid var(--wa-border-strong)",
                          borderRadius: 6,
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          gap: 5,
                          whiteSpace: "nowrap",
                          flexShrink: 0,
                        }}
                      >
                        <EditIcon size={12} color="currentColor" />
                        <span>Change</span>
                      </button>
                    </div>
                  ) : !isEditingVisionKey && aiApiKeySet ? (
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "8px 12px",
                        borderRadius: 6,
                        background: "rgba(0, 168, 132, 0.08)",
                        border: "1px solid rgba(0, 168, 132, 0.25)",
                        gap: 8,
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <CheckIcon size={14} color="#00a884" strokeWidth={2.5} />
                        <div>
                          <span style={{ fontSize: 12, fontWeight: 600, color: "#00a884", display: "block" }}>
                            Using Primary AI Key as Fallback
                          </span>
                          <span style={{ fontSize: 11, color: "var(--wa-text-secondary)" }}>
                            Vision queries utilize your configured primary AI key
                          </span>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => setIsEditingVisionKey(true)}
                        style={{
                          padding: "5px 10px",
                          fontSize: 11,
                          fontWeight: 600,
                          color: "var(--wa-text-primary)",
                          background: "var(--wa-card-bg)",
                          border: "1px solid var(--wa-border-strong)",
                          borderRadius: 6,
                          cursor: "pointer",
                          whiteSpace: "nowrap",
                          flexShrink: 0,
                        }}
                      >
                        Set Dedicated Key
                      </button>
                    </div>
                  ) : !isEditingVisionKey ? (
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "8px 12px",
                        borderRadius: 6,
                        background: "rgba(245, 158, 11, 0.08)",
                        border: "1px solid rgba(245, 158, 11, 0.25)",
                        gap: 8,
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <WarningIcon size={14} color="#f59e0b" />
                        <div>
                          <span style={{ fontSize: 12, fontWeight: 600, color: "#f59e0b", display: "block" }}>
                            No AI or Vision Key Configured
                          </span>
                          <span style={{ fontSize: 11, color: "var(--wa-text-secondary)" }}>
                            Configure a vision key or primary AI key to enable image processing
                          </span>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => setIsEditingVisionKey(true)}
                        style={{
                          padding: "5px 10px",
                          fontSize: 11,
                          fontWeight: 600,
                          color: "var(--wa-text-primary)",
                          background: "var(--wa-card-bg)",
                          border: "1px solid var(--wa-border-strong)",
                          borderRadius: 6,
                          cursor: "pointer",
                          whiteSpace: "nowrap",
                          flexShrink: 0,
                        }}
                      >
                        Add Key
                      </button>
                    </div>
                  ) : null}

                  {/* Dedicated Vision Key Input Field */}
                  {isEditingVisionKey && (
                    <div>
                      <label style={{ fontSize: 12, color: "var(--wa-text-secondary)", display: "block", marginBottom: 4 }}>
                        Dedicated Vision API Key (Optional - leave blank to use primary AI key)
                      </label>
                      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                        <input
                          type="password"
                          value={configForm.visionApiKey || ""}
                          onChange={(e) => {
                            const key = e.target.value;
                            setConfigForm((prev) => ({ ...prev, visionApiKey: key }));
                            onVisionKeyChange?.(key);
                          }}
                          placeholder="e.g. AIza... (Gemini) or sk-... (OpenAI)"
                          autoFocus
                          style={{
                            flex: 1,
                            width: "100%",
                            padding: "8px 12px",
                            borderRadius: 6,
                            border: `1px solid ${
                              visionKeyStatus?.state === "valid"
                                ? "#10b981"
                                : visionKeyStatus?.state === "invalid"
                                ? "#ef4444"
                                : "var(--wa-border-strong)"
                            }`,
                            fontSize: 13,
                            outline: "none",
                            backgroundColor: "var(--wa-input-bg)",
                            color: "var(--wa-text-primary)",
                          }}
                        />
                        <button
                          type="button"
                          onClick={() => {
                            setConfigForm((prev) => ({ ...prev, visionApiKey: "" }));
                            onVisionKeyChange?.("");
                            setIsEditingVisionKey(false);
                          }}
                          style={{
                            padding: "8px 12px",
                            fontSize: 12,
                            fontWeight: 500,
                            color: "var(--wa-text-secondary)",
                            background: "transparent",
                            border: "1px solid var(--wa-border-strong)",
                            borderRadius: 6,
                            cursor: "pointer",
                            whiteSpace: "nowrap",
                            flexShrink: 0,
                          }}
                        >
                          Cancel
                        </button>
                      </div>
                      {visionKeyStatus?.state === "checking" && (
                        <span style={{ fontSize: 11, color: "var(--wa-text-secondary)", marginTop: 3, display: "flex", alignItems: "center", gap: 4 }}>
                          <RefreshIcon size={12} color="var(--wa-text-secondary)" />
                          <span>{visionKeyStatus.message || "Validating vision key..."}</span>
                        </span>
                      )}
                      {visionKeyStatus?.state === "valid" && (
                        <span style={{ fontSize: 11, color: "#10b981", marginTop: 3, display: "flex", alignItems: "center", gap: 4, fontWeight: 600 }}>
                          <CheckIcon size={12} color="#10b981" />
                          <span>{visionKeyStatus.message || `Valid ${visionKeyStatus.provider} Key`}</span>
                        </span>
                      )}
                      {visionKeyStatus?.state === "invalid" && (
                        <span style={{ fontSize: 11, color: "#ef4444", marginTop: 3, display: "flex", alignItems: "center", gap: 4 }}>
                          <WarningIcon size={12} color="#ef4444" />
                          <span>{visionKeyStatus.message || "Invalid vision key"}</span>
                        </span>
                      )}
                    </div>
                  )}

                  {/* Vision Model Selector */}
                  <div>
                    <label style={{ fontSize: 12, color: "var(--wa-text-secondary)", display: "block", marginBottom: 4 }}>
                      Vision Model
                    </label>
                    <select
                      value={configForm.visionModel || "gemini-2.0-flash"}
                      onChange={(e) =>
                        setConfigForm((prev) => ({ ...prev, visionModel: e.target.value }))
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
                      {(visionKeyStatus?.models && visionKeyStatus.models.length > 0
                        ? visionKeyStatus.models
                        : POPULAR_VISION_MODELS
                      ).map((m) => (
                        <option key={m.id || m} value={m.id || m}>
                          {m.name || m.id || m}
                        </option>
                      ))}
                    </select>
                    <span style={{ fontSize: 11, color: "var(--wa-text-secondary)", marginTop: 4, display: "block" }}>
                      Model used for contextualizing images, charts, photos, and memes in chat.
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Phase 5.1: Calendar & Free-Busy Availability Grounding */}
          <div className="wa-card">
            <div style={{ display: "grid", gap: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: 28,
                    height: 28,
                    borderRadius: 6,
                    background: configForm.calendarFeedUrl ? "rgba(0, 168, 132, 0.15)" : "var(--wa-input-bg)",
                    color: configForm.calendarFeedUrl ? "#00a884" : "var(--wa-text-secondary)",
                  }}
                >
                  <CalendarIcon size={16} color="currentColor" />
                </div>
                <div>
                  <span style={{ fontWeight: 600, fontSize: 13, color: "var(--wa-text-primary)", display: "block" }}>
                    Calendar & Availability Grounding
                  </span>
                  <span style={{ fontSize: 11, color: "var(--wa-text-secondary)" }}>
                    Sync read-only iCal feed for sub-2ms free/busy scheduling
                  </span>
                </div>
              </div>

              {/* Feed URL Input */}
              <div style={{ display: "grid", gap: 6, paddingTop: 4, borderTop: "1px solid var(--wa-border)" }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: "var(--wa-text-primary)" }}>
                  Private iCal / ICS Subscription URL
                </label>
                <input
                  type="url"
                  value={configForm.calendarFeedUrl || ""}
                  onChange={(e) =>
                    setConfigForm((prev) => ({ ...prev, calendarFeedUrl: e.target.value }))
                  }
                  placeholder="e.g. https://calendar.google.com/calendar/ical/.../basic.ics"
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    borderRadius: 6,
                    border: "1px solid var(--wa-border-strong)",
                    fontSize: 13,
                    outline: "none",
                    backgroundColor: "var(--wa-input-bg)",
                    color: "var(--wa-text-primary)",
                  }}
                />
                <span style={{ fontSize: 11, color: "var(--wa-text-secondary)", lineHeight: 1.4 }}>
                  Obtain from Google Calendar (Settings &gt; Secret address in iCal format), Apple Calendar (Share Calendar), or Outlook. Zero OAuth setup needed.
                </span>

                {/* Timezone Selector */}
                <div style={{ marginTop: 6 }}>
                  <label style={{ fontSize: 12, color: "var(--wa-text-secondary)", display: "block", marginBottom: 4 }}>
                    Your Timezone
                  </label>
                  <input
                    type="text"
                    value={configForm.timezone || "UTC"}
                    onChange={(e) =>
                      setConfigForm((prev) => ({ ...prev, timezone: e.target.value }))
                    }
                    placeholder="e.g. Asia/Kolkata, America/New_York, Europe/London"
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
                  <span style={{ fontSize: 11, color: "var(--wa-text-secondary)", marginTop: 2, display: "block" }}>
                    IANA Timezone string used to anchor relative dates ("tomorrow 4 PM", "next Friday").
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Phase 5.2: Real-Time Fact Search (Zero-Cost) */}
          <div className="wa-card">
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: 28,
                    height: 28,
                    borderRadius: 6,
                    background: configForm.searchEnabled !== false ? "rgba(0, 168, 132, 0.15)" : "var(--wa-input-bg)",
                    color: configForm.searchEnabled !== false ? "#00a884" : "var(--wa-text-secondary)",
                  }}
                >
                  <SearchIcon size={16} color="currentColor" />
                </div>
                <div>
                  <span style={{ fontWeight: 600, fontSize: 13, color: "var(--wa-text-primary)", display: "block" }}>
                    Real-Time Fact Search (Zero-Cost)
                  </span>
                  <span style={{ fontSize: 11, color: "var(--wa-text-secondary)" }}>
                    Ground venue hours, weather, and locations with semantic anti-hallucination filter
                  </span>
                </div>
              </div>

              {/* Toggle Switch */}
              <button
                type="button"
                role="switch"
                aria-checked={configForm.searchEnabled !== false}
                onClick={() =>
                  setConfigForm((prev) => ({
                    ...prev,
                    searchEnabled: prev.searchEnabled === false,
                  }))
                }
                style={{
                  width: 44,
                  height: 24,
                  borderRadius: 12,
                  background: configForm.searchEnabled !== false ? "#00a884" : "var(--wa-border-strong)",
                  border: "none",
                  cursor: "pointer",
                  position: "relative",
                  transition: "background 0.2s ease",
                  padding: 2,
                  flexShrink: 0,
                }}
                title={configForm.searchEnabled !== false ? "Disable Fact Search" : "Enable Fact Search"}
              >
                <div
                  style={{
                    width: 20,
                    height: 20,
                    borderRadius: "50%",
                    background: "#ffffff",
                    transform: configForm.searchEnabled !== false ? "translateX(20px)" : "translateX(0px)",
                    transition: "transform 0.2s ease",
                    boxShadow: "0 1px 3px rgba(0,0,0,0.25)",
                  }}
                />
              </button>
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
            <svg viewBox="0 0 24 24" width={16} height={16} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
