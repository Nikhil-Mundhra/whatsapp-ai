"use client";

import { useState } from "react";
import { CloseIcon, PollIcon, SendIcon } from "../Icons/WhatsAppIcons";

export function CreatePollModal({
  isOpen,
  onClose,
  onSubmit,
  contact,
  contactName,
}) {
  const [question, setQuestion] = useState("Permission to take over conversation?");
  const [options, setOptions] = useState([
    "Send 1 text",
    "5 minutes",
    "2 hours",
    "Deny",
  ]);
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
    <div className="wa-modal-backdrop" onClick={onClose}>
      <div
        className="wa-modal"
        style={{ maxWidth: 460, width: "92%", borderRadius: 12, overflow: "hidden" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            background: "#008069",
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
          <div style={{ fontSize: 13, color: "#64748b" }}>
            Target Contact: <strong style={{ color: "#0f172a" }}>{displayName}</strong>
          </div>

          {/* Question Input */}
          <div style={{ display: "grid", gap: 6 }}>
            <label style={{ fontSize: 13, fontWeight: 600, color: "#334155" }}>
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
                border: "1px solid #cbd5e1",
                fontSize: 14,
                outline: "none",
                boxSizing: "border-box",
              }}
            />
          </div>

          {/* Options Inputs */}
          <div style={{ display: "grid", gap: 10 }}>
            <label style={{ fontSize: 13, fontWeight: 600, color: "#334155" }}>
              Options ({options.filter(Boolean).length})
            </label>

            {options.map((opt, idx) => (
              <div key={idx} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span
                  style={{
                    width: 22,
                    fontSize: 12,
                    color: "#94a3b8",
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
                    border: "1px solid #cbd5e1",
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
                      color: "#94a3b8",
                      cursor: "pointer",
                      fontSize: 16,
                      padding: "0 4px",
                    }}
                    title="Remove option"
                  >
                    ✕
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
                  border: "1px dashed #cbd5e1",
                  borderRadius: 6,
                  padding: "8px",
                  fontSize: 13,
                  color: "#008069",
                  fontWeight: 600,
                  cursor: "pointer",
                  marginTop: 4,
                }}
              >
                + Add Option
              </button>
            )}
          </div>

          {/* Allow Multiple Answers Toggle */}
          <label
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              cursor: "pointer",
              padding: "10px 0",
              borderTop: "1px solid #f1f5f9",
            }}
          >
            <span style={{ fontSize: 13, color: "#334155", fontWeight: 500 }}>
              Allow multiple answers
            </span>
            <input
              type="checkbox"
              checked={allowMultiple}
              onChange={(e) => setAllowMultiple(e.target.checked)}
              style={{ width: 16, height: 16, accentColor: "#008069", cursor: "pointer" }}
            />
          </label>

          {/* Modal Footer Actions */}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 6 }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                background: "#f1f5f9",
                border: "none",
                borderRadius: 8,
                padding: "10px 16px",
                fontSize: 13.5,
                fontWeight: 600,
                color: "#475569",
                cursor: "pointer",
              }}
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={submitting || !question.trim() || options.filter(Boolean).length < 2}
              style={{
                background: "#008069",
                color: "#ffffff",
                border: "none",
                borderRadius: 8,
                padding: "10px 20px",
                fontSize: 13.5,
                fontWeight: 600,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 6,
                boxShadow: "0 2px 4px rgba(0, 128, 105, 0.25)",
              }}
            >
              <SendIcon size={14} color="#ffffff" />
              <span>{submitting ? "Creating..." : "Send Poll"}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
