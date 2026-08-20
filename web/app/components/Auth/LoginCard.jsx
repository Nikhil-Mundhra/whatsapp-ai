"use client";

import { useState, useEffect, useRef } from "react";
import { LockIcon, RobotIcon } from "../Icons/WhatsAppIcons";

export function LoginCard({
  initialHash = "",
  onLoginSuccess,
  theme = "dark",
  onThemeChange,
}) {
  const [step, setStep] = useState(1); // 1: Enter Code, 2: Enter OTP
  const [hash, setHash] = useState(initialHash || "");
  const [otp, setOtp] = useState("");
  const [maskedPhone, setMaskedPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [resendCooldown, setResendCooldown] = useState(0);
  const resendTimerRef = useRef(null);

  useEffect(() => {
    if (initialHash) {
      setHash(initialHash.toUpperCase());
    }
  }, [initialHash]);

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

  // Handle Step 1: Send OTP to WhatsApp
  async function handleSendOtp(e) {
    if (e) e.preventDefault();
    const cleanHash = hash.trim().toUpperCase();
    if (!cleanHash) {
      setError("Please enter your 6-character connection code.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const res = await fetch(`/api/connections/${cleanHash}/otp/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to send verification code");
      }

      setMaskedPhone(data.maskedPhone || "");
      setStep(2);
      setResendCooldown(30); // 30-second cooldown
    } catch (err) {
      setError(err.message || "Failed to send verification code. Please check your connection code.");
    } finally {
      setLoading(false);
    }
  }

  // Handle Step 2: Verify OTP
  async function handleVerifyOtp(e) {
    if (e) e.preventDefault();
    const cleanHash = hash.trim().toUpperCase();
    const cleanOtp = otp.trim();

    if (!cleanOtp) {
      setError("Please enter the 6-digit verification code.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const res = await fetch(`/api/connections/${cleanHash}/otp/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ otp: cleanOtp }),
      });
      const data = await res.json();

      if (!res.ok || !data.valid) {
        throw new Error(data.error || "Invalid verification code");
      }

      // Login success!
      if (onLoginSuccess) {
        onLoginSuccess({
          hash: cleanHash,
          token: data.token,
          expiresAt: data.expiresAt,
        });
      }
    } catch (err) {
      setError(err.message || "Verification failed. Please check the code sent to your WhatsApp.");
    } finally {
      setLoading(false);
    }
  }

  // Auto-submit OTP when 6 digits are reached
  function handleOtpChange(val) {
    const clean = val.replace(/\D/g, "").slice(0, 6);
    setOtp(clean);
    if (clean.length === 6 && !loading) {
      setError("");
    }
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
        backgroundColor: "var(--wa-bg)",
        color: "var(--wa-text-primary)",
        fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 440,
          backgroundColor: "var(--wa-modal-bg)",
          borderRadius: 16,
          border: "1px solid var(--wa-modal-border)",
          boxShadow: "0 20px 40px rgba(0, 0, 0, 0.35)",
          padding: 32,
          position: "relative",
        }}
      >
        {/* Top bar with theme toggle */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: "50%",
                backgroundColor: "var(--wa-teal)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <RobotIcon size={20} color="#ffffff" />
            </div>
            <div>
              <h2 style={{ fontSize: 17, fontWeight: 700, margin: 0, color: "var(--wa-text-primary)" }}>
                WhatsApp AI
              </h2>
              <span style={{ fontSize: 11, color: "var(--wa-text-muted)" }}>Take-Over Panel</span>
            </div>
          </div>

          {onThemeChange && (
            <button
              onClick={() => onThemeChange(theme === "dark" ? "light" : "dark")}
              title="Toggle Theme"
              style={{
                background: "var(--wa-card-bg)",
                border: "1px solid var(--wa-border)",
                borderRadius: 20,
                padding: "4px 10px",
                fontSize: 12,
                cursor: "pointer",
                color: "var(--wa-text-secondary)",
              }}
            >
              {theme === "dark" ? "☀️ Light" : "🌙 Dark"}
            </button>
          )}
        </div>

        {/* Error Alert */}
        {error && (
          <div
            style={{
              background: "rgba(239, 68, 68, 0.12)",
              border: "1px solid rgba(239, 68, 68, 0.35)",
              color: "#ef4444",
              borderRadius: 8,
              padding: "10px 14px",
              fontSize: 13,
              marginBottom: 20,
              lineHeight: 1.4,
            }}
          >
            {error}
          </div>
        )}

        {/* STEP 1: Enter 6-Character Connection Code */}
        {step === 1 && (
          <form onSubmit={handleSendOtp} style={{ display: "grid", gap: 18 }}>
            <div>
              <h3 style={{ fontSize: 18, fontWeight: 600, margin: "0 0 6px", color: "var(--wa-text-primary)" }}>
                Log in to Take-Over
              </h3>
              <p style={{ fontSize: 13, color: "var(--wa-text-secondary)", margin: 0, lineHeight: 1.4 }}>
                Enter your 6-character connection code. We will send a WhatsApp OTP to the owner&apos;s phone to verify access.
              </p>
            </div>

            <div style={{ display: "grid", gap: 6 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: "var(--wa-text-secondary)" }}>
                CONNECTION CODE
              </label>
              <input
                type="text"
                maxLength={8}
                value={hash}
                onChange={(e) => setHash(e.target.value.toUpperCase())}
                placeholder="e.g. K9X2P4"
                autoFocus
                disabled={loading}
                style={{
                  padding: "12px 16px",
                  borderRadius: 10,
                  border: "1px solid var(--wa-border-strong)",
                  backgroundColor: "var(--wa-input-bg)",
                  color: "var(--wa-text-primary)",
                  fontSize: 20,
                  fontWeight: 700,
                  letterSpacing: 3,
                  textAlign: "center",
                  textTransform: "uppercase",
                  outline: "none",
                }}
              />
            </div>

            <button
              type="submit"
              disabled={loading || !hash.trim()}
              style={{
                background: "var(--wa-teal)",
                color: "#ffffff",
                border: "none",
                borderRadius: 10,
                padding: "12px 18px",
                fontSize: 15,
                fontWeight: 600,
                cursor: loading || !hash.trim() ? "not-allowed" : "pointer",
                opacity: loading || !hash.trim() ? 0.6 : 1,
                boxShadow: "0 2px 6px rgba(0, 168, 132, 0.3)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                transition: "opacity 0.2s ease",
              }}
            >
              {loading ? "Sending WhatsApp Code…" : "Continue with WhatsApp →"}
            </button>

            <div
              style={{
                textAlign: "center",
                paddingTop: 8,
                borderTop: "1px solid var(--wa-border)",
                marginTop: 4,
              }}
            >
              <a
                href="/setup"
                style={{
                  color: "var(--wa-teal)",
                  fontSize: 13,
                  fontWeight: 600,
                  textDecoration: "none",
                }}
              >
                Set up a new connection →
              </a>
            </div>
          </form>
        )}

        {/* STEP 2: Enter WhatsApp OTP */}
        {step === 2 && (
          <form onSubmit={handleVerifyOtp} style={{ display: "grid", gap: 18 }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                <h3 style={{ fontSize: 18, fontWeight: 600, margin: 0, color: "var(--wa-text-primary)" }}>
                  Enter WhatsApp OTP
                </h3>
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 700,
                    color: "var(--wa-teal)",
                    background: "rgba(0, 168, 132, 0.12)",
                    padding: "2px 8px",
                    borderRadius: 6,
                    letterSpacing: 1,
                  }}
                >
                  {hash}
                </span>
              </div>
              <p style={{ fontSize: 13, color: "var(--wa-text-secondary)", margin: 0, lineHeight: 1.4 }}>
                We sent a 6-digit verification code to the owner&apos;s WhatsApp:
              </p>
              {maskedPhone && (
                <div
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    background: "var(--wa-card-bg)",
                    border: "1px solid var(--wa-border-strong)",
                    padding: "4px 10px",
                    borderRadius: 6,
                    marginTop: 8,
                    fontSize: 13,
                    fontWeight: 600,
                    color: "var(--wa-text-primary)",
                  }}
                >
                  <span>📱</span>
                  <code>{maskedPhone}</code>
                </div>
              )}
            </div>

            <div style={{ display: "grid", gap: 6 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: "var(--wa-text-secondary)" }}>
                6-DIGIT VERIFICATION CODE
              </label>
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
                  padding: "12px 16px",
                  borderRadius: 10,
                  border: "1px solid var(--wa-border-strong)",
                  backgroundColor: "var(--wa-input-bg)",
                  color: "var(--wa-text-primary)",
                  fontSize: 24,
                  fontWeight: 700,
                  letterSpacing: 8,
                  textAlign: "center",
                  outline: "none",
                }}
              />
            </div>

            <button
              type="submit"
              disabled={loading || otp.length < 6}
              style={{
                background: "var(--wa-teal)",
                color: "#ffffff",
                border: "none",
                borderRadius: 10,
                padding: "12px 18px",
                fontSize: 15,
                fontWeight: 600,
                cursor: loading || otp.length < 6 ? "not-allowed" : "pointer",
                opacity: loading || otp.length < 6 ? 0.6 : 1,
                boxShadow: "0 2px 6px rgba(0, 168, 132, 0.3)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                transition: "opacity 0.2s ease",
              }}
            >
              {loading ? "Verifying…" : "Verify & Log In ✓"}
            </button>

            {/* Resend and Back Controls */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: 4 }}>
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
                  fontSize: 13,
                  cursor: "pointer",
                  padding: "4px 0",
                }}
              >
                ← Change code
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
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: "pointer",
                    padding: "4px 0",
                  }}
                >
                  🔄 Resend OTP
                </button>
              )}
            </div>
          </form>
        )}

        {/* Security Footer */}
        <div
          style={{
            marginTop: 24,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
            color: "var(--wa-text-muted)",
            fontSize: 11,
          }}
        >
          <LockIcon size={12} color="var(--wa-text-muted)" />
          <span>Protected by WhatsApp 2-Factor Ownership Verification</span>
        </div>
      </div>
    </div>
  );
}
