"use client";

import { CalendarIcon, ClockIcon, LocationPinIcon, PollIcon, RobotIcon } from "../Icons/WhatsAppIcons";

function formatPollTime(timestamp) {
  if (!timestamp) return "";
  const d = new Date(timestamp);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatEventTime(isoString) {
  if (!isoString) return "";
  try {
    const d = new Date(isoString);
    return d.toLocaleString([], {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return isoString;
  }
}

export function TakeOverPollCard({
  poll,
  onVote,
  isVoting = false,
}) {
  const isPending = poll.status === "pending";
  const chosen = poll.selectedOption || poll.chosenOption;

  let parsedAction = null;
  if (poll.actionPayload) {
    try {
      parsedAction = typeof poll.actionPayload === "string" ? JSON.parse(poll.actionPayload) : poll.actionPayload;
    } catch {
      parsedAction = null;
    }
  }

  const isActionPoll = Boolean(poll.actionType || parsedAction);

  return (
    <div className="wa-poll-card" style={{ backdropFilter: "blur(24px)" }}>
      {/* Header */}
      <div className="wa-poll-header">
        <div className="wa-poll-title">
          {isActionPoll ? (
            <CalendarIcon size={18} color="var(--wa-teal)" />
          ) : (
            <PollIcon size={18} color="var(--wa-teal)" />
          )}
          <span>{isActionPoll ? "Structured Action & Take-Over" : "Take-Over Permission Poll"}</span>
        </div>
        <span className={`wa-poll-badge ${isPending ? "pending" : "resolved"}`}>
          {isPending ? "Pending Action" : "Resolved"}
        </span>
      </div>

      {/* Action Drawer Preview if Structured Action */}
      {isActionPoll && parsedAction && (
        <div
          style={{
            marginTop: 10,
            marginBottom: 12,
            padding: "10px 12px",
            borderRadius: 8,
            backgroundColor: "var(--wa-bubble-incoming, rgba(255, 255, 255, 0.05))",
            border: "1px solid var(--wa-border, rgba(255, 255, 255, 0.1))",
          }}
        >
          <div style={{ fontWeight: 600, fontSize: 13, color: "var(--wa-text-primary)", marginBottom: 4 }}>
            {parsedAction.summary || "Proposed Calendar Event"}
          </div>

          {parsedAction.startUtc && (
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--wa-text-secondary)", marginBottom: 2 }}>
              <ClockIcon size={14} color="var(--wa-teal)" />
              <span>{formatEventTime(parsedAction.startUtc)}</span>
            </div>
          )}

          {parsedAction.location && (
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--wa-text-secondary)" }}>
              <LocationPinIcon size={14} color="var(--wa-teal)" />
              <span>{parsedAction.location}</span>
            </div>
          )}
        </div>
      )}

      {/* Proposed Draft Text Preview */}
      {poll.draftReplyText && (
        <div
          style={{
            marginBottom: 12,
            padding: "8px 10px",
            borderRadius: 6,
            backgroundColor: "var(--wa-poll-option-bg, rgba(0, 168, 132, 0.05))",
            borderLeft: "3px solid var(--wa-teal)",
            fontSize: 12,
            color: "var(--wa-text-primary)",
            fontStyle: "italic",
          }}
        >
          "{poll.draftReplyText}"
        </div>
      )}

      {/* Question */}
      <div className="wa-poll-question">
        <span style={{ fontWeight: 600, color: "var(--wa-text-primary)" }}>Question: </span>
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
                    : "var(--wa-teal)"
                  : isPending
                  ? "var(--wa-poll-option-border)"
                  : "var(--wa-border)",
                background: isSelected
                  ? isDeny
                    ? "rgba(239, 68, 68, 0.2)"
                    : "var(--wa-poll-option-selected)"
                  : "var(--wa-poll-option-bg)",
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
                          : "var(--wa-teal)"
                        : "var(--wa-text-muted)"
                    }`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: isSelected
                      ? isDeny
                        ? "#ef4444"
                        : "var(--wa-teal)"
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

                <span style={{ color: isSelected ? (isDeny ? "#ef4444" : "var(--wa-teal)") : "var(--wa-text-primary)" }}>
                  {opt}
                </span>
              </div>

              {isSelected && (
                <span style={{ fontSize: 11, fontWeight: 700, color: isDeny ? "#ef4444" : "var(--wa-teal)" }}>
                  {isDeny ? "Denied" : "Approved"}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Footer Details */}
      <div className="wa-poll-footer">
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <RobotIcon size={12} color="var(--wa-text-secondary)" />
          <span>{poll.source ? `Source: ${poll.source}` : "Auto-generated action"}</span>
        </div>
        <span>{formatPollTime(poll.createdAt)}</span>
      </div>
    </div>
  );
}

