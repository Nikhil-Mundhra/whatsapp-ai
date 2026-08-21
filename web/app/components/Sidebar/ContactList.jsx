"use client";

import React, { useState } from "react";
import {
  RobotIcon,
  ArchiveBoxIcon,
  DoubleCheckIcon,
  UsersIcon,
} from "../Icons/WhatsAppIcons";
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

function formatPhoneDisplay(num = "") {
  const clean = num.replace(/\D/g, "");
  if (clean.length === 12 && clean.startsWith("91")) {
    return `+91 ${clean.slice(2, 7)} ${clean.slice(7)}`;
  }
  if (clean.length === 11 && clean.startsWith("1")) {
    return `+1 (${clean.slice(1, 4)}) ${clean.slice(4, 7)}-${clean.slice(7)}`;
  }
  if (clean.length === 10) {
    return `(${clean.slice(0, 3)}) ${clean.slice(3, 6)}-${clean.slice(6)}`;
  }
  return num;
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

export function ContactList({
  chats = [],
  allowedRecipients = [],
  selectedContact,
  onSelectContact,
  polls = [],
  messages = [],
  searchQuery = "",
  filterType = "all",
  archivedIds = [],
  onArchiveChat,
  onOpenArchived,
  hash = "",
}) {
  const [hoveredChat, setHoveredChat] = useState(null);

  // Convert allowed recipients to a clean phone set
  const allowedSet = new Set(
    allowedRecipients.map((r) => String(r).replace(/\D/g, "")).filter(Boolean)
  );

  const archivedSet = new Set(archivedIds);

  // Build unified items list
  const chatMap = new Map();

  function findExistingChatKey(jid, cleanPhone, name, isGroup) {
    if (chatMap.has(jid)) return jid;
    if (isGroup) return null;
    for (const [k, v] of chatMap.entries()) {
      if (v.isGroup) continue;
      if (cleanPhone && v.phone === cleanPhone) return k;
      if (cleanPhone && v.aliases && v.aliases.includes(cleanPhone)) return k;
      if (jid && v.aliases && v.aliases.includes(jid)) return k;
    }
    return null;
  }

  for (const c of chats) {
    const jid = c.jid || c.phone || "";
    const cleanPhone = (c.phone || jid.split("@")[0] || "").replace(/\D/g, "");
    const isAllowed = allowedSet.has(cleanPhone) || allowedRecipients.includes(jid);
    const isGroup = Boolean(c.isGroup || jid.endsWith("@g.us"));
    const name = c.name || formatPhoneDisplay(cleanPhone);

    // Find pending polls for this chat
    const contactPolls = polls.filter((p) => {
      const pContact = (p.contact || "").replace(/\D/g, "");
      return pContact === cleanPhone || p.contact === jid || (p.contact && p.contact.includes(cleanPhone));
    });
    const pendingPolls = contactPolls.filter((p) => p.status === "pending");

    const existingKey = findExistingChatKey(jid, cleanPhone, name, isGroup);

    if (!existingKey) {
      chatMap.set(jid, {
        jid,
        phone: cleanPhone || jid,
        name,
        isAllowed,
        isGroup,
        lastMessage: c.lastMessage || "",
        lastMessageTime: c.lastMessageTime || null,
        lastIsFromMe: Boolean(c.lastIsFromMe),
        pendingCount: pendingPolls.length,
        aliases: [jid, cleanPhone, c.phone].filter(Boolean),
        isArchived: archivedSet.has(jid) || (cleanPhone && archivedSet.has(cleanPhone)),
      });
    } else {
      const existing = chatMap.get(existingKey);
      const existingTime = existing.lastMessageTime ? new Date(existing.lastMessageTime).getTime() : 0;
      const newTime = c.lastMessageTime ? new Date(c.lastMessageTime).getTime() : 0;
      const isNewer = newTime > existingTime;

      existing.aliases = Array.from(
        new Set([...(existing.aliases || []), jid, cleanPhone, c.phone].filter(Boolean))
      );
      if (isAllowed) existing.isAllowed = true;
      if (name && !name.match(/^\+?\d+$/)) existing.name = name;
      if (isNewer) {
        existing.lastMessage = c.lastMessage || "";
        existing.lastMessageTime = c.lastMessageTime || null;
        existing.lastIsFromMe = Boolean(c.lastIsFromMe);
      }
      if (jid.endsWith("@s.whatsapp.net")) {
        existing.jid = jid;
        existing.phone = cleanPhone || existing.phone;
      }
      existing.pendingCount = (existing.pendingCount || 0) + pendingPolls.length;
      if (archivedSet.has(jid) || (cleanPhone && archivedSet.has(cleanPhone))) {
        existing.isArchived = true;
      }
    }
  }

  // Ensure any allowed recipients without chat entries are included
  for (const r of allowedRecipients) {
    const cleanPhone = String(r).replace(/\D/g, "");
    const jid = cleanPhone ? `${cleanPhone}@s.whatsapp.net` : String(r);
    const existingKey = findExistingChatKey(jid, cleanPhone, "", false);

    if (!existingKey) {
      const contactPolls = polls.filter((p) => (p.contact || "").replace(/\D/g, "") === cleanPhone);
      const pendingPolls = contactPolls.filter((p) => p.status === "pending");

      chatMap.set(jid, {
        jid,
        phone: cleanPhone || jid,
        name: formatPhoneDisplay(cleanPhone || jid),
        isAllowed: true,
        isGroup: false,
        lastMessage: "Whitelisted for AI Take-Over",
        lastMessageTime: null,
        lastIsFromMe: false,
        pendingCount: pendingPolls.length,
        aliases: [jid, cleanPhone, String(r)].filter(Boolean),
        isArchived: archivedSet.has(jid) || (cleanPhone && archivedSet.has(cleanPhone)),
      });
    } else {
      const existing = chatMap.get(existingKey);
      existing.isAllowed = true;
      existing.aliases = Array.from(
        new Set([...(existing.aliases || []), jid, cleanPhone, String(r)].filter(Boolean))
      );
      if (archivedSet.has(jid) || (cleanPhone && archivedSet.has(cleanPhone))) {
        existing.isArchived = true;
      }
    }
  }

  const allItems = Array.from(chatMap.values()).sort((a, b) => {
    if (a.pendingCount > 0 && b.pendingCount === 0) return -1;
    if (b.pendingCount > 0 && a.pendingCount === 0) return 1;
    const timeA = a.lastMessageTime ? new Date(a.lastMessageTime).getTime() : 0;
    const timeB = b.lastMessageTime ? new Date(b.lastMessageTime).getTime() : 0;
    return timeB - timeA;
  });

  // Separate non-archived from archived
  const nonArchivedItems = allItems.filter((item) => !item.isArchived);
  const archivedCount = allItems.filter((item) => item.isArchived).length;

  // Filter items
  const filtered = nonArchivedItems.filter((item) => {
    const matchesSearch =
      item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.phone.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.lastMessage.toLowerCase().includes(searchQuery.toLowerCase());

    if (!matchesSearch) return false;

    if (filterType === "unread") {
      return item.pendingCount > 0 || (!item.lastIsFromMe && item.lastMessageTime);
    }
    if (filterType === "favourites") {
      return item.isAllowed;
    }
    if (filterType === "groups") {
      return item.isGroup;
    }
    return true;
  });

  return (
    <div className="wa-contact-list" style={{ flex: 1, overflowY: "auto", backgroundColor: "var(--wa-panel-bg)" }}>
      {/* 1. Archived Banner Row at Top (like WhatsApp Web) */}
      {archivedCount > 0 && !searchQuery && (
        <div
          onClick={onOpenArchived}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "14px 18px",
            borderBottom: "1px solid var(--wa-border-light)",
            backgroundColor: "var(--wa-panel-bg)",
            cursor: "pointer",
            transition: "background-color 0.15s ease",
          }}
          className="wa-archived-banner"
        >
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: "50%",
                backgroundColor: "var(--wa-search-input)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "var(--wa-icon-color)",
              }}
            >
              <ArchiveBoxIcon size={18} color="var(--wa-icon-color)" />
            </div>
            <span style={{ fontSize: 15, fontWeight: 600, color: "var(--wa-text-primary)" }}>
              Archived
            </span>
          </div>

          <span
            style={{
              fontSize: 12,
              fontWeight: 700,
              color: "var(--wa-teal)",
              padding: "2px 8px",
              borderRadius: 10,
              backgroundColor: "rgba(0, 168, 132, 0.12)",
            }}
          >
            {archivedCount}
          </span>
        </div>
      )}

      {/* 2. Empty states */}
      {allItems.length === 0 ? (
        <div style={{ padding: "32px 20px", textAlign: "center", color: "var(--wa-text-secondary)" }}>
          <p style={{ fontSize: 14, margin: "0 0 8px", fontWeight: 600 }}>No Chats Found</p>
          <p style={{ fontSize: 13, margin: 0, color: "var(--wa-text-muted)" }}>
            Connect WhatsApp to start syncing your live chats and messages.
          </p>
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ padding: "32px 20px", textAlign: "center", color: "var(--wa-text-secondary)" }}>
          <p style={{ fontSize: 14, margin: 0 }}>
            {searchQuery ? `No chats match "${searchQuery}"` : "No chats in this category"}
          </p>
        </div>
      ) : (
        /* 3. Render Non-Archived Chats */
        filtered.map((item) => {
          const isSelected = selectedContact === item.jid || selectedContact === item.phone;
          const initial = (item.name || item.phone).slice(0, 2).toUpperCase();
          const isHovered = hoveredChat === (item.jid || item.phone);

          return (
            <div
              key={item.jid || item.phone}
              className={`wa-contact-item ${isSelected ? "selected" : ""}`}
              onMouseEnter={() => setHoveredChat(item.jid || item.phone)}
              onMouseLeave={() => setHoveredChat(null)}
              onClick={() => onSelectContact(item.jid || item.phone, item.name)}
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
                    title={item.name}
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
                      display: "flex",
                      alignItems: "center",
                      gap: 4,
                    }}
                  >
                    {item.lastIsFromMe && <DoubleCheckIcon size={14} isRead={true} />}
                    <span>{stripWhatsAppFormatting(item.lastMessage) || (item.isAllowed ? "AI Whitelisted" : "")}</span>
                  </span>

                  {/* Badges & Archive Hover Action */}
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    {isHovered ? (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onArchiveChat(item.jid || item.phone);
                        }}
                        title="Archive Chat"
                        style={{
                          background: "var(--wa-search-input)",
                          border: "1px solid var(--wa-border)",
                          borderRadius: 6,
                          padding: "3px 6px",
                          color: "var(--wa-icon-color)",
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          gap: 3,
                          fontSize: 11,
                          fontWeight: 600,
                        }}
                      >
                        <ArchiveBoxIcon size={12} color="currentColor" />
                        <span>Archive</span>
                      </button>
                    ) : (
                      <>
                        {item.isAllowed && (
                          <span
                            style={{
                              background: "rgba(0, 168, 132, 0.15)",
                              color: "var(--wa-teal)",
                              fontSize: 10,
                              fontWeight: 700,
                              padding: "1px 5px",
                              borderRadius: 4,
                            }}
                            title="Whitelisted for AI take-over"
                          >
                            AI
                          </span>
                        )}

                        {item.pendingCount > 0 && (
                          <span
                            style={{
                              backgroundColor: "#ef4444",
                              color: "#ffffff",
                              fontSize: 10,
                              fontWeight: 700,
                              height: 18,
                              minWidth: 18,
                              padding: "0 5px",
                              borderRadius: 9,
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                            }}
                            title={`${item.pendingCount} pending Take-Over requests`}
                          >
                            {item.pendingCount}
                          </span>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
