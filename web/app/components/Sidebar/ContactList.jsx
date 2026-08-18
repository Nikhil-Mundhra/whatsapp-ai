"use client";

import { RobotIcon } from "../Icons/WhatsAppIcons";

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
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

export function ContactList({
  contacts = [],
  selectedContact,
  onSelectContact,
  polls = [],
  messages = [],
  searchQuery = "",
  filterType = "all",
}) {
  // Compute metadata for each contact
  const contactItems = contacts.map((c) => {
    const contactPhone = typeof c === "string" ? c.trim() : c?.phone || "";
    const cleanPhone = contactPhone.replace(/\D/g, "");

    // Find pending polls for this contact
    const contactPolls = polls.filter((p) => {
      const pContact = (p.contact || "").replace(/\D/g, "");
      return pContact === cleanPhone || p.contact === contactPhone;
    });
    const pendingPolls = contactPolls.filter((p) => p.status === "pending");

    // Find messages for this contact
    const contactMessages = messages.filter((m) => {
      const sender = (m.sender || "").replace(/\D/g, "");
      const recipient = (m.recipient || "").replace(/\D/g, "");
      return sender === cleanPhone || recipient === cleanPhone;
    });

    const latestMessage = contactMessages[contactMessages.length - 1];
    const latestPoll = contactPolls[0];

    // Check latest activity timestamp
    const latestTime = Math.max(
      latestMessage?.timestamp ? new Date(latestMessage.timestamp).getTime() : 0,
      latestPoll?.createdAt ? new Date(latestPoll.createdAt).getTime() : 0
    );

    // Preview snippet
    let previewText = "No messages yet";
    if (pendingPolls.length > 0) {
      previewText = `📊 Take-over request: ${pendingPolls[0].question || "Approval needed"}`;
    } else if (latestMessage) {
      previewText = `${latestMessage.isFromMe ? "You: " : ""}${latestMessage.body || latestMessage.text || "Message"}`;
    }

    return {
      phone: contactPhone,
      cleanPhone,
      display: formatPhoneDisplay(contactPhone),
      pendingCount: pendingPolls.length,
      isAutonomyActive: false, // Can be enhanced with live grant countdown
      latestTime: latestTime || null,
      previewText,
    };
  });

  // Filter contacts
  const filtered = contactItems.filter((item) => {
    const matchesSearch =
      item.phone.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.display.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.previewText.toLowerCase().includes(searchQuery.toLowerCase());

    if (!matchesSearch) return false;

    if (filterType === "pending") return item.pendingCount > 0;
    if (filterType === "autonomy") return item.isAutonomyActive;
    return true;
  });

  if (contactItems.length === 0) {
    return (
      <div style={{ padding: "32px 20px", textAlign: "center", color: "#64748b" }}>
        <p style={{ fontSize: 14, margin: "0 0 8px", fontWeight: 600 }}>No Allowed Contacts</p>
        <p style={{ fontSize: 13, margin: 0, color: "#8696a0" }}>
          Add contact phone numbers to ALLOWED_RECIPIENTS in Settings to monitor their Take-Over chats.
        </p>
      </div>
    );
  }

  if (filtered.length === 0) {
    return (
      <div style={{ padding: "32px 20px", textAlign: "center", color: "#64748b" }}>
        <p style={{ fontSize: 14, margin: 0 }}>No contacts match "{searchQuery}"</p>
      </div>
    );
  }

  return (
    <div className="wa-contact-list">
      {filtered.map((item) => {
        const isSelected = selectedContact === item.phone;
        const initial = item.phone.slice(-2);

        return (
          <div
            key={item.phone}
            className={`wa-contact-item ${isSelected ? "selected" : ""}`}
            onClick={() => onSelectContact(item.phone)}
          >
            {/* Avatar */}
            <div
              className="wa-avatar"
              style={{ background: getAvatarColor(item.phone) }}
            >
              {initial}
            </div>

            {/* Info */}
            <div className="wa-contact-info">
              <div className="wa-contact-top">
                <span className="wa-contact-name">{item.display}</span>
                {item.latestTime && (
                  <span className="wa-contact-time">{formatTime(item.latestTime)}</span>
                )}
              </div>

              <div className="wa-contact-bottom">
                <span className="wa-contact-preview">{item.previewText}</span>

                {/* Badges */}
                {item.pendingCount > 0 ? (
                  <span className="wa-badge-pending" title={`${item.pendingCount} pending Take-Over requests`}>
                    {item.pendingCount}
                  </span>
                ) : item.isAutonomyActive ? (
                  <span className="wa-badge-unread" title="AI Take-Over Active">
                    <RobotIcon size={12} color="#ffffff" />
                  </span>
                ) : null}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
