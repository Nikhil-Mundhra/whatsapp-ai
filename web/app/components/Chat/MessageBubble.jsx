"use client";

import { DoubleCheckIcon, RobotIcon } from "../Icons/WhatsAppIcons";

function formatTime(timestamp) {
  if (!timestamp) return "";
  const d = new Date(timestamp);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function MessageBubble({ message }) {
  const isOutgoing = message.isFromMe || message.fromMe || message.direction === "outbound";
  const isAi = message.isAi || message.aiGenerated || message.sender === "ai";
  const text = message.body || message.text || message.message || "";
  const time = formatTime(message.timestamp || message.createdAt);

  return (
    <div className={`wa-bubble-wrapper ${isOutgoing ? "outgoing" : "incoming"}`}>
      <div
        className={`wa-bubble ${isOutgoing ? "outgoing" : "incoming"} ${
          isAi ? "ai-generated" : ""
        }`}
      >
        {/* SVG Bubble Tail Notch */}
        {isOutgoing ? (
          <svg className="wa-bubble-tail-out" viewBox="0 0 8 13">
            <path d="M0 0 C3 2, 6 6, 8 13 L0 13 Z" />
          </svg>
        ) : (
          <svg className="wa-bubble-tail-in" viewBox="0 0 8 13">
            <path d="M8 0 C5 2, 2 6, 0 13 L8 13 Z" />
          </svg>
        )}

        {/* AI Generator Tag */}
        {isAi && (
          <div className="wa-ai-tag">
            <RobotIcon size={11} color="#075e54" />
            <span>AI Persona Reply</span>
          </div>
        )}

        {/* Message Text */}
        <span style={{ whiteSpace: "pre-wrap" }}>{text}</span>

        {/* Timestamp & Status Metadata */}
        <div className="wa-bubble-meta">
          <span>{time}</span>
          {isOutgoing && <DoubleCheckIcon isRead={true} size={15} />}
        </div>
      </div>
    </div>
  );
}
