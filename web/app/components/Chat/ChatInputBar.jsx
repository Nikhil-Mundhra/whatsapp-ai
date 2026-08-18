"use client";

import { useState } from "react";
import { AttachIcon, SmileIcon, SendIcon, RobotIcon } from "../Icons/WhatsAppIcons";

export function ChatInputBar({
  contact,
  onSendManual,
  onTriggerDraft,
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
        placeholder="Type a message or draft an AI reply..."
        value={inputText}
        onChange={(e) => setInputText(e.target.value)}
        disabled={loading}
      />

      {/* AI Quick Draft Trigger */}
      <button
        type="button"
        onClick={() => onTriggerDraft?.()}
        style={{
          background: "#ecfdf5",
          border: "1px solid #a7f3d0",
          borderRadius: 8,
          padding: "0 10px",
          height: 38,
          fontSize: 12,
          fontWeight: 600,
          color: "#065f46",
          display: "flex",
          alignItems: "center",
          gap: 4,
          cursor: "pointer",
          whiteSpace: "nowrap",
        }}
        title="Trigger AI persona generator to draft a reply"
      >
        <RobotIcon size={14} color="#065f46" />
        <span>Draft AI</span>
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
