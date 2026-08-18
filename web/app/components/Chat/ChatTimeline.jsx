"use client";

import { useEffect, useRef } from "react";
import { MessageBubble } from "./MessageBubble";
import { TakeOverPollCard } from "./TakeOverPollCard";
import { LockIcon } from "../Icons/WhatsAppIcons";

export function ChatTimeline({
  messages = [],
  polls = [],
  onVote,
  votingId,
  contact,
}) {
  const bottomRef = useRef(null);

  // Combine and sort messages and polls chronologically
  const timelineItems = [
    ...messages.map((m) => ({
      type: "message",
      id: m.id || `${m.timestamp}-${m.body}`,
      time: m.timestamp ? new Date(m.timestamp).getTime() : 0,
      data: m,
    })),
    ...polls.map((p) => ({
      type: "poll",
      id: `poll-${p.id}`,
      time: p.createdAt ? new Date(p.createdAt).getTime() : 0,
      data: p,
    })),
  ].sort((a, b) => a.time - b.time);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [timelineItems.length]);

  return (
    <div className="wa-messages-timeline">
      {/* Background Wallpaper Pattern */}
      <div className="wa-chat-wallpaper" />

      {/* Security E2E Notice */}
      <div
        style={{
          alignSelf: "center",
          background: "#ffeecd",
          color: "#54656f",
          fontSize: 12,
          padding: "6px 14px",
          borderRadius: 8,
          boxShadow: "0 1px 0.5px rgba(11,20,26,0.13)",
          display: "flex",
          alignItems: "center",
          gap: 6,
          margin: "12px 0 6px",
          textAlign: "center",
          maxWidth: "80%",
        }}
      >
        <LockIcon size={13} color="#54656f" />
        <span>
          WhatsApp messages are end-to-end encrypted. AI take-over is strictly permission-gated.
        </span>
      </div>

      <div className="wa-date-divider">TODAY</div>

      {timelineItems.length === 0 ? (
        <div style={{ padding: "40px 20px", textAlign: "center", color: "#8696a0", zIndex: 2 }}>
          <p style={{ fontSize: 14, margin: "0 0 6px" }}>No message history for this contact yet.</p>
          <p style={{ fontSize: 12, margin: 0 }}>
            Incoming messages from this contact will trigger AI take-over polls here.
          </p>
        </div>
      ) : (
        timelineItems.map((item) => {
          if (item.type === "poll") {
            return (
              <TakeOverPollCard
                key={item.id}
                poll={item.data}
                onVote={onVote}
                isVoting={votingId === item.data.id}
              />
            );
          }
          return <MessageBubble key={item.id} message={item.data} />;
        })
      )}

      <div ref={bottomRef} style={{ height: 1 }} />
    </div>
  );
}
