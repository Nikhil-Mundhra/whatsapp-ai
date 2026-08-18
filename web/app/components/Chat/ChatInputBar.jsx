"use client";

import { useState, useRef, useEffect } from "react";
import { AttachIcon, SmileIcon, SendIcon, PollIcon, CloseIcon, ClockIcon, StopIcon } from "../Icons/WhatsAppIcons";

function formatDuration(sec) {
  if (sec <= 0) return "00:00";
  const mins = Math.floor(sec / 60);
  const secs = sec % 60;
  if (mins >= 60) {
    const hrs = Math.floor(mins / 60);
    const remMins = mins % 60;
    return `${hrs}h ${remMins}m`;
  }
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

export function ChatInputBar({
  contact,
  onSendManual,
  onQuickVote,
  onOpenPollEditor,
  onRevokeGrant,
  activeGrant = null,
  pollConfig = {
    question: "Permission to take over conversation?",
    options: ["Send 1 text", "5 minutes", "2 hours", "Deny"],
  },
  loading = false,
}) {
  const [inputText, setInputText] = useState("");
  const [showQuickPoll, setShowQuickPoll] = useState(false);
  const [showRevokePopover, setShowRevokePopover] = useState(false);
  const [votingOption, setVotingOption] = useState(null);
  const [secondsLeft, setSecondsLeft] = useState(0);

  const popoverRef = useRef(null);
  const revokeRef = useRef(null);

  const isDurationActive = Boolean(
    activeGrant?.type === "duration" &&
    activeGrant?.expiresAt &&
    activeGrant.expiresAt > Date.now()
  );

  const isCountActive = Boolean(
    activeGrant?.type === "count" &&
    activeGrant?.remainingCount > 0
  );

  const isTakeoverActive = isDurationActive || isCountActive;

  // Real-time ticking countdown
  useEffect(() => {
    if (isDurationActive && activeGrant?.expiresAt) {
      const updateTimer = () => {
        const left = Math.max(0, Math.floor((activeGrant.expiresAt - Date.now()) / 1000));
        setSecondsLeft(left);
        if (left <= 0) {
          onRevokeGrant?.(false);
        }
      };
      updateTimer();
      const timer = setInterval(updateTimer, 1000);
      return () => clearInterval(timer);
    } else {
      setSecondsLeft(0);
    }
  }, [activeGrant?.expiresAt, isDurationActive]);

  // Close popovers on click outside
  useEffect(() => {
    function handleClickOutside(e) {
      if (popoverRef.current && !popoverRef.current.contains(e.target)) {
        setShowQuickPoll(false);
      }
      if (revokeRef.current && !revokeRef.current.contains(e.target)) {
        setShowRevokePopover(false);
      }
    }
    if (showQuickPoll || showRevokePopover) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [showQuickPoll, showRevokePopover]);

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
      {/* 1. Quick Interactive Poll Popover (When not active, Left-Click) */}
      {showQuickPoll && !isTakeoverActive && (
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
                    <span style={{ fontSize: 11 }}>Starting...</span>
                  ) : (
                    <span style={{ fontSize: 11, color: isDeny ? "#ef4444" : "#10b981" }}>➜</span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Right-click hint */}
          <div
            style={{
              marginTop: 10,
              paddingTop: 8,
              borderTop: "1px solid #f1f5f9",
              fontSize: 11,
              color: "#94a3b8",
              textAlign: "center",
            }}
          >
            💡 Right-click button to customize question & options
          </div>
        </div>
      )}

      {/* 2. Active Take-Over Revoke Popover (When Active, Left-Click) */}
      {showRevokePopover && isTakeoverActive && (
        <div
          ref={revokeRef}
          style={{
            position: "absolute",
            bottom: "calc(100% + 8px)",
            right: 56,
            width: 290,
            background: "#ffffff",
            borderRadius: 12,
            boxShadow: "0 6px 20px rgba(11, 20, 26, 0.22)",
            border: "1px solid #fed7aa",
            padding: "14px 16px",
            zIndex: 100,
            animation: "fadeIn 0.15s ease-out",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: "#16a34a",
                boxShadow: "0 0 6px #16a34a",
              }}
            />
            <span style={{ fontSize: 13, fontWeight: 700, color: "#16a34a" }}>
              AI Take-Over Active
            </span>
          </div>

          <p style={{ margin: "0 0 12px", fontSize: 12.5, color: "#475569", lineHeight: 1.4 }}>
            {isDurationActive
              ? `AI is actively mirroring your persona with ${formatDuration(secondsLeft)} remaining.`
              : "AI is authorized to send 1 autonomous reply."}
          </p>

          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              onClick={() => {
                onRevokeGrant?.();
                setShowRevokePopover(false);
              }}
              style={{
                flex: 1,
                padding: "8px 12px",
                background: "#fee2e2",
                border: "1px solid #fca5a5",
                borderRadius: 6,
                color: "#b91c1c",
                fontSize: 12.5,
                fontWeight: 600,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 5,
              }}
            >
              <StopIcon size={14} color="#b91c1c" />
              <span>Revoke AI</span>
            </button>

            <button
              type="button"
              onClick={() => setShowRevokePopover(false)}
              style={{
                padding: "8px 12px",
                background: "#f1f5f9",
                border: "none",
                borderRadius: 6,
                color: "#64748b",
                fontSize: 12.5,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* Main WhatsApp Chat Input Bar */}
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

        {/* Dynamic Action Button: Transforms into Clock Countdown Badge when Take-Over is Active */}
        {isTakeoverActive ? (
          <button
            type="button"
            onClick={() => setShowRevokePopover((prev) => !prev)}
            style={{
              background: "linear-gradient(135deg, #ecfdf5, #d1fae5)",
              border: "1.5px solid #10b981",
              borderRadius: 8,
              padding: "0 10px",
              height: 38,
              fontSize: 12.5,
              fontWeight: 700,
              color: "#047857",
              display: "flex",
              alignItems: "center",
              gap: 6,
              cursor: "pointer",
              whiteSpace: "nowrap",
              boxShadow: "0 0 8px rgba(16, 185, 129, 0.3)",
              transition: "all 0.15s ease",
            }}
            title={
              isDurationActive
                ? `AI Take-Over Active: ${formatDuration(secondsLeft)} remaining — Click to Revoke`
                : "1 AI Message Active — Click to Revoke"
            }
          >
            {/* Pulsing Green Dot */}
            <span
              style={{
                width: 7,
                height: 7,
                borderRadius: "50%",
                background: "#10b981",
                boxShadow: "0 0 6px #10b981",
                display: "inline-block",
              }}
            />
            <ClockIcon size={16} color="#047857" />
            <span style={{ fontVariantNumeric: "tabular-nums", letterSpacing: "0.2px" }}>
              {isDurationActive ? formatDuration(secondsLeft) : "1 Text"}
            </span>
          </button>
        ) : (
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
        )}

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
