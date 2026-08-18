"use client";

import { useState } from "react";
import { CloseIcon } from "../Icons/WhatsAppIcons";

export function ConnectionSwitcherModal({
  isOpen,
  onClose,
  currentHash,
  onSwitchHash,
}) {
  const [inputCode, setInputCode] = useState(currentHash || "");

  if (!isOpen) return null;

  function handleSubmit(e) {
    e.preventDefault();
    const clean = inputCode.trim().toUpperCase();
    if (clean) {
      onSwitchHash(clean);
      onClose();
    }
  }

  return (
    <div
      className="wa-drawer-backdrop"
      onClick={onClose}
      style={{
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
      }}
    >
      <div
        style={{
          backgroundColor: "var(--wa-modal-bg)",
          borderRadius: 12,
          padding: 24,
          maxWidth: 420,
          width: "100%",
          border: "1px solid var(--wa-modal-border)",
          boxShadow: "0 10px 30px rgba(0, 0, 0, 0.4)",
          position: "relative",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h3 style={{ margin: 0, fontSize: 18, color: "var(--wa-text-primary)" }}>Switch Connection</h3>
          <button
            onClick={onClose}
            style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }}
          >
            <CloseIcon size={20} color="var(--wa-text-secondary)" />
          </button>
        </div>

        <p style={{ fontSize: 13, color: "var(--wa-text-secondary)", margin: "0 0 16px", lineHeight: 1.4 }}>
          Enter your 6-character connection code to load your Take-Over polls and messages.
        </p>

        <form onSubmit={handleSubmit} style={{ display: "grid", gap: 14 }}>
          <input
            type="text"
            maxLength={8}
            value={inputCode}
            onChange={(e) => setInputCode(e.target.value.toUpperCase())}
            placeholder="e.g. K9X2P4"
            autoFocus
            style={{
              padding: "10px 14px",
              borderRadius: 8,
              border: "1px solid var(--wa-border-strong)",
              backgroundColor: "var(--wa-input-bg)",
              color: "var(--wa-text-primary)",
              fontSize: 16,
              fontWeight: 700,
              letterSpacing: 1.5,
              textAlign: "center",
              textTransform: "uppercase",
              outline: "none",
            }}
          />

          <button
            type="submit"
            style={{
              background: "var(--wa-teal)",
              color: "#ffffff",
              border: "none",
              borderRadius: 8,
              padding: "10px",
              fontSize: 14,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Switch to Connection
          </button>
        </form>
      </div>
    </div>
  );
}
