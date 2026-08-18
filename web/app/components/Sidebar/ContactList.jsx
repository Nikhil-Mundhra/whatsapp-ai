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
}) {
  // Convert allowed recipients to a clean phone set
  const allowedSet = new Set(
    allowedRecipients.map((r) => String(r).replace(/\D/g, "")).filter(Boolean)
  );

  // Build unified items list
  // 1. From live SQLite / Bridge chats
  const chatMap = new Map();

  for (const c of chats) {
    const jid = c.jid || c.phone || "";
    const cleanPhone = (c.phone || jid.split("@")[0] || "").replace(/\D/g, "");
    const isAllowed = allowedSet.has(cleanPhone) || allowedRecipients.includes(jid);

    // Find pending polls for this chat
    const contactPolls = polls.filter((p) => {
      const pContact = (p.contact || "").replace(/\D/g, "");
      return pContact === cleanPhone || p.contact === jid || p.contact === cleanPhone;
    });
    const pendingPolls = contactPolls.filter((p) => p.status === "pending");

    chatMap.set(jid, {
      jid,
      phone: cleanPhone || jid,
      name: c.name || formatPhoneDisplay(cleanPhone),
      isAllowed,
      isGroup: Boolean(c.isGroup),
      lastMessage: c.lastMessage || "",
      lastMessageTime: c.lastMessageTime || null,
      lastIsFromMe: Boolean(c.lastIsFromMe),
      pendingCount: pendingPolls.length,
    });
  }

  // 2. Ensure any allowed recipients without chat entries are included
  for (const r of allowedRecipients) {
    const cleanPhone = String(r).replace(/\D/g, "");
    const jid = `${cleanPhone}@s.whatsapp.net`;
    if (!chatMap.has(jid) && !chatMap.has(cleanPhone)) {
      const contactPolls = polls.filter((p) => (p.contact || "").replace(/\D/g, "") === cleanPhone);
      const pendingPolls = contactPolls.filter((p) => p.status === "pending");

      chatMap.set(jid, {
        jid,
        phone: cleanPhone,
        name: formatPhoneDisplay(cleanPhone),
        isAllowed: true,
        isGroup: false,
        lastMessage: "Whitelisted for AI Take-Over",
        lastMessageTime: null,
        lastIsFromMe: false,
        pendingCount: pendingPolls.length,
      });
    }
  }

  const allItems = Array.from(chatMap.values()).sort((a, b) => {
    // Pending polls first, then by latest message time
    if (a.pendingCount > 0 && b.pendingCount === 0) return -1;
    if (b.pendingCount > 0 && a.pendingCount === 0) return 1;
    const timeA = a.lastMessageTime ? new Date(a.lastMessageTime).getTime() : 0;
    const timeB = b.lastMessageTime ? new Date(b.lastMessageTime).getTime() : 0;
    return timeB - timeA;
  });

  // Filter items
  const filtered = allItems.filter((item) => {
    const matchesSearch =
      item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.phone.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.lastMessage.toLowerCase().includes(searchQuery.toLowerCase());

    if (!matchesSearch) return false;

    if (filterType === "pending") return item.pendingCount > 0;
    if (filterType === "autonomy" || filterType === "whitelisted") return item.isAllowed;
    return true;
  });

  if (allItems.length === 0) {
    return (
      <div style={{ padding: "32px 20px", textAlign: "center", color: "#64748b" }}>
        <p style={{ fontSize: 14, margin: "0 0 8px", fontWeight: 600 }}>No Chats Found</p>
        <p style={{ fontSize: 13, margin: 0, color: "#8696a0" }}>
          Connect WhatsApp to start syncing your live chats and messages.
        </p>
      </div>
    );
  }

  if (filtered.length === 0) {
    return (
      <div style={{ padding: "32px 20px", textAlign: "center", color: "#64748b" }}>
        <p style={{ fontSize: 14, margin: 0 }}>No chats match "{searchQuery}"</p>
      </div>
    );
  }

  return (
    <div className="wa-contact-list">
      {filtered.map((item) => {
        const isSelected = selectedContact === item.jid || selectedContact === item.phone;
        const initial = (item.name || item.phone).slice(0, 2).toUpperCase();

        return (
          <div
            key={item.jid || item.phone}
            className={`wa-contact-item ${isSelected ? "selected" : ""}`}
            onClick={() => onSelectContact(item.jid || item.phone, item.name)}
          >
            {/* Avatar */}
            <div
              className="wa-avatar"
              style={{ background: getAvatarColor(item.name || item.phone) }}
            >
              {initial}
            </div>

            {/* Info */}
            <div className="wa-contact-info">
              <div className="wa-contact-top">
                <span className="wa-contact-name" title={item.name}>
                  {item.name}
                </span>
                {item.lastMessageTime && (
                  <span className="wa-contact-time">{formatTime(item.lastMessageTime)}</span>
                )}
              </div>

              <div className="wa-contact-bottom">
                <span className="wa-contact-preview">
                  {item.lastIsFromMe && "You: "}
                  {item.lastMessage || (item.isAllowed ? "AI Whitelisted" : "")}
                </span>

                {/* Badges */}
                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  {item.isAllowed && (
                    <span
                      style={{
                        background: "#dcf8c6",
                        color: "#075e54",
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
                    <span className="wa-badge-pending" title={`${item.pendingCount} pending Take-Over requests`}>
                      {item.pendingCount}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
