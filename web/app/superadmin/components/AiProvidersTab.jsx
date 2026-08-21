"use client";

import React from "react";
import {
  KeyIcon,
  MicIcon,
  RobotIcon,
  ServerIcon,
  CheckIcon,
  WarningIcon,
} from "../../components/Icons/WhatsAppIcons";
import { formatTimeAgo } from "./utils";

export default function AiProvidersTab({
  aiUsage,
  aiData,
  editingGroq,
  setEditingGroq,
  groqKeyInput,
  setGroqKeyInput,
  showGroqKey,
  setShowGroqKey,
  editingOpenrouter,
  setEditingOpenrouter,
  openrouterKeyInput,
  setOpenrouterKeyInput,
  showOpenrouterKey,
  setShowOpenrouterKey,
  modelInput,
  setModelInput,
  whisperProviderInput,
  setWhisperProviderInput,
  aiUpdating,
  handleSaveAiConfig,
  handleTestProvider,
  testState,
}) {
  return (
    <>
      {/* AI Top Metric Cards */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: "16px",
          marginBottom: "24px",
        }}
      >
        {/* Card 1: Groq Voice Notes Transcribed */}
        <div
          style={{
            backgroundColor: "var(--wa-card-bg)",
            border: "1px solid var(--wa-card-border)",
            borderRadius: 10,
            padding: "16px 20px",
            boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
            <span style={{ fontSize: "12px", color: "var(--wa-text-muted)", fontWeight: "600", textTransform: "uppercase" }}>
              Voice Notes Transcribed
            </span>
            <div style={{ padding: "2px 6px", borderRadius: 4, backgroundColor: "rgba(0, 168, 132, 0.12)", color: "var(--wa-teal)", fontSize: "11px", fontWeight: "700" }}>
              Whisper v3
            </div>
          </div>
          <div style={{ fontSize: "28px", fontWeight: "700", color: "var(--wa-teal)" }}>
            {aiUsage.totalVoiceNotesTranscribed}
          </div>
          <div style={{ fontSize: "12px", color: "var(--wa-text-secondary)", marginTop: 4 }}>
            {aiUsage.totalAudioDurationFormatted} audio processed
          </div>
        </div>

        {/* Card 2: AI Takeover Completions */}
        <div
          style={{
            backgroundColor: "var(--wa-card-bg)",
            border: "1px solid var(--wa-card-border)",
            borderRadius: 10,
            padding: "16px 20px",
            boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
          }}
        >
          <div style={{ fontSize: "12px", color: "var(--wa-text-muted)", fontWeight: "600", marginBottom: 6, textTransform: "uppercase" }}>
            AI Persona Turns Generated
          </div>
          <div style={{ fontSize: "28px", fontWeight: "700", color: "var(--wa-text-primary)" }}>
            {aiUsage.totalAiMessages}
          </div>
          <div style={{ fontSize: "12px", color: "var(--wa-text-secondary)", marginTop: 4 }}>
            ~{Math.round(aiUsage.estimatedTotalTokens / 1000)}k estimated tokens
          </div>
        </div>

        {/* Card 3: Groq Free Tier Daily Quota */}
        <div
          style={{
            backgroundColor: "var(--wa-card-bg)",
            border: "1px solid var(--wa-card-border)",
            borderRadius: 10,
            padding: "16px 20px",
            boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
            <span style={{ fontSize: "12px", color: "var(--wa-text-muted)", fontWeight: "600", textTransform: "uppercase" }}>
              Groq Free Tier Usage
            </span>
            <span style={{ fontSize: "11px", color: "#10b981", fontWeight: "700" }}>
              100% Free
            </span>
          </div>
          <div style={{ fontSize: "28px", fontWeight: "700", color: "var(--wa-text-primary)" }}>
            {aiUsage.groqPercentUsed}%
          </div>
          {/* Progress bar */}
          <div style={{ width: "100%", height: 6, backgroundColor: "var(--wa-search-input)", borderRadius: 3, overflow: "hidden", margin: "6px 0" }}>
            <div
              style={{
                width: `${Math.max(4, aiUsage.groqPercentUsed)}%`,
                height: "100%",
                backgroundColor: aiUsage.groqPercentUsed > 80 ? "#ef4444" : "var(--wa-teal)",
              }}
            />
          </div>
          <div style={{ fontSize: "11px", color: "var(--wa-text-muted)" }}>
            {aiUsage.groqSecondsUsedToday}s / 7,200s daily limit
          </div>
        </div>

        {/* Card 4: Active Model */}
        <div
          style={{
            backgroundColor: "var(--wa-card-bg)",
            border: "1px solid var(--wa-card-border)",
            borderRadius: 10,
            padding: "16px 20px",
            boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
          }}
        >
          <div style={{ fontSize: "12px", color: "var(--wa-text-muted)", fontWeight: "600", marginBottom: 6, textTransform: "uppercase" }}>
            Fleet Default Model
          </div>
          <div style={{ fontSize: "18px", fontWeight: "700", color: "var(--wa-text-primary)", fontFamily: "monospace", wordBreak: "break-all" }}>
            {aiData?.config?.aiModel?.split("/").pop() || "qwen3.8-27b"}
          </div>
          <div style={{ fontSize: "12px", color: "var(--wa-text-secondary)", marginTop: 4 }}>
            STT: {aiData?.config?.whisperProvider || "groq"}
          </div>
        </div>
      </div>

      {/* Provider Key Configuration Card */}
      <div
        style={{
          backgroundColor: "var(--wa-card-bg)",
          border: "1px solid var(--wa-card-border)",
          borderRadius: 10,
          padding: "24px",
          marginBottom: "24px",
          boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
          <div
            style={{
              width: 42,
              height: 42,
              borderRadius: 10,
              backgroundColor: "rgba(0, 168, 132, 0.15)",
              color: "var(--wa-teal)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <KeyIcon size={22} color="var(--wa-teal)" />
          </div>
          <div>
            <h2 style={{ fontSize: "18px", fontWeight: "700", margin: 0 }}>
              Global AI Provider Keys &amp; Whisper Audio Config
            </h2>
            <p style={{ fontSize: "13px", color: "var(--wa-text-secondary)", margin: "4px 0 0 0" }}>
              Configure Groq for zero-cost multilingual voice note transcription and OpenRouter for persona chat completions.
            </p>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))", gap: "20px" }}>
          {/* 1. Groq Provider Box */}
          <div
            style={{
              backgroundColor: "var(--wa-panel-bg)",
              border: "1px solid var(--wa-border)",
              borderRadius: 10,
              padding: "18px",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <MicIcon size={18} color="var(--wa-teal)" />
                <span style={{ fontWeight: "700", fontSize: "14px" }}>Groq Cloud API Key (`GROQ_API_KEY`)</span>
              </div>
              <span
                style={{
                  fontSize: "11px",
                  padding: "2px 8px",
                  borderRadius: 10,
                  backgroundColor: aiData?.config?.groqApiKeySet ? "rgba(16, 185, 129, 0.15)" : "rgba(239, 68, 68, 0.15)",
                  color: aiData?.config?.groqApiKeySet ? "#10b981" : "#ef4444",
                  fontWeight: "600",
                }}
              >
                {aiData?.config?.groqApiKeySet ? "Configured" : "Missing Key"}
              </span>
            </div>

            <p style={{ fontSize: "12px", color: "var(--wa-text-secondary)", marginBottom: 14 }}>
              Provides ultra-fast, 100% free multilingual Whisper transcription (`whisper-large-v3-turbo`) for incoming `.opus` voice notes with zero server GPU load.
            </p>

            {!editingGroq ? (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, backgroundColor: "var(--wa-search-input)", padding: "10px 14px", borderRadius: 8, border: "1px solid var(--wa-border)" }}>
                <div style={{ fontFamily: "monospace", fontSize: "13px", color: aiData?.config?.groqApiKeySet ? "var(--wa-text-primary)" : "var(--wa-text-muted)" }}>
                  {aiData?.config?.groqApiKeyMasked || "No API key configured"}
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <button
                    onClick={() => {
                      setEditingGroq(true);
                      setGroqKeyInput("");
                    }}
                    style={{
                      padding: "5px 10px",
                      backgroundColor: "var(--wa-btn-secondary-bg)",
                      border: "1px solid var(--wa-border)",
                      borderRadius: 6,
                      color: "var(--wa-text-primary)",
                      fontSize: "12px",
                      cursor: "pointer",
                    }}
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleTestProvider("groq")}
                    disabled={testState.groq.loading || !aiData?.config?.groqApiKeySet}
                    style={{
                      padding: "5px 10px",
                      backgroundColor: "rgba(0, 168, 132, 0.12)",
                      border: "1px solid var(--wa-teal)",
                      borderRadius: 6,
                      color: "var(--wa-teal)",
                      fontSize: "12px",
                      fontWeight: "600",
                      cursor: testState.groq.loading || !aiData?.config?.groqApiKeySet ? "not-allowed" : "pointer",
                    }}
                  >
                    {testState.groq.loading ? "Testing..." : "Ping Test"}
                  </button>
                </div>
              </div>
            ) : (
              <div>
                <div style={{ position: "relative", marginBottom: 10 }}>
                  <input
                    type={showGroqKey ? "text" : "password"}
                    value={groqKeyInput}
                    onChange={(e) => setGroqKeyInput(e.target.value)}
                    placeholder="Paste Groq Key (gsk_...)"
                    style={{
                      width: "100%",
                      padding: "10px 14px",
                      paddingRight: "60px",
                      borderRadius: 8,
                      border: "1px solid var(--wa-teal)",
                      backgroundColor: "var(--wa-input-bg)",
                      color: "var(--wa-text-primary)",
                      fontSize: "13px",
                      fontFamily: "monospace",
                      outline: "none",
                      boxSizing: "border-box",
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowGroqKey(!showGroqKey)}
                    style={{
                      position: "absolute",
                      right: 8,
                      top: "50%",
                      transform: "translateY(-50%)",
                      background: "none",
                      border: "none",
                      color: "var(--wa-text-muted)",
                      fontSize: "11px",
                      cursor: "pointer",
                      padding: "4px 6px",
                    }}
                  >
                    {showGroqKey ? "Hide" : "Show"}
                  </button>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    onClick={() => handleSaveAiConfig({ groqApiKey: groqKeyInput.trim() })}
                    disabled={aiUpdating || !groqKeyInput.trim()}
                    style={{
                      padding: "7px 14px",
                      backgroundColor: "var(--wa-teal)",
                      color: "#ffffff",
                      border: "none",
                      borderRadius: 6,
                      fontSize: "12px",
                      fontWeight: "600",
                      cursor: aiUpdating || !groqKeyInput.trim() ? "not-allowed" : "pointer",
                    }}
                  >
                    {aiUpdating ? "Saving..." : "Save Key"}
                  </button>
                  <button
                    onClick={() => {
                      setEditingGroq(false);
                      setGroqKeyInput("");
                    }}
                    style={{
                      padding: "7px 12px",
                      backgroundColor: "transparent",
                      border: "1px solid var(--wa-border)",
                      borderRadius: 6,
                      color: "var(--wa-text-secondary)",
                      fontSize: "12px",
                      cursor: "pointer",
                    }}
                  >
                    Cancel
                  </button>
                  {aiData?.config?.groqApiKeySet && (
                    <button
                      onClick={() => {
                        if (confirm("Clear the global Groq API key?")) {
                          handleSaveAiConfig({ groqApiKey: "" });
                        }
                      }}
                      style={{
                        padding: "7px 12px",
                        backgroundColor: "rgba(239, 68, 68, 0.1)",
                        border: "1px solid rgba(239, 68, 68, 0.2)",
                        borderRadius: 6,
                        color: "#ef4444",
                        fontSize: "12px",
                        cursor: "pointer",
                        marginLeft: "auto",
                      }}
                    >
                      Clear
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Groq Ping Test Result Banner */}
            {testState.groq.result && (
              <div
                style={{
                  marginTop: 12,
                  padding: "8px 12px",
                  borderRadius: 6,
                  backgroundColor: testState.groq.result.success ? "rgba(16, 185, 129, 0.12)" : "rgba(239, 68, 68, 0.12)",
                  border: testState.groq.result.success ? "1px solid rgba(16, 185, 129, 0.3)" : "1px solid rgba(239, 68, 68, 0.3)",
                  color: testState.groq.result.success ? "#10b981" : "#ef4444",
                  fontSize: "12px",
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                {testState.groq.result.success ? (
                  <>
                    <CheckIcon size={14} color="#10b981" />
                    <span>Connected ({testState.groq.result.latencyMs}ms) — Whisper large-v3-turbo ready</span>
                  </>
                ) : (
                  <>
                    <WarningIcon size={14} color="#ef4444" />
                    <span>{testState.groq.result.error || "Groq connection failed"}</span>
                  </>
                )}
              </div>
            )}
          </div>

          {/* 2. OpenRouter / LLM Provider Box */}
          <div
            style={{
              backgroundColor: "var(--wa-panel-bg)",
              border: "1px solid var(--wa-border)",
              borderRadius: 10,
              padding: "18px",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <RobotIcon size={18} color="var(--wa-teal)" />
                <span style={{ fontWeight: "700", fontSize: "14px" }}>OpenRouter / LLM Key</span>
              </div>
              <span
                style={{
                  fontSize: "11px",
                  padding: "2px 8px",
                  borderRadius: 10,
                  backgroundColor: aiData?.config?.openrouterApiKeySet ? "rgba(16, 185, 129, 0.15)" : "rgba(239, 68, 68, 0.15)",
                  color: aiData?.config?.openrouterApiKeySet ? "#10b981" : "#ef4444",
                  fontWeight: "600",
                }}
              >
                {aiData?.config?.openrouterApiKeySet ? "Configured" : "Missing Key"}
              </span>
            </div>

            <p style={{ fontSize: "12px", color: "var(--wa-text-secondary)", marginBottom: 14 }}>
              Powers the autonomous style mimicking and reasoning engine across all whitelisted contacts.
            </p>

            {!editingOpenrouter ? (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, backgroundColor: "var(--wa-search-input)", padding: "10px 14px", borderRadius: 8, border: "1px solid var(--wa-border)" }}>
                <div style={{ fontFamily: "monospace", fontSize: "13px", color: aiData?.config?.openrouterApiKeySet ? "var(--wa-text-primary)" : "var(--wa-text-muted)" }}>
                  {aiData?.config?.openrouterApiKeyMasked || "No API key configured"}
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <button
                    onClick={() => {
                      setEditingOpenrouter(true);
                      setOpenrouterKeyInput("");
                    }}
                    style={{
                      padding: "5px 10px",
                      backgroundColor: "var(--wa-btn-secondary-bg)",
                      border: "1px solid var(--wa-border)",
                      borderRadius: 6,
                      color: "var(--wa-text-primary)",
                      fontSize: "12px",
                      cursor: "pointer",
                    }}
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleTestProvider("openrouter")}
                    disabled={testState.openrouter.loading || !aiData?.config?.openrouterApiKeySet}
                    style={{
                      padding: "5px 10px",
                      backgroundColor: "rgba(0, 168, 132, 0.12)",
                      border: "1px solid var(--wa-teal)",
                      borderRadius: 6,
                      color: "var(--wa-teal)",
                      fontSize: "12px",
                      fontWeight: "600",
                      cursor: testState.openrouter.loading || !aiData?.config?.openrouterApiKeySet ? "not-allowed" : "pointer",
                    }}
                  >
                    {testState.openrouter.loading ? "Testing..." : "Ping Test"}
                  </button>
                </div>
              </div>
            ) : (
              <div>
                <div style={{ position: "relative", marginBottom: 10 }}>
                  <input
                    type={showOpenrouterKey ? "text" : "password"}
                    value={openrouterKeyInput}
                    onChange={(e) => setOpenrouterKeyInput(e.target.value)}
                    placeholder="Paste OpenRouter Key (sk-or-v1-...)"
                    style={{
                      width: "100%",
                      padding: "10px 14px",
                      paddingRight: "60px",
                      borderRadius: 8,
                      border: "1px solid var(--wa-teal)",
                      backgroundColor: "var(--wa-input-bg)",
                      color: "var(--wa-text-primary)",
                      fontSize: "13px",
                      fontFamily: "monospace",
                      outline: "none",
                      boxSizing: "border-box",
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowOpenrouterKey(!showOpenrouterKey)}
                    style={{
                      position: "absolute",
                      right: 8,
                      top: "50%",
                      transform: "translateY(-50%)",
                      background: "none",
                      border: "none",
                      color: "var(--wa-text-muted)",
                      fontSize: "11px",
                      cursor: "pointer",
                      padding: "4px 6px",
                    }}
                  >
                    {showOpenrouterKey ? "Hide" : "Show"}
                  </button>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    onClick={() => handleSaveAiConfig({ openrouterApiKey: openrouterKeyInput.trim() })}
                    disabled={aiUpdating || !openrouterKeyInput.trim()}
                    style={{
                      padding: "7px 14px",
                      backgroundColor: "var(--wa-teal)",
                      color: "#ffffff",
                      border: "none",
                      borderRadius: 6,
                      fontSize: "12px",
                      fontWeight: "600",
                      cursor: aiUpdating || !openrouterKeyInput.trim() ? "not-allowed" : "pointer",
                    }}
                  >
                    {aiUpdating ? "Saving..." : "Save Key"}
                  </button>
                  <button
                    onClick={() => {
                      setEditingOpenrouter(false);
                      setOpenrouterKeyInput("");
                    }}
                    style={{
                      padding: "7px 12px",
                      backgroundColor: "transparent",
                      border: "1px solid var(--wa-border)",
                      borderRadius: 6,
                      color: "var(--wa-text-secondary)",
                      fontSize: "12px",
                      cursor: "pointer",
                    }}
                  >
                    Cancel
                  </button>
                  {aiData?.config?.openrouterApiKeySet && (
                    <button
                      onClick={() => {
                        if (confirm("Clear the global OpenRouter API key?")) {
                          handleSaveAiConfig({ openrouterApiKey: "" });
                        }
                      }}
                      style={{
                        padding: "7px 12px",
                        backgroundColor: "rgba(239, 68, 68, 0.1)",
                        border: "1px solid rgba(239, 68, 68, 0.2)",
                        borderRadius: 6,
                        color: "#ef4444",
                        fontSize: "12px",
                        cursor: "pointer",
                        marginLeft: "auto",
                      }}
                    >
                      Clear
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* OpenRouter Ping Test Result Banner */}
            {testState.openrouter.result && (
              <div
                style={{
                  marginTop: 12,
                  padding: "8px 12px",
                  borderRadius: 6,
                  backgroundColor: testState.openrouter.result.success ? "rgba(16, 185, 129, 0.12)" : "rgba(239, 68, 68, 0.12)",
                  border: testState.openrouter.result.success ? "1px solid rgba(16, 185, 129, 0.3)" : "1px solid rgba(239, 68, 68, 0.3)",
                  color: testState.openrouter.result.success ? "#10b981" : "#ef4444",
                  fontSize: "12px",
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                {testState.openrouter.result.success ? (
                  <>
                    <CheckIcon size={14} color="#10b981" />
                    <span>Connected ({testState.openrouter.result.latencyMs}ms) — LLM auth verified</span>
                  </>
                ) : (
                  <>
                    <WarningIcon size={14} color="#ef4444" />
                    <span>{testState.openrouter.result.error || "OpenRouter connection failed"}</span>
                  </>
                )}
              </div>
            )}
          </div>

          {/* 3. Default AI Model & Provider Mode Selector */}
          <div
            style={{
              backgroundColor: "var(--wa-panel-bg)",
              border: "1px solid var(--wa-border)",
              borderRadius: 10,
              padding: "18px",
              gridColumn: "1 / -1",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <ServerIcon size={18} color="var(--wa-teal)" />
              <span style={{ fontWeight: "700", fontSize: "14px" }}>Model &amp; STT Engine Selection</span>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "16px" }}>
              <div>
                <label style={{ display: "block", fontSize: "12px", fontWeight: "600", color: "var(--wa-text-secondary)", marginBottom: 6, textTransform: "uppercase" }}>
                  Default Persona LLM Model
                </label>
                <div style={{ display: "flex", gap: 8 }}>
                  <input
                    type="text"
                    value={modelInput}
                    onChange={(e) => setModelInput(e.target.value)}
                    placeholder="e.g. qwen/qwen3.8-27b"
                    style={{
                      flex: 1,
                      padding: "8px 12px",
                      borderRadius: 6,
                      border: "1px solid var(--wa-border)",
                      backgroundColor: "var(--wa-input-bg)",
                      color: "var(--wa-text-primary)",
                      fontSize: "13px",
                      fontFamily: "monospace",
                      outline: "none",
                    }}
                  />
                  <button
                    onClick={() => handleSaveAiConfig({ aiModel: modelInput.trim() })}
                    disabled={aiUpdating || !modelInput.trim()}
                    style={{
                      padding: "8px 14px",
                      backgroundColor: "var(--wa-teal)",
                      color: "#ffffff",
                      border: "none",
                      borderRadius: 6,
                      fontSize: "12px",
                      fontWeight: "600",
                      cursor: "pointer",
                    }}
                  >
                    Save
                  </button>
                </div>
              </div>

              <div>
                <label style={{ display: "block", fontSize: "12px", fontWeight: "600", color: "var(--wa-text-secondary)", marginBottom: 6, textTransform: "uppercase" }}>
                  Whisper Audio STT Engine
                </label>
                <select
                  value={whisperProviderInput}
                  onChange={(e) => {
                    setWhisperProviderInput(e.target.value);
                    handleSaveAiConfig({ whisperProvider: e.target.value });
                  }}
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    borderRadius: 6,
                    border: "1px solid var(--wa-border)",
                    backgroundColor: "var(--wa-input-bg)",
                    color: "var(--wa-text-primary)",
                    fontSize: "13px",
                    outline: "none",
                    cursor: "pointer",
                  }}
                >
                  <option value="groq">Groq Cloud (Whisper Large-v3-Turbo — Free &amp; ~180ms)</option>
                  <option value="faster-whisper-cpu">Local VM CPU (faster-whisper INT8 — Zero API calls)</option>
                  <option value="whisper.cpp">Embedded C++ (whisper.cpp binary)</option>
                </select>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Per-Tenant AI Usage Breakdown */}
      <div
        style={{
          backgroundColor: "var(--wa-card-bg)",
          border: "1px solid var(--wa-card-border)",
          borderRadius: 10,
          overflow: "hidden",
          boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
        }}
      >
        <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--wa-border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <h3 style={{ fontSize: "15px", fontWeight: "700", margin: 0 }}>
              Per-Tenant AI &amp; Voice Note Telemetry
            </h3>
            <p style={{ fontSize: "12px", color: "var(--wa-text-muted)", margin: "2px 0 0 0" }}>
              Breakdown of AI responses generated and audio notes transcribed per connection
            </p>
          </div>
          <span style={{ fontSize: "12px", color: "var(--wa-teal)", fontWeight: "600" }}>
            {aiData?.tenants?.length || 0} Registered Tenants
          </span>
        </div>

        {!aiData?.tenants || aiData.tenants.length === 0 ? (
          <div style={{ padding: "40px 20px", textAlign: "center", color: "var(--wa-text-secondary)", fontSize: "13px" }}>
            No tenant AI activity recorded yet.
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px", textAlign: "left" }}>
              <thead>
                <tr
                  style={{
                    backgroundColor: "var(--wa-header-bg)",
                    borderBottom: "1px solid var(--wa-border)",
                    color: "var(--wa-text-secondary)",
                    fontSize: "11px",
                    textTransform: "uppercase",
                    letterSpacing: "0.5px",
                  }}
                >
                  <th style={{ padding: "12px 18px", fontWeight: "600" }}>Tenant Code</th>
                  <th style={{ padding: "12px 18px", fontWeight: "600" }}>Owner Phone</th>
                  <th style={{ padding: "12px 18px", fontWeight: "600" }}>Assigned Model</th>
                  <th style={{ padding: "12px 18px", fontWeight: "600" }}>AI Replies Sent</th>
                  <th style={{ padding: "12px 18px", fontWeight: "600" }}>Total Messages</th>
                  <th style={{ padding: "12px 18px", fontWeight: "600" }}>Last Active</th>
                  <th style={{ padding: "12px 18px", fontWeight: "600", textAlign: "right" }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {aiData.tenants.map((t) => (
                  <tr key={t.hash} style={{ borderBottom: "1px solid var(--wa-border)" }}>
                    <td style={{ padding: "14px 18px", fontWeight: "700", fontFamily: "monospace", color: "var(--wa-teal)" }}>
                      {t.hash}
                    </td>
                    <td style={{ padding: "14px 18px", color: "var(--wa-text-primary)" }}>
                      {t.ownerPhone ? `+${t.ownerPhone.replace(/\D/g, "")}` : "Unassigned"}
                    </td>
                    <td style={{ padding: "14px 18px" }}>
                      <span style={{ padding: "3px 8px", borderRadius: 6, backgroundColor: "var(--wa-search-input)", border: "1px solid var(--wa-border)", fontSize: "11px", fontFamily: "monospace" }}>
                        {t.aiModel?.split("/").pop() || "default"}
                      </span>
                    </td>
                    <td style={{ padding: "14px 18px", fontWeight: "600", color: "var(--wa-teal)" }}>
                      {t.aiMessagesSent} AI turns
                    </td>
                    <td style={{ padding: "14px 18px", color: "var(--wa-text-secondary)" }}>
                      {t.totalMessages} total
                    </td>
                    <td style={{ padding: "14px 18px", color: "var(--wa-text-secondary)" }}>
                      {formatTimeAgo(t.lastActive)}
                    </td>
                    <td style={{ padding: "14px 18px", textAlign: "right" }}>
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 4,
                          padding: "3px 8px",
                          borderRadius: 10,
                          fontSize: "11px",
                          fontWeight: "600",
                          backgroundColor: t.status === "connected" ? "rgba(16, 185, 129, 0.12)" : "rgba(148, 163, 184, 0.12)",
                          color: t.status === "connected" ? "#10b981" : "#94a3b8",
                          textTransform: "capitalize",
                        }}
                      >
                        <span>●</span>
                        <span>{t.status}</span>
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
