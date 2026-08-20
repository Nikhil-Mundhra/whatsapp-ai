"use client";

import { useState, useRef, useEffect } from "react";
import { AttachIcon, SmileIcon, SendIcon, PollIcon, CloseIcon, ClockIcon, StopIcon, ImageIcon } from "../Icons/WhatsAppIcons";

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
  const [votingOption, setVotingOption] = useState(null);
  const [secondsLeft, setSecondsLeft] = useState(0);

  // Image attachment state: { id, localPreview, blobUrl, uploading, error }
  const [pendingImages, setPendingImages] = useState([]);
  const fileInputRef = useRef(null);

  const popoverRef = useRef(null);

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

  // Close popover on click outside
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

  // Clear pending images when contact changes
  useEffect(() => {
    setPendingImages([]);
  }, [contact]);

  function handleSubmit(e) {
    e.preventDefault();
    const text = inputText.trim();
    const readyImages = pendingImages.filter((img) => img.blobUrl && !img.uploading);
    if ((!text && readyImages.length === 0) || loading) return;

    // Pass only the blob URLs to the parent — no large base64 in state
    onSendManual?.(text, readyImages.map((img) => img.blobUrl));

    // Revoke remaining object URLs
    pendingImages.forEach((img) => {
      if (img.localPreview) URL.revokeObjectURL(img.localPreview);
    });
    setInputText("");
    setPendingImages([]);
  }

  async function handleImageSelect(e) {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    // Reset input so the same file can be re-selected later
    e.target.value = "";

    for (const file of files) {
      const id = `img-${Date.now()}-${Math.random()}`;
      // Object URL for instant thumbnail — revoked after upload
      const localPreview = URL.createObjectURL(file);

      // Add placeholder in "uploading" state immediately
      setPendingImages((prev) => [
        ...prev,
        { id, localPreview, blobUrl: null, uploading: true, error: false },
      ]);

      try {
        const res = await fetch(
          `/api/images/upload?filename=${encodeURIComponent(file.name)}`,
          { method: "POST", body: file }
        );
        if (!res.ok) throw new Error(`Upload failed: ${res.status}`);
        const data = await res.json();
        setPendingImages((prev) =>
          prev.map((img) =>
            img.id === id ? { ...img, blobUrl: data.url, uploading: false } : img
          )
        );
      } catch {
        setPendingImages((prev) =>
          prev.map((img) =>
            img.id === id ? { ...img, uploading: false, error: true } : img
          )
        );
      }
    }
  }

  function removeImage(id) {
    setPendingImages((prev) => {
      const img = prev.find((i) => i.id === id);
      if (img?.localPreview) URL.revokeObjectURL(img.localPreview);
      return prev.filter((i) => i.id !== id);
    });
  }

  async function handleOptionSelect(option) {
    setVotingOption(option);
    try {
      if (option.toLowerCase().includes("deny")) {
        await onRevokeGrant?.();
      } else {
        await onQuickVote?.(option, pollConfig.question, pollConfig.options);
      }
      setShowQuickPoll(false);
    } finally {
      setVotingOption(null);
    }
  }

  async function handleDirectRevoke() {
    try {
      await onRevokeGrant?.();
      setShowQuickPoll(false);
    } catch (err) {
      console.warn("Revoke failed:", err);
    }
  }

  return (
    <div style={{ position: "relative" }}>
      {/* Quick Interactive Take-Over Poll Popover */}
      {showQuickPoll && (
        <div
          ref={popoverRef}
          style={{
            position: "absolute",
            bottom: "calc(100% + 8px)",
            right: 56,
            width: 320,
            background: "var(--wa-popover-bg)",
            borderRadius: 12,
            boxShadow: "0 6px 24px rgba(11, 20, 26, 0.4)",
            border: "1px solid var(--wa-popover-border)",
            padding: "14px 16px",
            zIndex: 100,
            animation: "fadeIn 0.15s ease-out",
          }}
        >
          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <PollIcon size={16} color="var(--wa-teal)" />
              <span style={{ fontSize: 13, fontWeight: 700, color: "var(--wa-teal)" }}>
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
                color: "var(--wa-text-secondary)",
                display: "flex",
                alignItems: "center",
              }}
            >
              <CloseIcon size={16} color="var(--wa-text-secondary)" />
            </button>
          </div>

          {/* Active Status Banner & Direct Revoke (if takeover is active) */}
          {isTakeoverActive && (
            <div
              style={{
                marginBottom: 12,
                padding: "8px 10px",
                background: "rgba(0, 168, 132, 0.12)",
                border: "1px solid rgba(0, 168, 132, 0.3)",
                borderRadius: 8,
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 8,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: "50%",
                    background: "var(--wa-teal)",
                    boxShadow: "0 0 6px var(--wa-teal)",
                    display: "inline-block",
                  }}
                />
                <span style={{ fontSize: 12, fontWeight: 600, color: "var(--wa-teal)" }}>
                  {isDurationActive
                    ? `${formatDuration(secondsLeft)} remaining`
                    : "1 message authorized"}
                </span>
              </div>

              <button
                type="button"
                onClick={handleDirectRevoke}
                style={{
                  background: "rgba(239, 68, 68, 0.15)",
                  border: "1px solid rgba(239, 68, 68, 0.35)",
                  borderRadius: 6,
                  color: "#ef4444",
                  fontSize: 11.5,
                  fontWeight: 600,
                  padding: "4px 8px",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                }}
              >
                <StopIcon size={12} color="#ef4444" />
                <span>Revoke</span>
              </button>
            </div>
          )}

          {/* Question text */}
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--wa-text-primary)", marginBottom: 10, lineHeight: 1.3 }}>
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
                    border: `1px solid ${isDeny ? "rgba(239, 68, 68, 0.4)" : "var(--wa-border)"}`,
                    background: isSelected
                      ? isDeny ? "rgba(239, 68, 68, 0.25)" : "var(--wa-selected-bg)"
                      : isDeny ? "rgba(239, 68, 68, 0.12)" : "var(--wa-poll-option-bg)",
                    color: isDeny ? "#ef4444" : "var(--wa-text-primary)",
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: votingOption ? "not-allowed" : "pointer",
                    transition: "all 0.12s ease",
                    textAlign: "left",
                  }}
                  onMouseEnter={(e) => {
                    if (!votingOption) {
                      e.currentTarget.style.transform = "translateY(-1px)";
                      e.currentTarget.style.borderColor = isDeny ? "#ef4444" : "var(--wa-teal)";
                    }
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = "none";
                    e.currentTarget.style.borderColor = isDeny ? "rgba(239, 68, 68, 0.4)" : "var(--wa-border)";
                  }}
                >
                  <span>{opt}</span>
                  {isSelected ? (
                    <span style={{ fontSize: 11 }}>Applying...</span>
                  ) : (
                    <span style={{ fontSize: 11, color: isDeny ? "#ef4444" : "var(--wa-teal)" }}>➜</span>
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
              borderTop: "1px solid var(--wa-border)",
              fontSize: 11,
              color: "var(--wa-text-muted)",
              textAlign: "center",
            }}
          >
            💡 Right-click Poll button to edit questions & options
          </div>
        </div>
      )}

      {/* Image Preview Strip (shown when images are pending) */}
      {pendingImages.length > 0 && (
        <div className="wa-image-preview-strip">
          <div className="wa-image-preview-thumbnails">
            {pendingImages.map((img) => (
              <div
                key={img.id}
                className={`wa-image-preview-thumb ${img.error ? "error" : ""}`}
              >
                <img src={img.localPreview} alt="preview" />

                {/* Upload spinner overlay */}
                {img.uploading && (
                  <div className="wa-image-preview-uploading">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round">
                      <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83">
                        <animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="0.8s" repeatCount="indefinite"/>
                      </path>
                    </svg>
                  </div>
                )}

                {/* Error overlay */}
                {img.error && (
                  <div className="wa-image-preview-error" title="Upload failed">⚠</div>
                )}

                <button
                  type="button"
                  className="wa-image-preview-remove"
                  onClick={() => removeImage(img.id)}
                  title="Remove image"
                >
                  <CloseIcon size={10} color="#ffffff" />
                </button>
              </div>
            ))}
          </div>
          <div className="wa-image-not-visible-note">
            <span>📷</span>
            <span>Not visible to AI</span>
          </div>
        </div>
      )}

      {/* Hidden file input for image selection */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        style={{ display: "none" }}
        onChange={handleImageSelect}
      />

      {/* Main WhatsApp Chat Input Bar */}
      <form className="wa-chat-input-bar" onSubmit={handleSubmit}>
        <button type="button" className="wa-icon-btn" title="Emojis">
          <SmileIcon size={22} color="var(--wa-icon-color)" />
        </button>

        <button type="button" className="wa-icon-btn" title="Attach file or media">
          <AttachIcon size={20} color="var(--wa-icon-color)" />
        </button>

        {/* Image Attach Button */}
        <button
          type="button"
          className="wa-icon-btn"
          title="Attach image (not visible to AI)"
          onClick={() => fileInputRef.current?.click()}
          style={{
            color: pendingImages.length > 0 ? "var(--wa-teal)" : undefined,
            position: "relative",
          }}
        >
          <ImageIcon size={20} color={pendingImages.length > 0 ? "var(--wa-teal)" : "var(--wa-icon-color)"} />
          {pendingImages.length > 0 && (
            <span
              style={{
                position: "absolute",
                top: 2,
                right: 2,
                width: 14,
                height: 14,
                borderRadius: "50%",
                background: "var(--wa-teal)",
                color: "#fff",
                fontSize: 9,
                fontWeight: 700,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                lineHeight: 1,
              }}
            >
              {pendingImages.length}
            </span>
          )}
        </button>

        {/* Input Field */}
        <input
          type="text"
          className="wa-chat-input-field"
          placeholder={pendingImages.length > 0 ? "Add a caption… (not visible to AI)" : "Type a message..."}
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          disabled={loading}
        />

        {/* Poll Button (Always interactive, with live Take-Over badge indicator when active) */}
        <button
          type="button"
          onClick={() => setShowQuickPoll((prev) => !prev)}
          onContextMenu={(e) => {
            e.preventDefault();
            setShowQuickPoll(false);
            onOpenPollEditor?.();
          }}
          style={{
            background: isTakeoverActive
              ? "rgba(0, 168, 132, 0.18)"
              : showQuickPoll
              ? "var(--wa-teal)"
              : "var(--wa-btn-secondary-bg)",
            border: isTakeoverActive
              ? "1.5px solid var(--wa-teal)"
              : `1px solid ${showQuickPoll ? "var(--wa-teal)" : "var(--wa-btn-secondary-border)"}`,
            borderRadius: 8,
            padding: "0 10px",
            height: 38,
            fontSize: 12.5,
            fontWeight: isTakeoverActive ? 700 : 600,
            color: isTakeoverActive
              ? "var(--wa-teal)"
              : showQuickPoll
              ? "#ffffff"
              : "var(--wa-btn-secondary-text)",
            display: "flex",
            alignItems: "center",
            gap: 5,
            cursor: "pointer",
            whiteSpace: "nowrap",
            transition: "all 0.15s ease",
            boxShadow: isTakeoverActive
              ? "0 0 8px rgba(0, 168, 132, 0.3)"
              : showQuickPoll
              ? "0 2px 6px rgba(0, 168, 132, 0.3)"
              : "none",
          }}
          title={
            isTakeoverActive
              ? isDurationActive
                ? `AI Take-Over Active: ${formatDuration(secondsLeft)} remaining — Click to view/modify/revoke`
                : "1 AI Message Active — Click to view/modify/revoke"
              : "Click to vote on Take-Over Poll | Right-click to edit questions & options"
          }
        >
          {isTakeoverActive ? (
            <>
              {/* Pulsing Green Dot */}
              <span
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: "50%",
                  background: "var(--wa-teal)",
                  boxShadow: "0 0 6px var(--wa-teal)",
                  display: "inline-block",
                }}
              />
              <ClockIcon size={15} color="var(--wa-teal)" />
              <span style={{ fontVariantNumeric: "tabular-nums" }}>
                {isDurationActive ? formatDuration(secondsLeft) : "1 Text"}
              </span>
            </>
          ) : (
            <>
              <PollIcon size={16} color={showQuickPoll ? "#ffffff" : "var(--wa-btn-secondary-text)"} />
              <span>Poll</span>
            </>
          )}
        </button>

        {/* Send Button */}
        <button
          type="submit"
          className="wa-send-btn"
          disabled={(!inputText.trim() && !pendingImages.some((img) => img.blobUrl)) || loading}
          title="Send message"
        >
          <SendIcon size={16} />
        </button>
      </form>
    </div>
  );
}

