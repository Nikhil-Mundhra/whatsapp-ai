"use client";

import { DoubleCheckIcon, RobotIcon, ImageIcon } from "../Icons/WhatsAppIcons";
import { FormattedMessage } from "./FormattedMessage";

function formatTime(timestamp) {
  if (!timestamp) return "";
  const d = new Date(timestamp);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function MessageBubble({ message }) {
  const isOutgoing = Boolean(message.isFromMe || message.is_from_me || message.fromMe || message.direction === "outbound");
  const isAi = Boolean(message.isAi || message.aiGenerated || message.sender === "ai" || message.origin === "ai" || message.origin === "takeover");
  const text = message.content || message.body || message.text || message.message || "";
  const time = formatTime(message.timestamp || message.createdAt || message.time);
  const imageUrls = Array.isArray(message.imageUrls) ? message.imageUrls : [];

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

        {/* Attached Images (UI-only, not sent to AI) */}
        {imageUrls.length > 0 && (
          <div className="wa-bubble-images">
            {imageUrls.map((url, i) => (
              <a key={i} href={url} target="_blank" rel="noopener noreferrer" className="wa-bubble-image-link">
                <img src={url} alt={`attachment-${i + 1}`} className="wa-bubble-image" />
              </a>
            ))}
            <div className="wa-bubble-image-note">
              <ImageIcon size={12} color="currentColor" />
              <span>Not visible to AI</span>
            </div>
          </div>
        )}

        {/* Message Text with WhatsApp Formatting */}
        {text ? <FormattedMessage text={text} /> : null}

        {/* Timestamp & Status Metadata */}
        <div className="wa-bubble-meta">
          <span>{time}</span>
          {isOutgoing && <DoubleCheckIcon isRead={true} size={15} />}
        </div>
      </div>
    </div>
  );
}
