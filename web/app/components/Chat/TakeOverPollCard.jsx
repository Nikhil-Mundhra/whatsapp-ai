"use client";

import { PollIcon, RobotIcon } from "../Icons/WhatsAppIcons";

function formatPollTime(timestamp) {
  if (!timestamp) return "";
  const d = new Date(timestamp);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function TakeOverPollCard({
  poll,
  onVote,
  isVoting = false,
}) {
  const isPending = poll.status === "pending";
  const chosen = poll.chosenOption;

  return (
    <div className="wa-poll-card">
      {/* Header */}
      <div className="wa-poll-header">
        <div className="wa-poll-title">
          <PollIcon size={18} color="#00a884" />
          <span>Take-Over Permission Poll</span>
        </div>
        <span className={`wa-poll-badge ${isPending ? "pending" : "resolved"}`}>
          {isPending ? "Pending Vote" : "Resolved"}
        </span>
      </div>

      {/* Question */}
      <div className="wa-poll-question">
        <span style={{ fontWeight: 600, color: "#0f172a" }}>Question: </span>
        {poll.question || "Allow AI to reply on your behalf?"}
      </div>

      {/* Options List */}
      <div className="wa-poll-options">
        {(poll.options || ["Send 1 text", "5 minutes", "2 hours", "Deny"]).map((opt) => {
          const isSelected = chosen === opt;
          const isDeny = opt.toLowerCase().includes("deny");

          return (
            <button
              key={opt}
              className={`wa-poll-option-btn ${isSelected ? "selected" : ""}`}
              onClick={() => isPending && onVote(poll.id, opt)}
              disabled={!isPending || isVoting}
              style={{
                borderColor: isSelected
                  ? isDeny
                    ? "#ef4444"
                    : "#10b981"
                  : isPending
                  ? "#cbd5e1"
                  : "#e2e8f0",
                background: isSelected
                  ? isDeny
                    ? "#fef2f2"
                    : "#ecfdf5"
                  : "#f8fafc",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                {/* Radio Circle */}
                <div
                  style={{
                    width: 18,
                    height: 18,
                    borderRadius: "50%",
                    border: `2px solid ${
                      isSelected
                        ? isDeny
                          ? "#ef4444"
                          : "#10b981"
                        : "#94a3b8"
                    }`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: isSelected
                      ? isDeny
                        ? "#ef4444"
                        : "#10b981"
                      : "transparent",
                  }}
                >
                  {isSelected && (
                    <div
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: "50%",
                        backgroundColor: "#ffffff",
                      }}
                    />
                  )}
                </div>

                <span style={{ color: isSelected ? (isDeny ? "#991b1b" : "#065f46") : "#1e293b" }}>
                  {opt}
                </span>
              </div>

              {isSelected && (
                <span style={{ fontSize: 11, fontWeight: 700, color: isDeny ? "#dc2626" : "#16a34a" }}>
                  {isDeny ? "Denied ✗" : "Granted ✓"}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Footer Details */}
      <div className="wa-poll-footer">
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <RobotIcon size={12} color="#64748b" />
          <span>{poll.source ? `Source: ${poll.source}` : "Auto-generated poll"}</span>
        </div>
        <span>{formatPollTime(poll.createdAt)}</span>
      </div>
    </div>
  );
}
