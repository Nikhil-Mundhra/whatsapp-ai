"use client";

import React from "react";
import { ArrowLeftIcon, StarIcon, RobotIcon } from "../Icons/WhatsAppIcons";

export function StarredView({ onBack, messages = [], onSelectContact }) {
  // Find messages sent by AI or marked important
  const aiMessages = messages.filter((m) => Boolean(m.isAi || m.is_ai));

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
            Starred &amp; AI History
          </h2>
          <span style={{ fontSize: 12, color: "var(--wa-text-secondary)" }}>
            Autonomous Message Log
          </span>
        </div>
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflowY: "auto", padding: "16px" }}>
        {aiMessages.length === 0 ? (
          <div style={{ padding: "48px 20px", textAlign: "center", color: "var(--wa-text-secondary)" }}>
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
              <StarIcon size={24} color="var(--wa-text-muted)" />
            </div>
            <h3 style={{ fontSize: 14, fontWeight: 600, color: "var(--wa-text-primary)", margin: "0 0 4px" }}>
              No AI Takeover Replies Yet
            </h3>
            <p style={{ fontSize: 12, margin: 0, color: "var(--wa-text-secondary)", lineHeight: 1.4 }}>
              When the AI companion answers chats on your behalf, replies will appear bookmarked here.
            </p>
          </div>
        ) : (
          aiMessages.map((m, idx) => (
            <div
              key={idx}
              onClick={() => onSelectContact(m.chatJid || m.recipient)}
              style={{
                padding: "12px 14px",
                borderRadius: 8,
                backgroundColor: "var(--wa-card-bg)",
                border: "1px solid var(--wa-bubble-ai-border)",
                marginBottom: 10,
                cursor: "pointer",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span
                    style={{
                      background: "rgba(0, 168, 132, 0.15)",
                      color: "var(--wa-teal)",
                      fontSize: 11,
                      fontWeight: 700,
                      padding: "2px 6px",
                      borderRadius: 4,
                      display: "flex",
                      alignItems: "center",
                      gap: 4,
                    }}
                  >
                    <RobotIcon size={12} color="var(--wa-teal)" />
                    <span>AI Takeover Reply</span>
                  </span>
                  <span style={{ fontSize: 12, fontWeight: 600, color: "var(--wa-text-primary)" }}>
                    To: {m.recipient || m.chatJid}
                  </span>
                </div>
                <span style={{ fontSize: 11, color: "var(--wa-text-muted)" }}>
                  {new Date(m.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </span>
              </div>
              <p style={{ fontSize: 13, margin: 0, color: "var(--wa-text-primary)", lineHeight: 1.4 }}>
                {m.content}
              </p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
