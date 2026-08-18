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
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(11, 20, 26, 0.6)",
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
          padding: 28,
          maxWidth: 520,
          width: "100%",
          boxShadow: "0 10px 30px rgba(0, 0, 0, 0.25)",
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
          <CloseIcon size={20} color="#64748b" />
        </button>

        <h3 style={{ fontSize: 20, margin: "0 0 8px", color: "#0f172a" }}>
          Link WhatsApp with Take-Over
        </h3>
        <p style={{ fontSize: 13, color: "#64748b", margin: "0 0 20px" }}>
          Scan the QR code with WhatsApp on your phone to link your session.
        </p>

        {/* QR Code Frame */}
        <div
          style={{
            background: "#f8fafc",
            border: "1px solid #e2e8f0",
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
                color: "#64748b",
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
            fontSize: 13,
            color: "#334155",
            margin: "0 auto 16px",
            maxWidth: 360,
            paddingLeft: 20,
            lineHeight: 1.6,
          }}
        >
          <li>Open WhatsApp on your phone</li>
          <li>Tap <strong>Settings</strong> or <strong>Menu</strong> &gt; <strong>Linked Devices</strong></li>
          <li>Tap <strong>Link a Device</strong> and point your camera here</li>
        </ol>

        <button
          onClick={onRefreshQr}
          style={{
            background: "#f0f2f5",
            border: "1px solid #cbd5e1",
            borderRadius: 6,
            padding: "6px 14px",
            fontSize: 12,
            fontWeight: 600,
            color: "#475569",
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <RefreshIcon size={14} color="#475569" />
          <span>Refresh QR ({timeLeft}s)</span>
        </button>
      </div>
    </div>
  );
}
