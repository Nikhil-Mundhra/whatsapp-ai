"use client";

import React from "react";
import { ArrowLeftIcon, PhoneCallIcon, MicIcon } from "../Icons/WhatsAppIcons";

export function CallsView({ onBack, messages = [], onSelectContact }) {
  // Extract voice notes and audio messages from history
  const voiceMessages = messages.filter((m) =>
    (m.content && m.content.toLowerCase().includes("voice note")) ||
    (m.content && m.content.toLowerCase().includes("ptt")) ||
    (m.content && m.content.toLowerCase().includes("transcription"))
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", backgroundColor: "var(--wa-panel-bg)" }}>
      {/* Header */}
      <div
        style={{
          height: 60,
          backgroundColor: "var(--wa-header-bg)",
          padding: "10px 16px",
          display: "flex",
          alignItems: "center",
          gap: 16,
          borderBottom: "1px solid var(--wa-border)",
          flexShrink: 0,
        }}
      >
        <button
          onClick={onBack}
          title="Back to Chats"
          style={{
            background: "none",
            border: "none",
            color: "var(--wa-icon-color)",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 6,
          }}
        >
          <ArrowLeftIcon size={18} color="currentColor" />
        </button>
        <div>
          <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: "var(--wa-text-primary)" }}>
            Calls &amp; Audio Notes
          </h2>
          <span style={{ fontSize: 12, color: "var(--wa-text-secondary)" }}>
            Groq Whisper Transcribed Logs
          </span>
        </div>
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflowY: "auto", padding: "16px" }}>
        <div
          style={{
            padding: "12px 14px",
            borderRadius: 8,
            backgroundColor: "rgba(0, 168, 132, 0.1)",
            border: "1px solid rgba(0, 168, 132, 0.2)",
            marginBottom: 16,
            display: "flex",
            alignItems: "center",
            gap: 10,
          }}
        >
          <MicIcon size={20} color="var(--wa-teal)" />
          <div style={{ fontSize: 12, color: "var(--wa-text-primary)" }}>
            Incoming WhatsApp voice notes are transcribed in real-time via <strong>Groq Whisper Large-v3-Turbo</strong>.
          </div>
        </div>

        {voiceMessages.length === 0 ? (
          <div style={{ padding: "40px 20px", textAlign: "center", color: "var(--wa-text-secondary)" }}>
            <div
              style={{
                width: 52,
                height: 52,
                borderRadius: "50%",
                backgroundColor: "var(--wa-search-input)",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                marginBottom: 12,
              }}
            >
              <PhoneCallIcon size={24} color="var(--wa-text-muted)" />
            </div>
            <h3 style={{ fontSize: 14, fontWeight: 600, color: "var(--wa-text-primary)", margin: "0 0 4px" }}>
              No Voice Notes Logged
            </h3>
            <p style={{ fontSize: 12, margin: 0, color: "var(--wa-text-secondary)" }}>
              Audio notes received in WhatsApp chats will show their transcriptions and timestamps here.
            </p>
          </div>
        ) : (
          voiceMessages.map((vm, idx) => (
            <div
              key={idx}
              onClick={() => onSelectContact(vm.chatJid || vm.sender)}
              style={{
                padding: "12px",
                borderRadius: 8,
                backgroundColor: "var(--wa-card-bg)",
                border: "1px solid var(--wa-border)",
                marginBottom: 10,
                cursor: "pointer",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: "var(--wa-teal)" }}>
                  {vm.senderName || vm.sender || "Audio Note"}
                </span>
                <span style={{ fontSize: 11, color: "var(--wa-text-muted)" }}>
                  {new Date(vm.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </span>
              </div>
              <p style={{ fontSize: 12, margin: 0, color: "var(--wa-text-primary)" }}>
                {vm.content}
              </p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
