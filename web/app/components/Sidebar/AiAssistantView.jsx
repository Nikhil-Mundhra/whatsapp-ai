"use client";

import React from "react";
import { ArrowLeftIcon, MetaAiIcon, RobotIcon, SettingsIcon, CheckIcon } from "../Icons/WhatsAppIcons";

export function AiAssistantView({
  onBack,
  connInfo,
  onOpenSettings,
  activeGrants = {},
  polls = [],
}) {
  const allowedRecipients = Array.isArray(connInfo?.connection?.allowedRecipients)
    ? connInfo.connection.allowedRecipients
    : typeof connInfo?.connection?.allowedRecipients === "string"
    ? connInfo.connection.allowedRecipients.split(",").map((s) => s.trim()).filter(Boolean)
    : [];

  const aiModel = connInfo?.connection?.aiModel || "qwen/qwen3.8-27b";
  const pendingPolls = polls.filter((p) => p.status === "pending");

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
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <MetaAiIcon size={24} />
          <div>
            <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: "var(--wa-text-primary)" }}>
              WhatsApp AI Take-Over
            </h2>
            <span style={{ fontSize: 12, color: "var(--wa-text-secondary)" }}>
              Autonomous Texting Engine
            </span>
          </div>
        </div>
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflowY: "auto", padding: "16px" }}>
        {/* Active AI Agent Status Card */}
        <div
          style={{
            padding: "16px",
            borderRadius: 10,
            backgroundColor: "var(--wa-card-bg)",
            border: "1px solid var(--wa-card-border)",
            marginBottom: 16,
            boxShadow: "0 2px 8px rgba(0, 168, 132, 0.08)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: "var(--wa-text-primary)" }}>
              Active AI Model
            </span>
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                fontFamily: "monospace",
                padding: "3px 8px",
                borderRadius: 6,
                backgroundColor: "rgba(0, 168, 132, 0.12)",
                color: "var(--wa-teal)",
              }}
            >
              {aiModel}
            </span>
          </div>

          <div style={{ fontSize: 13, color: "var(--wa-text-secondary)", lineHeight: 1.4, marginBottom: 14 }}>
            The AI agent automatically generates contextual replies and dispatches permission polls for sensitive queries.
          </div>

          <button
            onClick={onOpenSettings}
            style={{
              width: "100%",
              padding: "10px",
              borderRadius: 8,
              backgroundColor: "var(--wa-btn-secondary-bg)",
              border: "1px solid var(--wa-btn-secondary-border)",
              color: "var(--wa-btn-secondary-text)",
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
            }}
          >
            <SettingsIcon size={16} color="currentColor" />
            <span>Configure AI API Keys &amp; Prompts</span>
          </button>
        </div>

        {/* Allowed Whitelist Recipients */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", color: "var(--wa-text-muted)", marginBottom: 8, letterSpacing: 0.5 }}>
            Whitelisted Contacts ({allowedRecipients.length})
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {allowedRecipients.length > 0 ? (
              allowedRecipients.map((r, i) => {
                const clean = String(r).replace(/\D/g, "");
                return (
                  <span
                    key={i}
                    style={{
                      padding: "4px 8px",
                      borderRadius: 6,
                      backgroundColor: "var(--wa-search-input)",
                      border: "1px solid var(--wa-border)",
                      fontSize: 12,
                      fontFamily: clean ? "monospace" : "inherit",
                      color: "var(--wa-text-primary)",
                      fontWeight: 500,
                    }}
                  >
                    {clean ? `+${clean}` : String(r)}
                  </span>
                );
              })
            ) : (
              <span style={{ fontSize: 12, color: "var(--wa-text-muted)" }}>
                No contacts whitelisted yet. Open Settings to add recipients.
              </span>
            )}
          </div>
        </div>

        {/* Pending Permission Polls */}
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", color: "var(--wa-text-muted)", marginBottom: 8, letterSpacing: 0.5 }}>
            Pending Take-Over Polls ({pendingPolls.length})
          </div>
          {pendingPolls.length === 0 ? (
            <div style={{ padding: "12px", borderRadius: 8, backgroundColor: "var(--wa-search-input)", border: "1px solid var(--wa-border)", fontSize: 12, color: "var(--wa-text-secondary)", display: "flex", alignItems: "center", gap: 6 }}>
              <CheckIcon size={14} color="#10b981" />
              <span>All take-over permission requests are resolved.</span>
            </div>
          ) : (
            pendingPolls.map((poll) => (
              <div
                key={poll.id}
                style={{
                  padding: "10px 12px",
                  borderRadius: 8,
                  backgroundColor: "rgba(239, 68, 68, 0.08)",
                  border: "1px solid rgba(239, 68, 68, 0.2)",
                  marginBottom: 8,
                }}
              >
                <div style={{ fontSize: 12, fontWeight: 700, color: "#ef4444" }}>
                  {poll.contactDisplay || poll.contact}
                </div>
                <div style={{ fontSize: 12, color: "var(--wa-text-primary)", marginTop: 2 }}>
                  {poll.question}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
