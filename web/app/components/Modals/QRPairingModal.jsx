"use client";

import { CloseIcon, RefreshIcon } from "../Icons/WhatsAppIcons";

export function QRPairingModal({
  isOpen,
  onClose,
  qrDataUrl,
  timeLeft = 20,
  onRefreshQr,
}) {
  if (!isOpen) return null;

  return (
    <div
      className="wa-drawer-backdrop"
      style={{
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
      }}
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: "var(--wa-modal-bg)",
          borderRadius: 12,
          padding: 28,
          maxWidth: 520,
          width: "100%",
          border: "1px solid var(--wa-modal-border)",
          boxShadow: "0 10px 30px rgba(0, 0, 0, 0.4)",
          position: "relative",
          textAlign: "center",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          style={{
            position: "absolute",
            top: 16,
            right: 16,
            background: "none",
            border: "none",
            cursor: "pointer",
          }}
        >
          <CloseIcon size={20} color="var(--wa-text-secondary)" />
        </button>

        <h3 style={{ fontSize: 20, margin: "0 0 8px", color: "var(--wa-text-primary)" }}>
          Link WhatsApp with Take-Over
        </h3>
        <p style={{ fontSize: 13, color: "var(--wa-text-secondary)", margin: "0 0 20px" }}>
          Scan the QR code with WhatsApp on your phone to link your session.
        </p>

        {/* QR Code Frame */}
        <div
          style={{
            background: "#ffffff",
            border: "1px solid var(--wa-border)",
            borderRadius: 12,
            padding: 16,
            display: "inline-block",
            marginBottom: 16,
          }}
        >
          {qrDataUrl ? (
            <img
              src={qrDataUrl}
              alt="WhatsApp QR Code"
              style={{ width: 220, height: 220, display: "block" }}
            />
          ) : (
            <div
              style={{
                width: 220,
                height: 220,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "var(--wa-text-secondary)",
                fontSize: 13,
              }}
            >
              Loading QR Code...
            </div>
          )}
        </div>

        {/* Instructions */}
        <ol
          style={{
            textAlign: "left",
            margin: "0 auto 20px",
            paddingLeft: 20,
            fontSize: 13,
            color: "var(--wa-text-secondary)",
            maxWidth: 380,
            lineHeight: 1.6,
          }}
        >
          <li>Open WhatsApp on your phone</li>
          <li>Tap <strong>Menu</strong> (Android) or <strong>Settings</strong> (iPhone)</li>
          <li>Tap <strong>Linked Devices</strong> and then <strong>Link a Device</strong></li>
          <li>Point your phone at this screen to capture the code</li>
        </ol>

        {/* Refresh Timer */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12 }}>
          <span style={{ fontSize: 12, color: "var(--wa-text-secondary)" }}>
            Code refreshes in {timeLeft}s
          </span>
          <button
            onClick={onRefreshQr}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              background: "var(--wa-btn-secondary-bg)",
              border: "1px solid var(--wa-btn-secondary-border)",
              borderRadius: 6,
              padding: "6px 12px",
              fontSize: 12,
              color: "var(--wa-text-primary)",
              cursor: "pointer",
            }}
          >
            <RefreshIcon size={14} color="var(--wa-text-primary)" />
            <span>Refresh Now</span>
          </button>
        </div>
      </div>
    </div>
  );
}
