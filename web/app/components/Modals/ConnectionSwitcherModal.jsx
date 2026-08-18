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
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(11, 20, 26, 0.5)",
        zIndex: 100,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
      }}
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: "#ffffff",
          borderRadius: 12,
          padding: 24,
          maxWidth: 420,
          width: "100%",
          boxShadow: "0 10px 25px rgba(0, 0, 0, 0.2)",
          position: "relative",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h3 style={{ margin: 0, fontSize: 18, color: "#0f172a" }}>Switch Connection</h3>
          <button
            onClick={onClose}
            style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }}
          >
            <CloseIcon size={20} color="#64748b" />
          </button>
        </div>

        <p style={{ fontSize: 13, color: "#64748b", margin: "0 0 16px", lineHeight: 1.4 }}>
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
              border: "1px solid #cbd5e1",
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
              background: "#00a884",
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

        <div style={{ marginTop: 16, paddingTop: 14, borderTop: "1px solid #f1f5f9", textAlign: "center" }}>
          <a
            href="/setup"
            style={{ color: "#008069", fontSize: 13, textDecoration: "none", fontWeight: 600 }}
          >
            + Create New Connection Setup
          </a>
        </div>
      </div>
    </div>
  );
}
