"use client";

import { RobotIcon, MoreVertIcon } from "../Icons/WhatsAppIcons";

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
  isAutonomyActive = false,
  isWhitelisted = false,
  onQuickGrant,
  onRevoke,
  actionLoading = false,
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
            ) : isAutonomyActive ? (
              <>
                <span className="wa-status-dot green" />
                <span style={{ color: "#16a34a", fontWeight: 600 }}>
                  AI Autonomy Active
                </span>
              </>
            ) : isWhitelisted ? (
              <>
                <span className="wa-status-dot green" />
                <span>AI Whitelisted (Idle)</span>
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

      {/* Quick Action Controls */}
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        {isAutonomyActive ? (
          <button
            onClick={onRevoke}
            disabled={actionLoading}
            style={{
              background: "#fee2e2",
              border: "1px solid #fca5a5",
              color: "#b91c1c",
              padding: "6px 12px",
              borderRadius: 6,
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 4,
            }}
          >
            <span>🛑 Revoke AI</span>
          </button>
        ) : (
          <button
            onClick={() => onQuickGrant?.("5 minutes")}
            disabled={actionLoading}
            style={{
              background: "#ecfdf5",
              border: "1px solid #6ee7b7",
              color: "#047857",
              padding: "6px 12px",
              borderRadius: 6,
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 4,
              transition: "all 0.15s ease",
            }}
            title="Grant AI 5-minute autonomous reply window"
          >
            <RobotIcon size={14} color="#047857" />
            <span>⚡ Grant 5m AI</span>
          </button>
        )}

        <button className="wa-icon-btn" title="More options">
          <MoreVertIcon size={18} />
        </button>
      </div>
    </div>
  );
}
