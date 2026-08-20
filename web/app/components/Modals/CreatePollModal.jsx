"use client";

import { useState } from "react";
import { CloseIcon, PollIcon, SendIcon } from "../Icons/WhatsAppIcons";

export function CreatePollModal({
  isOpen,
  onClose,
  onSubmit,
  contact,
  contactName,
  initialConfig = {
    question: "Permission to take over conversation?",
    options: ["Send 1 text", "5 minutes", "2 hours", "Deny"],
  },
}) {
  const [question, setQuestion] = useState(initialConfig.question || "Permission to take over conversation?");
  const [options, setOptions] = useState(
    initialConfig.options && initialConfig.options.length >= 2
      ? initialConfig.options
      : ["Send 1 text", "5 minutes", "2 hours", "Deny"]
  );
  const [allowMultiple, setAllowMultiple] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  if (!isOpen) return null;

  function handleOptionChange(index, val) {
    const next = [...options];
    next[index] = val;
    setOptions(next);
  }

  function handleAddOption() {
    if (options.length < 12) {
      setOptions([...options, ""]);
    }
  }

  function handleRemoveOption(index) {
    if (options.length > 2) {
      setOptions(options.filter((_, i) => i !== index));
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const cleanQuestion = question.trim();
    const validOptions = options.map((o) => o.trim()).filter(Boolean);

    if (!cleanQuestion || validOptions.length < 2) return;

    setSubmitting(true);
    try {
      await onSubmit({
        question: cleanQuestion,
        options: validOptions,
        allowMultiple,
      });
      onClose();
    } finally {
      setSubmitting(false);
    }
  }

  const displayName = contactName || contact;

  return (
    <div className="wa-drawer-backdrop" onClick={onClose}>
      <div
        style={{
          maxWidth: 460,
          width: "92%",
          borderRadius: 12,
          overflow: "hidden",
          background: "var(--wa-modal-bg)",
          border: "1px solid var(--wa-modal-border)",
          boxShadow: "0 10px 30px rgba(0,0,0,0.4)",
          margin: "auto",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            background: "var(--wa-teal-dark)",
            color: "#ffffff",
            padding: "16px 20px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <PollIcon size={20} color="#ffffff" />
            <h3 style={{ margin: 0, fontSize: 17, fontWeight: 600 }}>Create Take-Over Poll</h3>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              color: "#ffffff",
              padding: 4,
            }}
          >
            <CloseIcon size={20} color="#ffffff" />
          </button>
        </div>

        {/* Body Form */}
        <form onSubmit={handleSubmit} style={{ padding: "20px 24px", display: "grid", gap: 18 }}>
          {/* Target Contact Display */}
          <div style={{ fontSize: 13, color: "var(--wa-text-secondary)" }}>
            Target Contact: <strong style={{ color: "var(--wa-text-primary)" }}>{displayName}</strong>
          </div>

          {/* Question Input */}
          <div style={{ display: "grid", gap: 6 }}>
            <label style={{ fontSize: 13, fontWeight: 600, color: "var(--wa-text-primary)" }}>
              Question
            </label>
            <input
              type="text"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Ask a question..."
              required
              style={{
                width: "100%",
                padding: "10px 14px",
                borderRadius: 8,
                border: "1px solid var(--wa-border-strong)",
                background: "var(--wa-input-bg)",
                color: "var(--wa-text-primary)",
                fontSize: 14,
                outline: "none",
                boxSizing: "border-box",
              }}
            />
          </div>

          {/* Options Inputs */}
          <div style={{ display: "grid", gap: 10 }}>
            <label style={{ fontSize: 13, fontWeight: 600, color: "var(--wa-text-primary)" }}>
              Options ({options.filter(Boolean).length})
            </label>

            {options.map((opt, idx) => (
              <div key={idx} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span
                  style={{
                    width: 22,
                    fontSize: 12,
                    color: "var(--wa-text-muted)",
                    textAlign: "center",
                    fontWeight: 600,
                  }}
                >
                  {idx + 1}
                </span>
                <input
                  type="text"
                  value={opt}
                  onChange={(e) => handleOptionChange(idx, e.target.value)}
                  placeholder={`Option ${idx + 1}`}
                  required={idx < 2}
                  style={{
                    flex: 1,
                    padding: "8px 12px",
                    borderRadius: 6,
                    border: "1px solid var(--wa-border-strong)",
                    background: "var(--wa-input-bg)",
                    color: "var(--wa-text-primary)",
                    fontSize: 13.5,
                    outline: "none",
                    boxSizing: "border-box",
                  }}
                />
                {options.length > 2 && (
                  <button
                    type="button"
                    onClick={() => handleRemoveOption(idx)}
                    style={{
                      background: "none",
                      border: "none",
                      color: "var(--wa-text-muted)",
                      cursor: "pointer",
                      padding: "0 4px",
                      display: "flex",
                      alignItems: "center",
                    }}
                    title="Remove option"
                  >
                    <CloseIcon size={14} color="var(--wa-text-muted)" />
                  </button>
                )}
              </div>
            ))}

            {options.length < 12 && (
              <button
                type="button"
                onClick={handleAddOption}
                style={{
                  background: "none",
                  border: "1px dashed var(--wa-border-strong)",
                  borderRadius: 6,
                  padding: "8px",
                  fontSize: 13,
                  color: "var(--wa-teal)",
                  cursor: "pointer",
                  fontWeight: 600,
                  transition: "all 0.15s ease",
                }}
              >
                + Add Option
              </button>
            )}
          </div>

          {/* Buttons */}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 6 }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: "9px 16px",
                borderRadius: 6,
                border: "1px solid var(--wa-border-strong)",
                background: "transparent",
                color: "var(--wa-text-secondary)",
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={submitting || !question.trim() || options.filter(Boolean).length < 2}
              style={{
                padding: "9px 20px",
                borderRadius: 6,
                border: "none",
                background: "var(--wa-teal)",
                color: "#ffffff",
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 6,
                boxShadow: "0 2px 4px rgba(0, 168, 132, 0.3)",
              }}
            >
              <SendIcon size={14} color="#ffffff" />
              <span>{submitting ? "Sending..." : "Create Poll"}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
