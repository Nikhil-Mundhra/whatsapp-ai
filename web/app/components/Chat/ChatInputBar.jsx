"use client";

import { useState } from "react";
import { AttachIcon, SmileIcon, SendIcon, PollIcon } from "../Icons/WhatsAppIcons";

export function ChatInputBar({
  contact,
  onSendManual,
  onRequestPoll,
  loading = false,
}) {
  const [inputText, setInputText] = useState("");

  function handleSubmit(e) {
    e.preventDefault();
    const text = inputText.trim();
    if (!text || loading) return;
    onSendManual?.(text);
    setInputText("");
  }

  return (
    <form className="wa-chat-input-bar" onSubmit={handleSubmit}>
      <button type="button" className="wa-icon-btn" title="Emojis">
        <SmileIcon size={22} />
      </button>

      <button type="button" className="wa-icon-btn" title="Attach file or media">
        <AttachIcon size={20} />
      </button>

      {/* Input Field */}
      <input
        type="text"
        className="wa-chat-input-field"
        placeholder="Type a message..."
        value={inputText}
        onChange={(e) => setInputText(e.target.value)}
        disabled={loading}
      />

      {/* Take-Over Poll Trigger Button */}
      <button
        type="button"
        onClick={() => onRequestPoll?.()}
        style={{
          background: "#f0f2f5",
          border: "1px solid #d1d7db",
          borderRadius: 8,
          padding: "0 10px",
          height: 38,
          fontSize: 12,
          fontWeight: 600,
          color: "#008069",
          display: "flex",
          alignItems: "center",
          gap: 5,
          cursor: "pointer",
          whiteSpace: "nowrap",
          transition: "all 0.15s ease",
        }}
        title="Create a Take-Over Poll for this conversation"
      >
        <PollIcon size={16} color="#008069" />
        <span>Take-Over Poll</span>
      </button>

      {/* Send Button */}
      <button
        type="submit"
        className="wa-send-btn"
        disabled={!inputText.trim() || loading}
        title="Send message"
      >
        <SendIcon size={16} />
      </button>
    </form>
  );
}
