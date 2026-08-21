"use client";

import React from "react";
import { ArrowLeftIcon, ArchiveBoxIcon, UnarchiveBoxIcon } from "../Icons/WhatsAppIcons";
import { Avatar } from "../Avatar/Avatar";
import { stripWhatsAppFormatting } from "../../../lib/formatter.js";

const AVATAR_COLORS = [
  "linear-gradient(135deg, #3b82f6, #1d4ed8)",
  "linear-gradient(135deg, #10b981, #047857)",
  "linear-gradient(135deg, #8b5cf6, #6d28d9)",
  "linear-gradient(135deg, #f59e0b, #b45309)",
  "linear-gradient(135deg, #ec4899, #be185d)",
  "linear-gradient(135deg, #06b6d4, #0e7490)",
];

function getAvatarColor(str = "") {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function formatTime(timestamp) {
  if (!timestamp) return "";
  const d = new Date(timestamp);
  const now = new Date();
  if (isNaN(d.getTime())) return "";
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

export function ArchivedList({
  archivedChats = [],
  selectedContact,
  onSelectContact,
  onUnarchiveChat,
  onBack,
  hash = "",
}) {
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
            borderRadius: "50%",
          }}
        >
          <ArrowLeftIcon size={18} color="currentColor" />
        </button>
        <div>
          <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: "var(--wa-text-primary)" }}>
            Archived
          </h2>
          <span style={{ fontSize: 12, color: "var(--wa-text-secondary)" }}>
            {archivedChats.length} {archivedChats.length === 1 ? "chat" : "chats"}
          </span>
        </div>
      </div>

      {/* Info notice bar */}
      <div
        style={{
          padding: "10px 16px",
          backgroundColor: "var(--wa-search-input)",
          borderBottom: "1px solid var(--wa-border)",
          fontSize: 12,
          color: "var(--wa-text-secondary)",
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        <ArchiveBoxIcon size={16} color="var(--wa-text-muted)" />
        <span>These chats stay archived when new messages are received.</span>
      </div>

      {/* List */}
      <div style={{ flex: 1, overflowY: "auto" }}>
        {archivedChats.length === 0 ? (
          <div style={{ padding: "48px 24px", textAlign: "center", color: "var(--wa-text-secondary)" }}>
            <div
              style={{
                width: 56,
                height: 56,
                borderRadius: "50%",
                backgroundColor: "var(--wa-search-input)",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                marginBottom: 16,
              }}
            >
              <ArchiveBoxIcon size={28} color="var(--wa-text-muted)" />
            </div>
            <h3 style={{ fontSize: 15, fontWeight: 600, margin: "0 0 6px 0", color: "var(--wa-text-primary)" }}>
              No archived chats
            </h3>
            <p style={{ fontSize: 13, margin: 0, color: "var(--wa-text-secondary)", lineHeight: 1.4 }}>
              Hover any chat in your main list and click the archive icon to move conversations here.
            </p>
          </div>
        ) : (
          archivedChats.map((item) => {
            const isSelected = selectedContact === item.jid || selectedContact === item.phone;
            const initial = (item.name || item.phone).slice(0, 2).toUpperCase();

            return (
              <div
                key={item.jid || item.phone}
                className={`wa-contact-item ${isSelected ? "selected" : ""}`}
                style={{
                  display: "flex",
                  alignItems: "center",
                  padding: "12px 16px",
                  gap: 12,
                  cursor: "pointer",
                  borderBottom: "1px solid var(--wa-border-light)",
                  backgroundColor: isSelected ? "var(--wa-selected-bg)" : "transparent",
                  transition: "background-color 0.15s ease",
                  position: "relative",
                }}
                onClick={() => onSelectContact(item.jid || item.phone, item.name)}
              >
                {/* Avatar Photo / Initials */}
                <Avatar
                  src={hash ? `/api/connections/${hash}/avatar?jid=${encodeURIComponent(item.jid || item.phone)}` : ""}
                  name={item.name}
                  initial={initial}
                  isGroup={item.isGroup}
                  size={44}
                />

                {/* Info */}
                <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 3 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span
                      style={{
                        fontSize: 15,
                        fontWeight: 600,
                        color: "var(--wa-text-primary)",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {item.name}
                    </span>
                    {item.lastMessageTime && (
                      <span style={{ fontSize: 11, color: "var(--wa-text-muted)" }}>
                        {formatTime(item.lastMessageTime)}
                      </span>
                    )}
                  </div>

                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                    <span
                      style={{
                        fontSize: 13,
                        color: "var(--wa-text-secondary)",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        flex: 1,
                      }}
                    >
                      {item.lastIsFromMe && "You: "}
                      {stripWhatsAppFormatting(item.lastMessage) || "No recent messages"}
                    </span>

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onUnarchiveChat(item.jid || item.phone);
                      }}
                      title="Unarchive Chat"
                      style={{
                        background: "var(--wa-btn-secondary-bg)",
                        border: "1px solid var(--wa-border)",
                        borderRadius: 6,
                        padding: "4px 8px",
                        color: "var(--wa-text-primary)",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        gap: 4,
                        fontSize: 11,
                        fontWeight: 600,
                      }}
                    >
                      <UnarchiveBoxIcon size={13} color="currentColor" />
                      <span>Unarchive</span>
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
