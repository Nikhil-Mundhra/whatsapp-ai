"use client";

import { useState, useEffect, useRef } from "react";
import { CloseIcon, LockIcon } from "../Icons/WhatsAppIcons";

export function ConnectionSwitcherModal({
  isOpen,
  onClose,
  currentHash,
  onSwitchHash,
}) {
  const [step, setStep] = useState(1); // 1: code, 2: otp
  const [inputCode, setInputCode] = useState(currentHash || "");
  const [otp, setOtp] = useState("");
  const [maskedPhone, setMaskedPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [resendCooldown, setResendCooldown] = useState(0);
  const resendTimerRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      setStep(1);
      setInputCode(currentHash || "");
      setOtp("");
      setError("");
      setMaskedPhone("");
      setResendCooldown(0);
    }
  }, [isOpen, currentHash]);

  useEffect(() => {
    if (resendCooldown > 0) {
      resendTimerRef.current = setInterval(() => {
        setResendCooldown((prev) => {
          if (prev <= 1) {
            clearInterval(resendTimerRef.current);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => clearInterval(resendTimerRef.current);
  }, [resendCooldown]);

  if (!isOpen) return null;

  async function handleSendOtp(e) {
    if (e) e.preventDefault();
    const clean = inputCode.trim().toUpperCase();
    if (!clean) {
      setError("Please enter a connection code");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const res = await fetch(`/api/connections/${clean}/otp/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to send verification code");
      }

      setMaskedPhone(data.maskedPhone || "");
      setStep(2);
      setResendCooldown(30);
    } catch (err) {
      setError(err.message || "Failed to send verification code. Please check your connection code.");
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyOtp(e) {
    if (e) e.preventDefault();
    const clean = inputCode.trim().toUpperCase();
    const cleanOtp = otp.trim();

    if (!cleanOtp) {
      setError("Please enter the 6-digit OTP code");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const res = await fetch(`/api/connections/${clean}/otp/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ otp: cleanOtp }),
      });
      const data = await res.json();

      if (!res.ok || !data.valid) {
        throw new Error(data.error || "Invalid verification code");
      }

      onSwitchHash(clean, data.token);
      onClose();
    } catch (err) {
      setError(err.message || "Verification failed. Please check the code sent to your WhatsApp.");
    } finally {
      setLoading(false);
    }
  }

  function handleOtpChange(val) {
    const clean = val.replace(/\D/g, "").slice(0, 6);
    setOtp(clean);
    if (clean.length === 6 && !loading) {
      setError("");
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
          borderRadius: 14,
          padding: 24,
          maxWidth: 420,
          width: "100%",
          border: "1px solid var(--wa-modal-border)",
          boxShadow: "0 12px 36px rgba(0, 0, 0, 0.4)",
          position: "relative",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h3 style={{ margin: 0, fontSize: 18, color: "var(--wa-text-primary)" }}>
            {step === 1 ? "Switch Connection" : "Verify WhatsApp OTP"}
          </h3>
          <button
            onClick={onClose}
            style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }}
          >
            <CloseIcon size={20} color="var(--wa-text-secondary)" />
          </button>
        </div>

        {error && (
          <div
            style={{
              background: "rgba(239, 68, 68, 0.12)",
              border: "1px solid rgba(239, 68, 68, 0.35)",
              color: "#ef4444",
              borderRadius: 8,
              padding: "8px 12px",
              fontSize: 13,
              marginBottom: 14,
            }}
          >
            {error}
          </div>
        )}

        {step === 1 ? (
          <form onSubmit={handleSendOtp} style={{ display: "grid", gap: 14 }}>
            <p style={{ fontSize: 13, color: "var(--wa-text-secondary)", margin: 0, lineHeight: 1.4 }}>
              Enter the 6-character connection code you want to switch to. We will send an OTP via WhatsApp to the owner&apos;s phone.
            </p>

            <input
              type="text"
              maxLength={8}
              value={inputCode}
              onChange={(e) => setInputCode(e.target.value.toUpperCase())}
              placeholder="e.g. K9X2P4"
              autoFocus
              disabled={loading}
              style={{
                padding: "10px 14px",
                borderRadius: 8,
                border: "1px solid var(--wa-border-strong)",
                backgroundColor: "var(--wa-input-bg)",
                color: "var(--wa-text-primary)",
                fontSize: 18,
                fontWeight: 700,
                letterSpacing: 2,
                textAlign: "center",
                textTransform: "uppercase",
                outline: "none",
              }}
            />

            <button
              type="submit"
              disabled={loading || !inputCode.trim()}
              style={{
                background: "var(--wa-teal)",
                color: "#ffffff",
                border: "none",
                borderRadius: 8,
                padding: "11px",
                fontSize: 14,
                fontWeight: 600,
                cursor: loading || !inputCode.trim() ? "not-allowed" : "pointer",
                opacity: loading || !inputCode.trim() ? 0.6 : 1,
              }}
            >
              {loading ? "Sending WhatsApp Code…" : "Send Verification OTP →"}
            </button>
          </form>
        ) : (
          <form onSubmit={handleVerifyOtp} style={{ display: "grid", gap: 14 }}>
            <div>
              <p style={{ fontSize: 13, color: "var(--wa-text-secondary)", margin: 0, lineHeight: 1.4 }}>
                Enter the 6-digit OTP sent to WhatsApp:
              </p>
              {maskedPhone && (
                <div
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    background: "var(--wa-card-bg)",
                    border: "1px solid var(--wa-border)",
                    padding: "3px 8px",
                    borderRadius: 6,
                    marginTop: 6,
                    fontSize: 12,
                    fontWeight: 600,
                    color: "var(--wa-text-primary)",
                  }}
                >
                  <span>📱</span>
                  <code>{maskedPhone}</code>
                </div>
              )}
            </div>

            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              value={otp}
              onChange={(e) => handleOtpChange(e.target.value)}
              placeholder="• • • • • •"
              autoFocus
              disabled={loading}
              style={{
                padding: "10px 14px",
                borderRadius: 8,
                border: "1px solid var(--wa-border-strong)",
                backgroundColor: "var(--wa-input-bg)",
                color: "var(--wa-text-primary)",
                fontSize: 22,
                fontWeight: 700,
                letterSpacing: 6,
                textAlign: "center",
                outline: "none",
              }}
            />

            <button
              type="submit"
              disabled={loading || otp.length < 6}
              style={{
                background: "var(--wa-teal)",
                color: "#ffffff",
                border: "none",
                borderRadius: 8,
                padding: "11px",
                fontSize: 14,
                fontWeight: 600,
                cursor: loading || otp.length < 6 ? "not-allowed" : "pointer",
                opacity: loading || otp.length < 6 ? 0.6 : 1,
              }}
            >
              {loading ? "Verifying…" : "Verify & Switch Connection ✓"}
            </button>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <button
                type="button"
                onClick={() => {
                  setStep(1);
                  setOtp("");
                  setError("");
                }}
                style={{
                  background: "none",
                  border: "none",
                  color: "var(--wa-text-secondary)",
                  fontSize: 12,
                  cursor: "pointer",
                  padding: "4px 0",
                }}
              >
                ← Back
              </button>

              {resendCooldown > 0 ? (
                <span style={{ fontSize: 12, color: "var(--wa-text-muted)" }}>
                  Resend in {resendCooldown}s
                </span>
              ) : (
                <button
                  type="button"
                  onClick={handleSendOtp}
                  disabled={loading}
                  style={{
                    background: "none",
                    border: "none",
                    color: "var(--wa-teal)",
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: "pointer",
                    padding: "4px 0",
                  }}
                >
                  🔄 Resend Code
                </button>
              )}
            </div>
          </form>
        )}

        <div
          style={{
            marginTop: 16,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 5,
            color: "var(--wa-text-muted)",
            fontSize: 11,
          }}
        >
          <LockIcon size={11} color="var(--wa-text-muted)" />
          <span>WhatsApp 2FA Protected</span>
        </div>
      </div>
    </div>
  );
}

