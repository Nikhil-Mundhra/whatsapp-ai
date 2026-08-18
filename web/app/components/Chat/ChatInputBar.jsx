"use client";

import { useState, useRef, useEffect } from "react";
import { AttachIcon, SmileIcon, SendIcon, PollIcon, CloseIcon } from "../Icons/WhatsAppIcons";

export function ChatInputBar({
  contact,
  onSendManual,
  onQuickVote,
  onOpenPollEditor,
  pollConfig = {
    question: "Permission to take over conversation?",
    options: ["Send 1 text", "5 minutes", "2 hours", "Deny"],
  },
  loading = false,
}) {
  const [inputText, setInputText] = useState("");
  const [showQuickPoll, setShowQuickPoll] = useState(false);
  const [votingOption, setVotingOption] = useState(null);
  const popoverRef = useRef(null);

  // Close quick poll popup when clicking outside
  useEffect(() => {
    function handleClickOutside(e) {
      if (popoverRef.current && !popoverRef.current.contains(e.target)) {
        setShowQuickPoll(false);
      }
    }
    if (showQuickPoll) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [showQuickPoll]);

  function handleSubmit(e) {
    e.preventDefault();
    const text = inputText.trim();
    if (!text || loading) return;
    onSendManual?.(text);
    setInputText("");
  }

  async function handleOptionSelect(option) {
    setVotingOption(option);
    try {
      await onQuickVote?.(option, pollConfig.question, pollConfig.options);
      setShowQuickPoll(false);
    } finally {
      setVotingOption(null);
    }
  }

  return (
    <div style={{ position: "relative" }}>
      {/* Quick Interactive Poll Popover (Opens on Left Click) */}
      {showQuickPoll && (
        <div
          ref={popoverRef}
          style={{
            position: "absolute",
            bottom: "calc(100% + 8px)",
            right: 56,
            width: 310,
            background: "#ffffff",
            borderRadius: 12,
            boxShadow: "0 6px 20px rgba(11, 20, 26, 0.22)",
            border: "1px solid #e2e8f0",
            padding: "14px 16px",
            zIndex: 100,
            animation: "fadeIn 0.15s ease-out",
          }}
        >
          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <PollIcon size={16} color="#008069" />
              <span style={{ fontSize: 13, fontWeight: 700, color: "#008069" }}>
                Take-Over Poll
              </span>
            </div>
            <button
              type="button"
              onClick={() => setShowQuickPoll(false)}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                padding: 2,
                color: "#64748b",
                display: "flex",
                alignItems: "center",
              }}
            >
              <CloseIcon size={16} color="#64748b" />
            </button>
          </div>

          {/* Question text */}
          <div style={{ fontSize: 13.5, fontWeight: 600, color: "#1e293b", marginBottom: 12, lineHeight: 1.3 }}>
            {pollConfig.question}
          </div>

          {/* 4 Interactive Option Buttons */}
          <div style={{ display: "grid", gap: 6 }}>
            {pollConfig.options.map((opt, idx) => {
              const isDeny = opt.toLowerCase().includes("deny");
              const isSelected = votingOption === opt;

              return (
                <button
                  key={idx}
                  type="button"
                  disabled={Boolean(votingOption)}
                  onClick={() => handleOptionSelect(opt)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "9px 12px",
                    borderRadius: 8,
                    border: `1px solid ${isDeny ? "#fecaca" : "#d1fae5"}`,
                    background: isSelected
                      ? isDeny ? "#fee2e2" : "#dcfce7"
                      : isDeny ? "#fef2f2" : "#f0fdf4",
                    color: isDeny ? "#b91c1c" : "#065f46",
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: votingOption ? "not-allowed" : "pointer",
                    transition: "all 0.12s ease",
                    textAlign: "left",
                  }}
                  onMouseEnter={(e) => {
                    if (!votingOption) {
                      e.currentTarget.style.transform = "translateY(-1px)";
                      e.currentTarget.style.boxShadow = "0 2px 4px rgba(0,0,0,0.06)";
                    }
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = "none";
                    e.currentTarget.style.boxShadow = "none";
                  }}
                >
                  <span>{opt}</span>
                  {isSelected ? (
                    <span style={{ fontSize: 11 }}>Voting...</span>
                  ) : (
                    <span style={{ fontSize: 11, color: isDeny ? "#ef4444" : "#10b981" }}>➜</span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Right-click hint footer */}
          <div
            style={{
              marginTop: 10,
              paddingTop: 8,
              borderTop: "1px solid #f1f5f9",
              fontSize: 11,
              color: "#94a3b8",
              textAlign: "center",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 4,
            }}
          >
            <span>💡 Right-click button to edit poll options</span>
          </div>
        </div>
      )}

      {/* Main Input Bar */}
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

        {/* Take-Over Poll Button (Left Click = Quick Overlay, Right Click = Edit Poll) */}
        <button
          type="button"
          onClick={() => setShowQuickPoll((prev) => !prev)}
          onContextMenu={(e) => {
            e.preventDefault();
            setShowQuickPoll(false);
            onOpenPollEditor?.();
          }}
          style={{
            background: showQuickPoll ? "#008069" : "#f0f2f5",
            border: `1px solid ${showQuickPoll ? "#008069" : "#d1d7db"}`,
            borderRadius: 8,
            padding: "0 11px",
            height: 38,
            fontSize: 12.5,
            fontWeight: 600,
            color: showQuickPoll ? "#ffffff" : "#008069",
            display: "flex",
            alignItems: "center",
            gap: 5,
            cursor: "pointer",
            whiteSpace: "nowrap",
            transition: "all 0.15s ease",
            boxShadow: showQuickPoll ? "0 2px 6px rgba(0, 128, 105, 0.3)" : "none",
          }}
          title="Click to vote on Take-Over Poll | Right-click to edit questions & options"
        >
          <PollIcon size={16} color={showQuickPoll ? "#ffffff" : "#008069"} />
          <span>Poll</span>
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
    </div>
  );
}
