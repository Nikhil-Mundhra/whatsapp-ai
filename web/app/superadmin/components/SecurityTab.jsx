"use client";

import React from "react";
import {
  PasskeyIcon,
  FingerprintIcon,
  CheckIcon,
  WarningIcon,
  CloseIcon,
  KeyIcon,
  TicketIcon,
  CopyIcon,
  RefreshIcon,
  LockIcon,
} from "../../components/Icons/WhatsAppIcons";
import { formatTimeAgo } from "./utils";

export default function SecurityTab({
  passkeys,
  handleRegisterPasskey,
  registerPasskeyLoading,
  registerPasskeySuccess,
  registerPasskeyError,
  handleDeletePasskey,
  activeCoupon,
  handleCopyCoupon,
  couponCopied,
  showCustomCoupon,
  setShowCustomCoupon,
  customCouponInput,
  setCustomCouponInput,
  handleRefreshCoupon,
  couponLoading,
}) {
  return (
    <>
      {/* Section 1: Apple Passkeys & Biometric 2FA */}
      <div
        style={{
          backgroundColor: "var(--wa-card-bg)",
          border: "1px solid var(--wa-card-border)",
          borderRadius: 10,
          padding: "20px 24px",
          marginBottom: "24px",
          boxShadow: "0 2px 8px rgba(0, 168, 132, 0.08)",
        }}
      >
        <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: 16, marginBottom: passkeys.length > 0 ? 18 : 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div
              style={{
                width: 46,
                height: 46,
                borderRadius: 10,
                backgroundColor: "rgba(0, 168, 132, 0.15)",
                color: "var(--wa-teal)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <PasskeyIcon size={24} color="var(--wa-teal)" />
            </div>
            <div>
              <div style={{ fontSize: "16px", fontWeight: "700", color: "var(--wa-text-primary)", display: "flex", alignItems: "center", gap: 8 }}>
                <span>Apple Passkeys &amp; Biometric 2FA</span>
                <span style={{ fontSize: "11px", padding: "2px 8px", borderRadius: 4, backgroundColor: "rgba(0, 168, 132, 0.15)", color: "var(--wa-teal)", fontWeight: "600" }}>
                  Skips WhatsApp OTP
                </span>
              </div>
              <div style={{ fontSize: "13px", color: "var(--wa-text-secondary)", marginTop: 3 }}>
                Hardware-bound Secure Enclave credentials (Touch ID, Face ID, and iCloud Keychain) providing sub-second biometric access without 2FA codes.
              </div>
            </div>
          </div>

          <button
            onClick={handleRegisterPasskey}
            disabled={registerPasskeyLoading}
            className="wa-btn-primary-gradient"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "10px 18px",
              borderRadius: 8,
              fontSize: "13px",
              fontWeight: "700",
              cursor: registerPasskeyLoading ? "not-allowed" : "pointer",
              boxShadow: "0 2px 8px rgba(0, 168, 132, 0.2)",
            }}
          >
            <FingerprintIcon size={16} color="#ffffff" />
            <span>{registerPasskeyLoading ? "Enrolling Biometrics..." : "Enroll This Device (Touch ID / Face ID)"}</span>
          </button>
        </div>

        {registerPasskeySuccess && (
          <div style={{ marginTop: 14, padding: "10px 14px", borderRadius: 8, backgroundColor: "rgba(16, 185, 129, 0.12)", border: "1px solid rgba(16, 185, 129, 0.3)", color: "#10b981", fontSize: "13px", display: "flex", alignItems: "center", gap: 8 }}>
            <CheckIcon size={16} color="#10b981" />
            <span>{registerPasskeySuccess}</span>
          </div>
        )}

        {registerPasskeyError && (
          <div style={{ marginTop: 14, padding: "10px 14px", borderRadius: 8, backgroundColor: "rgba(239, 68, 68, 0.12)", border: "1px solid rgba(239, 68, 68, 0.3)", color: "#ef4444", fontSize: "13px", display: "flex", alignItems: "center", gap: 8 }}>
            <WarningIcon size={16} color="#ef4444" />
            <span>{registerPasskeyError}</span>
          </div>
        )}

        {passkeys.length > 0 ? (
          <div style={{ borderTop: "1px solid var(--wa-border)", paddingTop: 16, marginTop: 16 }}>
            <div style={{ fontSize: "12px", fontWeight: "700", textTransform: "uppercase", color: "var(--wa-text-muted)", marginBottom: 12, letterSpacing: "0.5px" }}>
              Enrolled Hardware Credentials ({passkeys.length})
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 12 }}>
              {passkeys.map((pk) => (
                <div
                  key={pk.id}
                  style={{
                    padding: "14px 16px",
                    borderRadius: 8,
                    backgroundColor: "var(--wa-search-input)",
                    border: "1px solid var(--wa-border)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 12,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: "50%",
                        backgroundColor: "rgba(0, 168, 132, 0.12)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <FingerprintIcon size={18} color="var(--wa-teal)" />
                    </div>
                    <div>
                      <div style={{ fontSize: "14px", fontWeight: "600", color: "var(--wa-text-primary)" }}>
                        {pk.name}
                      </div>
                      <div style={{ fontSize: "11px", color: "var(--wa-text-secondary)", marginTop: 2 }}>
                        Key: <code style={{ fontFamily: "monospace" }}>{pk.idMasked}</code> • Last used: {formatTimeAgo(pk.lastUsedAt)}
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => handleDeletePasskey(pk.id)}
                    title="Revoke and remove this passkey"
                    style={{
                      padding: "6px 10px",
                      borderRadius: 6,
                      backgroundColor: "rgba(220, 38, 38, 0.1)",
                      border: "1px solid rgba(220, 38, 38, 0.2)",
                      color: "#ef4444",
                      cursor: "pointer",
                      fontSize: "12px",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 4,
                    }}
                  >
                    <CloseIcon size={12} color="#ef4444" />
                    <span>Revoke</span>
                  </button>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div
            style={{
              borderTop: "1px solid var(--wa-border)",
              paddingTop: 16,
              marginTop: 16,
              color: "var(--wa-text-secondary)",
              fontSize: "13px",
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <KeyIcon size={16} color="var(--wa-text-muted)" />
            <span>No Apple Passkey enrolled yet. Click <strong>Enroll This Device</strong> above to register Touch ID or Face ID.</span>
          </div>
        )}
      </div>

      {/* Section 2: VIP Registration Onboarding Coupons */}
      <div
        style={{
          backgroundColor: "var(--wa-card-bg)",
          border: "1px solid var(--wa-card-border)",
          borderRadius: 10,
          padding: "20px 24px",
          marginBottom: "24px",
          boxShadow: "0 2px 8px rgba(0, 168, 132, 0.08)",
        }}
      >
        <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div
              style={{
                width: 46,
                height: 46,
                borderRadius: 10,
                backgroundColor: "rgba(0, 168, 132, 0.15)",
                color: "var(--wa-teal)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <TicketIcon size={24} color="var(--wa-teal)" />
            </div>
            <div>
              <div style={{ fontSize: "16px", fontWeight: "700", color: "var(--wa-text-primary)" }}>
                VIP Registration Onboarding Coupons
              </div>
              <div style={{ fontSize: "13px", color: "var(--wa-text-secondary)", marginTop: 3 }}>
                Single-use authorization codes required for users onboarding at <code style={{ fontFamily: "monospace" }}>/setup</code>.
              </div>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            {showCustomCoupon ? (
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <input
                  type="text"
                  placeholder="CUSTOM-CODE"
                  value={customCouponInput}
                  onChange={(e) => setCustomCouponInput(e.target.value.toUpperCase())}
                  style={{
                    padding: "8px 12px",
                    backgroundColor: "var(--wa-search-input)",
                    border: "1px solid var(--wa-teal)",
                    borderRadius: 6,
                    color: "var(--wa-text-primary)",
                    fontSize: "13px",
                    fontWeight: "700",
                    fontFamily: "monospace",
                    outline: "none",
                    width: 150,
                  }}
                />
                <button
                  onClick={() => customCouponInput.trim() && handleRefreshCoupon(customCouponInput.trim())}
                  disabled={couponLoading || !customCouponInput.trim()}
                  style={{
                    padding: "8px 14px",
                    backgroundColor: "var(--wa-teal)",
                    color: "#ffffff",
                    border: "none",
                    borderRadius: 6,
                    fontSize: "12px",
                    fontWeight: "600",
                    cursor: "pointer",
                  }}
                >
                  Set
                </button>
                <button
                  onClick={() => {
                    setShowCustomCoupon(false);
                    setCustomCouponInput("");
                  }}
                  style={{
                    padding: "8px 10px",
                    backgroundColor: "transparent",
                    color: "var(--wa-text-muted)",
                    border: "1px solid var(--wa-border)",
                    borderRadius: 6,
                    fontSize: "12px",
                    cursor: "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                  }}
                >
                  <CloseIcon size={12} color="var(--wa-text-muted)" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => setShowCustomCoupon(true)}
                style={{
                  padding: "8px 14px",
                  backgroundColor: "var(--wa-btn-secondary-bg)",
                  border: "1px solid var(--wa-border)",
                  borderRadius: 6,
                  color: "var(--wa-text-primary)",
                  fontSize: "12px",
                  fontWeight: "600",
                  cursor: "pointer",
                }}
              >
                Custom Coupon
              </button>
            )}

            <button
              onClick={() => handleRefreshCoupon()}
              disabled={couponLoading}
              title="Generate a new valid registration coupon"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "8px 16px",
                backgroundColor: "var(--wa-teal)",
                color: "#ffffff",
                border: "none",
                borderRadius: 6,
                fontSize: "12px",
                fontWeight: "600",
                cursor: couponLoading ? "not-allowed" : "pointer",
                boxShadow: "0 1px 3px rgba(0,0,0,0.12)",
              }}
            >
              <span style={{ display: "inline-flex", alignItems: "center", transform: couponLoading ? "rotate(360deg)" : "none", transition: "transform 0.5s" }}>
                <RefreshIcon size={13} color="#ffffff" />
              </span>
              <span>{couponLoading ? "Generating..." : "Generate New Coupon"}</span>
            </button>

            <a
              href={`https://wa.me/?text=${encodeURIComponent(
                `Here is your WhatsApp AI Setup Access Coupon: *${activeCoupon}*\n\nGet started here: https://whatsapp-ai-nikhil.vercel.app/setup`
              )}`}
              target="_blank"
              rel="noreferrer"
              title="Share Coupon via WhatsApp"
              style={{
                padding: "8px 14px",
                backgroundColor: "rgba(37, 211, 102, 0.15)",
                border: "1px solid rgba(37, 211, 102, 0.3)",
                borderRadius: 6,
                color: "#10b981",
                fontSize: "12px",
                fontWeight: "600",
                textDecoration: "none",
                display: "flex",
                alignItems: "center",
                gap: 4,
              }}
            >
              Share ↗
            </a>
          </div>
        </div>

        <div
          style={{
            marginTop: 18,
            padding: "16px 20px",
            borderRadius: 8,
            backgroundColor: "var(--wa-search-input)",
            border: "1px solid var(--wa-border)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 16,
            flexWrap: "wrap",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <span style={{ fontSize: "12px", fontWeight: "700", textTransform: "uppercase", color: "var(--wa-text-muted)" }}>
              Active Registration Code:
            </span>
            <span
              style={{
                fontSize: "20px",
                fontWeight: "800",
                fontFamily: "monospace",
                letterSpacing: "2px",
                padding: "4px 14px",
                borderRadius: 6,
                backgroundColor: "var(--wa-card-bg)",
                border: "1px solid var(--wa-teal)",
                color: "var(--wa-teal)",
              }}
            >
              {activeCoupon || "LOADING..."}
            </span>
          </div>

          <button
            onClick={handleCopyCoupon}
            title="Copy Coupon"
            style={{
              padding: "6px 14px",
              borderRadius: 6,
              backgroundColor: couponCopied ? "rgba(16, 185, 129, 0.15)" : "var(--wa-btn-secondary-bg)",
              border: couponCopied ? "1px solid #10b981" : "1px solid var(--wa-border)",
              color: couponCopied ? "#10b981" : "var(--wa-text-primary)",
              fontSize: "12px",
              fontWeight: "600",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            {couponCopied ? (
              <>
                <CheckIcon size={13} color="#10b981" />
                <span>Copied to Clipboard!</span>
              </>
            ) : (
              <>
                <CopyIcon size={13} color="currentColor" />
                <span>Copy Code</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Section 3: Master Superadmin Security & Policy Controls */}
      <div
        style={{
          backgroundColor: "var(--wa-card-bg)",
          border: "1px solid var(--wa-card-border)",
          borderRadius: 10,
          padding: "20px 24px",
          boxShadow: "0 2px 8px rgba(0, 168, 132, 0.08)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 18 }}>
          <div
            style={{
              width: 46,
              height: 46,
              borderRadius: 10,
              backgroundColor: "rgba(0, 168, 132, 0.15)",
              color: "var(--wa-teal)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <LockIcon size={24} color="var(--wa-teal)" />
          </div>
          <div>
            <div style={{ fontSize: "16px", fontWeight: "700", color: "var(--wa-text-primary)" }}>
              Superadmin Security &amp; Access Policies
            </div>
            <div style={{ fontSize: "13px", color: "var(--wa-text-secondary)", marginTop: 3 }}>
              Multi-factor authentication, cryptographic session cookies, and brute-force protections.
            </div>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 14 }}>
          <div style={{ padding: "16px", borderRadius: 8, backgroundColor: "var(--wa-search-input)", border: "1px solid var(--wa-border)" }}>
            <div style={{ fontSize: "12px", color: "var(--wa-text-muted)", fontWeight: "600", textTransform: "uppercase", marginBottom: 6 }}>
              WhatsApp 2FA Phone
            </div>
            <div style={{ fontSize: "16px", fontWeight: "700", color: "var(--wa-text-primary)", fontFamily: "monospace" }}>
              +91 •••••• 0033
            </div>
            <div style={{ fontSize: "12px", color: "var(--wa-teal)", marginTop: 4, fontWeight: "600" }}>
              Active 2FA SMS/WhatsApp fallback
            </div>
          </div>

          <div style={{ padding: "16px", borderRadius: 8, backgroundColor: "var(--wa-search-input)", border: "1px solid var(--wa-border)" }}>
            <div style={{ fontSize: "12px", color: "var(--wa-text-muted)", fontWeight: "600", textTransform: "uppercase", marginBottom: 6 }}>
              Brute-Force Lockout Defense
            </div>
            <div style={{ fontSize: "16px", fontWeight: "700", color: "var(--wa-text-primary)" }}>
              5 Attempts Max
            </div>
            <div style={{ fontSize: "12px", color: "var(--wa-text-secondary)", marginTop: 4 }}>
              15-minute IP lockout on consecutive failures
            </div>
          </div>

          <div style={{ padding: "16px", borderRadius: 8, backgroundColor: "var(--wa-search-input)", border: "1px solid var(--wa-border)" }}>
            <div style={{ fontSize: "12px", color: "var(--wa-text-muted)", fontWeight: "600", textTransform: "uppercase", marginBottom: 6 }}>
              Session Cookie Policy
            </div>
            <div style={{ fontSize: "16px", fontWeight: "700", color: "var(--wa-text-primary)" }}>
              7-Day Rolling JWT
            </div>
            <div style={{ fontSize: "12px", color: "var(--wa-text-secondary)", marginTop: 4 }}>
              <code style={{ fontFamily: "monospace" }}>HttpOnly; SameSite=Strict; Secure</code>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
