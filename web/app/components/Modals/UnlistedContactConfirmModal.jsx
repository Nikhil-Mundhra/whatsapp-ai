"use client";

import { useState } from "react";
import { CloseIcon, RobotIcon } from "../Icons/WhatsAppIcons";

export function WarningTriangleIcon({ size = 22, color = "#f59e0b" }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke={color}
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
}

export function UnlistedContactConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  contact = "",
  contactName = "",
  actionDescription = "take over conversation",
}) {
  const [addToWhitelist, setAddToWhitelist] = useState(false);
  const [confirming, setConfirming] = useState(false);

  if (!isOpen) return null;

  const displayName = contactName || contact || "This contact";

  async function handleProceed() {
    setConfirming(true);
    try {
      await onConfirm({ addToWhitelist });
      onClose();
    } finally {
      setConfirming(false);
    }
  }

  return (
    <div className="wa-drawer-backdrop" onClick={onClose}>
      <div
        style={{
          maxWidth: 440,
          width: "92%",
          borderRadius: 14,
          overflow: "hidden",
          background: "var(--wa-modal-bg)",
          border: "1px solid var(--wa-modal-border)",
          boxShadow: "0 14px 38px rgba(0,0,0,0.45)",
          margin: "auto",
          animation: "fadeIn 0.15s ease-out",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            background: "linear-gradient(135deg, #78350f, #92400e)",
            color: "#ffffff",
            padding: "16px 20px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div
              style={{
                width: 34,
                height: 34,
                borderRadius: "50%",
                background: "rgba(255, 255, 255, 0.15)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <WarningTriangleIcon size={20} color="#fbbf24" />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, letterSpacing: -0.2 }}>
                Unlisted Contact Warning
              </h3>
              <span style={{ fontSize: 11, color: "#fef3c7", opacity: 0.9 }}>
                Take-Over Permission Guard
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: 4,
              color: "#ffffff",
              display: "flex",
              alignItems: "center",
            }}
          >
            <CloseIcon size={20} color="#ffffff" />
          </button>
        </div>

        {/* Content Body */}
        <div style={{ padding: "20px" }}>
          {/* Contact Highlight Box */}
          <div
            style={{
              background: "rgba(245, 158, 11, 0.08)",
              border: "1px solid rgba(245, 158, 11, 0.3)",
              borderRadius: 10,
              padding: "12px 14px",
              marginBottom: 16,
              display: "flex",
              alignItems: "center",
              gap: 12,
            }}
          >
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: "50%",
                background: "linear-gradient(135deg, #d97706, #b45309)",
                color: "#ffffff",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontWeight: 700,
                fontSize: 14,
                flexShrink: 0,
              }}
            >
              {displayName.slice(0, 2).toUpperCase()}
            </div>
            <div style={{ overflow: "hidden" }}>
              <div
                style={{
                  fontWeight: 700,
                  fontSize: 14,
                  color: "var(--wa-text-primary)",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {displayName}
              </div>
              <div
                style={{
                  fontSize: 11.5,
                  color: "var(--wa-text-muted)",
                  marginTop: 2,
                }}
              >
                {contact && contact !== displayName ? contact : "WhatsApp Contact"}
              </div>
            </div>
          </div>

          {/* Warning explanation text */}
          <p
            style={{
              margin: "0 0 14px",
              fontSize: 13,
              color: "var(--wa-text-secondary)",
              lineHeight: 1.5,
            }}
          >
            <strong style={{ color: "var(--wa-text-primary)" }}>{displayName}</strong> is not part of your configured{" "}
            <code
              style={{
                background: "var(--wa-code-bg)",
                padding: "2px 6px",
                borderRadius: 4,
                fontSize: 11.5,
                fontWeight: 600,
                color: "#f59e0b",
              }}
            >
              ALLOWED_RECIPIENTS
            </code>{" "}
            list.
          </p>

          <p
            style={{
              margin: "0 0 16px",
              fontSize: 12.5,
              color: "var(--wa-text-muted)",
              lineHeight: 1.45,
            }}
          >
            Autonomous rules normally ignore messages from this contact. Proceeding will explicitly grant the AI permission to {actionDescription}.
          </p>

          {/* Checkbox: Also add to ALLOWED_RECIPIENTS */}
          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "10px 12px",
              background: "var(--wa-popover-bg)",
              border: "1px solid var(--wa-border)",
              borderRadius: 8,
              cursor: "pointer",
              userSelect: "none",
              marginBottom: 20,
            }}
          >
            <input
              type="checkbox"
              checked={addToWhitelist}
              onChange={(e) => setAddToWhitelist(e.target.checked)}
              style={{
                width: 16,
                height: 16,
                accentColor: "var(--wa-teal)",
                cursor: "pointer",
              }}
            />
            <span style={{ fontSize: 12.5, color: "var(--wa-text-primary)", fontWeight: 500 }}>
              Also add this contact to <strong style={{ color: "var(--wa-teal)" }}>ALLOWED_RECIPIENTS</strong> permanently
            </span>
          </label>

          {/* Action Buttons */}
          <div style={{ display: "flex", gap: 10 }}>
            <button
              type="button"
              onClick={onClose}
              disabled={confirming}
              style={{
                flex: 1,
                padding: "10px 16px",
                background: "var(--wa-card-bg)",
                border: "1px solid var(--wa-border)",
                borderRadius: 8,
                color: "var(--wa-text-secondary)",
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Cancel
            </button>

            <button
              type="button"
              onClick={handleProceed}
              disabled={confirming}
              style={{
                flex: 1.5,
                padding: "10px 16px",
                background: "linear-gradient(135deg, #d97706, #b45309)",
                border: "none",
                borderRadius: 8,
                color: "#ffffff",
                fontSize: 13,
                fontWeight: 700,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
                boxShadow: "0 2px 8px rgba(217, 119, 6, 0.35)",
              }}
            >
              <RobotIcon size={16} color="#ffffff" />
              <span>{confirming ? "Arming Take-Over..." : "Proceed Take-Over"}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
