"use client";

import { SearchIcon, MoreVertIcon } from "../Icons/WhatsAppIcons";

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

export function ChatHeader({
  contact,
  contactName,
  pendingCount = 0,
  isWhitelisted = false,
}) {
  const displayName = contactName || formatPhoneDisplay(contact);
  const initial = displayName ? displayName.slice(0, 2).toUpperCase() : "";

  return (
    <div className="wa-chat-header">
      {/* Contact Info */}
      <div className="wa-chat-header-info">
        <div className="wa-avatar" style={{ background: "linear-gradient(135deg, #008069, #00a884)" }}>
          {initial}
        </div>
        <div>
          <div className="wa-chat-contact-title">{displayName}</div>
          <div className="wa-chat-contact-subtitle">
            {pendingCount > 0 ? (
              <>
                <span className="wa-status-dot yellow" />
                <span style={{ color: "#d97706", fontWeight: 600 }}>
                  {pendingCount} Take-Over request awaiting approval
                </span>
              </>
            ) : isWhitelisted ? (
              <>
                <span className="wa-status-dot green" />
                <span>AI Whitelisted (Active)</span>
              </>
            ) : (
              <>
                <span className="wa-status-dot grey" />
                <span>WhatsApp Contact</span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Header Actions */}
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <button className="wa-icon-btn" title="Search in chat">
          <SearchIcon size={18} color="var(--wa-icon-color)" />
        </button>
        <button className="wa-icon-btn" title="Menu">
          <MoreVertIcon size={18} color="var(--wa-icon-color)" />
        </button>
      </div>
    </div>
  );
}
