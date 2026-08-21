"use client";

import React from "react";
import { ArrowLeftIcon, StatusRingIcon, RobotIcon, CheckIcon } from "../Icons/WhatsAppIcons";

export function StatusView({ onBack, connInfo, hash = "" }) {
  const isLinked = connInfo?.connection?.status === "linked";
  const ownerPhone = connInfo?.connection?.ownerPhone || "Unassigned";
  const aiModel = connInfo?.connection?.aiModel || "qwen/qwen3.8-27b";

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
            Status &amp; System Health
          </h2>
          <span style={{ fontSize: 12, color: "var(--wa-text-secondary)" }}>
            Live Bridge Socket &amp; State
          </span>
        </div>
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflowY: "auto", padding: "20px 16px" }}>
        {/* Connection status badge card */}
        <div
          style={{
            padding: "16px",
            borderRadius: 10,
            backgroundColor: "var(--wa-card-bg)",
            border: "1px solid var(--wa-border)",
            marginBottom: 16,
            display: "flex",
            alignItems: "center",
            gap: 14,
          }}
        >
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: "50%",
              backgroundColor: isLinked ? "rgba(16, 185, 129, 0.15)" : "rgba(245, 158, 11, 0.15)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <StatusRingIcon size={26} color={isLinked ? "#10b981" : "#f59e0b"} />
          </div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: "var(--wa-text-primary)" }}>
              {isLinked ? "WhatsApp Bridge Connected" : "Connecting Socket..."}
            </div>
            <div style={{ fontSize: 12, color: isLinked ? "#10b981" : "#f59e0b", marginTop: 2, fontWeight: 600 }}>
              {isLinked ? "Online • Ready for Takeover" : "Pairing in progress"}
            </div>
          </div>
        </div>

        {/* Telemetry items */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ padding: "12px 14px", borderRadius: 8, backgroundColor: "var(--wa-search-input)", border: "1px solid var(--wa-border)" }}>
            <div style={{ fontSize: 11, color: "var(--wa-text-muted)", textTransform: "uppercase", fontWeight: 700 }}>
              Connection Hash
            </div>
            <div style={{ fontSize: 14, fontWeight: 700, fontFamily: "monospace", color: "var(--wa-teal)", marginTop: 2 }}>
              #{hash}
            </div>
          </div>

          <div style={{ padding: "12px 14px", borderRadius: 8, backgroundColor: "var(--wa-search-input)", border: "1px solid var(--wa-border)" }}>
            <div style={{ fontSize: 11, color: "var(--wa-text-muted)", textTransform: "uppercase", fontWeight: 700 }}>
              Owner Phone Number
            </div>
            <div style={{ fontSize: 14, fontWeight: 600, color: "var(--wa-text-primary)", marginTop: 2 }}>
              {ownerPhone}
            </div>
          </div>

          <div style={{ padding: "12px 14px", borderRadius: 8, backgroundColor: "var(--wa-search-input)", border: "1px solid var(--wa-border)" }}>
            <div style={{ fontSize: 11, color: "var(--wa-text-muted)", textTransform: "uppercase", fontWeight: 700 }}>
              AI Model Backend
            </div>
            <div style={{ fontSize: 14, fontWeight: 600, fontFamily: "monospace", color: "var(--wa-text-primary)", marginTop: 2 }}>
              {aiModel}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
