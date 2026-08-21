"use client";

import { useState, useEffect, useRef } from "react";
import {
  LockIcon,
  RobotIcon,
  DoubleCheckIcon,
  SunIcon,
  MoonIcon,
  WarningIcon,
  CheckIcon,
  ZapIcon,
  ArrowRightIcon,
  ArrowLeftIcon,
  RefreshIcon,
  ClockIcon,
} from "../Icons/WhatsAppIcons";

export function LoginCard({
  initialHash = "",
  onLoginSuccess,
  theme = "dark",
  onThemeChange,
}) {
  const [step, setStep] = useState(1); // 1: Enter Code, 2: Enter OTP
  const [hash, setHash] = useState(initialHash || "");
  const [otpDigits, setOtpDigits] = useState(["", "", "", "", "", ""]);
  const [maskedPhone, setMaskedPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [resendCooldown, setResendCooldown] = useState(0);
  const [recentHash, setRecentHash] = useState("");
  const [bridgeWarning, setBridgeWarning] = useState("");

  const resendTimerRef = useRef(null);
  const pinInputRefs = useRef([]);
  const isSendingRef = useRef(false);
  const isVerifyingRef = useRef(false);

  useEffect(() => {
    if (initialHash) {
      setHash(initialHash.toUpperCase());
    }
  }, [initialHash]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("wa_hash");
      if (saved && saved !== hash) {
        setRecentHash(saved.toUpperCase());
      }
    } catch {}
  }, [hash]);

  // Countdown timer for OTP resend
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
  async function handleSendOtp(e, targetHash = hash) {
    if (e) e.preventDefault();
    if (isSendingRef.current) return;

    const cleanHash = (targetHash || hash).trim().toUpperCase();
    if (!cleanHash) {
      setError("Please enter your 6-character connection code.");
      return;
    }

    isSendingRef.current = true;
    setLoading(true);
    setError("");
    setBridgeWarning("");

    try {
      const res = await fetch(`/api/connections/${cleanHash}/otp/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(8000),
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to send verification code");
      }

      setMaskedPhone(data.maskedPhone || "");
      if (data.bridgeSent === false) {
        setBridgeWarning(
          `Delivery Note: WhatsApp bridge is currently offline (${data.bridgeError || "bridge not connected"}). Please make sure your WhatsApp bridge is paired.`
        );
      }
      setHash(cleanHash);
      setStep(2);
      setResendCooldown(30); // 30s cooldown
      setOtpDigits(["", "", "", "", "", ""]);
      setTimeout(() => {
        if (pinInputRefs.current[0]) pinInputRefs.current[0].focus();
      }, 100);
    } catch (err) {
      setError(err.message || "Failed to send verification code. Please verify your connection code.");
    } finally {
      isSendingRef.current = false;
      setLoading(false);
    }
  }

  // Handle Step 2: Verify OTP
  async function handleVerifyOtp(fullOtp) {
    if (isVerifyingRef.current) return;

    const cleanHash = hash.trim().toUpperCase();
    const cleanOtp = (fullOtp || otpDigits.join("")).trim();

    if (cleanOtp.length !== 6) {
      setError("Please enter the complete 6-digit verification code.");
      return;
    }

    isVerifyingRef.current = true;
    setLoading(true);
    setError("");

    try {
      const res = await fetch(`/api/connections/${cleanHash}/otp/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ otp: cleanOtp }),
        signal: AbortSignal.timeout(6000),
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
      isVerifyingRef.current = false;
      setLoading(false);
    }
  }

  // 6-digit PIN input handling
  function handlePinChange(index, value) {
    const digitsOnly = value.replace(/\D/g, "");
    if (!digitsOnly && value !== "") return;

    const newDigits = [...otpDigits];

    if (digitsOnly.length > 1) {
      // Pasted full code or multiple digits directly into input
      const chars = digitsOnly.slice(0, 6).split("");
      for (let i = 0; i < 6; i++) {
        newDigits[i] = chars[i] || "";
      }
      setOtpDigits(newDigits);
      const nextIndex = Math.min(chars.length, 5);
      if (pinInputRefs.current[nextIndex]) {
        pinInputRefs.current[nextIndex].focus();
      }
      if (chars.length === 6 && !isVerifyingRef.current) {
        handleVerifyOtp(chars.join(""));
      }
      return;
    }

    newDigits[index] = digitsOnly;
    setOtpDigits(newDigits);

    // Auto-advance to next input
    if (digitsOnly && index < 5) {
      if (pinInputRefs.current[index + 1]) {
        pinInputRefs.current[index + 1].focus();
      }
    }

    // Auto-submit if all 6 digits are entered
    if (newDigits.every((d) => d !== "") && newDigits.join("").length === 6 && !isVerifyingRef.current) {
      handleVerifyOtp(newDigits.join(""));
    }
  }

  function handlePinKeyDown(index, e) {
    if (e.key === "Backspace") {
      if (!otpDigits[index] && index > 0) {
        const newDigits = [...otpDigits];
        newDigits[index - 1] = "";
        setOtpDigits(newDigits);
        if (pinInputRefs.current[index - 1]) {
          pinInputRefs.current[index - 1].focus();
        }
      }
    } else if (e.key === "ArrowLeft" && index > 0) {
      pinInputRefs.current[index - 1]?.focus();
    } else if (e.key === "ArrowRight" && index < 5) {
      pinInputRefs.current[index + 1]?.focus();
    }
  }

  function handlePaste(e) {
    e.preventDefault();
    e.stopPropagation();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (pasted) {
      const newDigits = ["", "", "", "", "", ""];
      for (let i = 0; i < 6; i++) {
        newDigits[i] = pasted[i] || "";
      }
      setOtpDigits(newDigits);
      const nextFocus = Math.min(pasted.length, 5);
      if (pinInputRefs.current[nextFocus]) {
        pinInputRefs.current[nextFocus].focus();
      }
      if (pasted.length === 6 && !isVerifyingRef.current) {
        handleVerifyOtp(pasted);
      }
    }
  }

  return (
    <div className="wa-auth-page" data-theme={theme}>
      {/* Ambient background light orbs & subtle grid */}
      <div className="wa-ambient-orb wa-orb-1" />
      <div className="wa-ambient-orb wa-orb-2" />
      <div className="wa-ambient-orb wa-orb-3" />
      <div className="wa-auth-grid-overlay" />

      {/* Main Glass Card Container */}
      <div className="wa-glass-card" style={{ maxWidth: 460, padding: "32px 28px" }}>
        {/* Top Header: Brand emblem & Theme Toggle */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 26,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div className="wa-brand-emblem">
              <div className="wa-brand-emblem-glow" />
              <div className="wa-brand-icon-box">
                <RobotIcon size={24} color="#ffffff" />
              </div>
            </div>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <h1
                  style={{
                    fontSize: 18,
                    fontWeight: 700,
                    margin: 0,
                    letterSpacing: -0.3,
                    color: "var(--wa-text-primary)",
                  }}
                >
                  WhatsApp AI
                </h1>
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    textTransform: "uppercase",
                    letterSpacing: 0.6,
                    padding: "2px 6px",
                    borderRadius: 6,
                    backgroundColor: "rgba(0, 168, 132, 0.15)",
                    color: "var(--wa-teal)",
                    border: "1px solid rgba(0, 168, 132, 0.3)",
                  }}
                >
                  Live Gate
                </span>
              </div>
              <p style={{ fontSize: 12, color: "var(--wa-text-muted)", margin: 0 }}>
                Autonomous Companion &amp; Take-Over
              </p>
            </div>
          </div>

          {onThemeChange && (
            <button
              onClick={() => onThemeChange(theme === "dark" ? "light" : "dark")}
              title={`Switch to ${theme === "dark" ? "Light" : "Dark"} mode`}
              style={{
                background: "var(--wa-card-bg)",
                border: "1px solid var(--wa-border-strong)",
                borderRadius: 20,
                padding: "5px 11px",
                fontSize: 12,
                fontWeight: 600,
                cursor: "pointer",
                color: "var(--wa-text-secondary)",
                display: "flex",
                alignItems: "center",
                gap: 6,
                transition: "all 0.15s ease",
              }}
            >
              {theme === "dark" ? <SunIcon size={13} color="var(--wa-text-secondary)" /> : <MoonIcon size={13} color="var(--wa-text-secondary)" />}
              <span>{theme === "dark" ? "Light" : "Dark"}</span>
            </button>
          )}
        </div>

        {/* Error Alert Box */}
        {error && (
          <div
            style={{
              background: "rgba(239, 68, 68, 0.12)",
              border: "1px solid rgba(239, 68, 68, 0.35)",
              color: "#ef4444",
              borderRadius: 12,
              padding: "11px 14px",
              fontSize: 13,
              marginBottom: 20,
              lineHeight: 1.4,
              display: "flex",
              alignItems: "flex-start",
              gap: 8,
              animation: "fadeIn 0.2s ease-out",
            }}
          >
            <WarningIcon size={16} color="#ef4444" />
            <div style={{ flex: 1 }}>{error}</div>
          </div>
        )}

        {/* ── STEP 1: Enter 6-Character Connection Code ────────────────────── */}
        {step === 1 && (
          <form onSubmit={handleSendOtp} style={{ display: "grid", gap: 20 }}>
            <div>
              <h2
                style={{
                  fontSize: 19,
                  fontWeight: 700,
                  margin: "0 0 6px",
                  color: "var(--wa-text-primary)",
                  letterSpacing: -0.2,
                }}
              >
                Log in to Take-Over
              </h2>
              <p
                style={{
                  fontSize: 13.5,
                  color: "var(--wa-text-secondary)",
                  margin: 0,
                  lineHeight: 1.45,
                }}
              >
                Enter your 6-character connection code. We will send a secure WhatsApp OTP to verify ownership.
              </p>
            </div>

            {/* Quick Resume Chip for Returning Users */}
            {recentHash && recentHash !== hash && (
              <div
                style={{
                  background: "rgba(0, 168, 132, 0.08)",
                  border: "1px solid rgba(0, 168, 132, 0.25)",
                  padding: "10px 14px",
                  borderRadius: 12,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 10,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <ZapIcon size={15} color="var(--wa-teal)" />
                  <div style={{ fontSize: 12, color: "var(--wa-text-secondary)" }}>
                    Recent Connection:{" "}
                    <strong style={{ color: "var(--wa-teal)", fontFamily: "monospace", fontSize: 13 }}>
                      {recentHash}
                    </strong>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setHash(recentHash);
                    handleSendOtp(null, recentHash);
                  }}
                  disabled={loading}
                  style={{
                    background: "var(--wa-teal)",
                    color: "#fff",
                    border: "none",
                    borderRadius: 8,
                    padding: "4px 10px",
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: "pointer",
                    whiteSpace: "nowrap",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 4,
                  }}
                >
                  <span>Use {recentHash}</span>
                  <ArrowRightIcon size={12} color="#ffffff" />
                </button>
              </div>
            )}

            {/* Connection Code Input Field */}
            <div style={{ display: "grid", gap: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <label
                  style={{
                    fontSize: 11.5,
                    fontWeight: 700,
                    letterSpacing: 0.6,
                    color: "var(--wa-text-muted)",
                    textTransform: "uppercase",
                  }}
                >
                  Connection Code
                </label>
                <span style={{ fontSize: 11, color: "var(--wa-text-muted)" }}>
                  {hash.length}/6 characters
                </span>
              </div>

              <div style={{ position: "relative" }}>
                <input
                  type="text"
                  maxLength={8}
                  value={hash}
                  onChange={(e) => setHash(e.target.value.toUpperCase())}
                  placeholder="e.g. K9X2P4"
                  autoFocus
                  disabled={loading}
                  style={{
                    width: "100%",
                    padding: "14px 18px",
                    borderRadius: 14,
                    border: "1.5px solid var(--wa-border-strong)",
                    backgroundColor: "var(--wa-input-bg)",
                    color: "var(--wa-text-primary)",
                    fontSize: 22,
                    fontWeight: 700,
                    letterSpacing: 4,
                    textAlign: "center",
                    textTransform: "uppercase",
                    outline: "none",
                    boxSizing: "border-box",
                    fontFamily: "monospace",
                    transition: "all 0.2s ease",
                  }}
                />
              </div>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading || !hash.trim()}
              className="wa-btn-primary-gradient"
            >
              {loading ? (
                <>
                  <span style={{ animation: "spin 1s linear infinite", display: "inline-flex" }}>
                    <RefreshIcon size={15} color="#ffffff" />
                  </span>
                  <span>Sending WhatsApp Code…</span>
                </>
              ) : (
                <>
                  <span>Continue with WhatsApp</span>
                  <ArrowRightIcon size={15} color="#ffffff" />
                </>
              )}
            </button>

            {/* Link to Set Up New Connection */}
            <div
              style={{
                background: "var(--wa-header-bg)",
                borderRadius: 14,
                padding: "14px 16px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                border: "1px solid var(--wa-border)",
                marginTop: 2,
              }}
            >
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: "var(--wa-text-primary)" }}>
                  Don&apos;t have a connection yet?
                </div>
                <div style={{ fontSize: 11.5, color: "var(--wa-text-muted)", marginTop: 2 }}>
                  Pair your WhatsApp &amp; configure AI in 2 minutes.
                </div>
              </div>
              <a
                href="/setup"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                  color: "var(--wa-teal)",
                  fontSize: 13,
                  fontWeight: 700,
                  textDecoration: "none",
                  padding: "6px 10px",
                  borderRadius: 8,
                  backgroundColor: "rgba(0, 168, 132, 0.1)",
                  border: "1px solid rgba(0, 168, 132, 0.25)",
                  whiteSpace: "nowrap",
                }}
              >
                <span>Set Up</span>
                <ArrowRightIcon size={13} color="var(--wa-teal)" />
              </a>
            </div>
          </form>
        )}

        {/* ── STEP 2: Enter WhatsApp OTP ──────────────────────────────────── */}
        {step === 2 && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleVerifyOtp();
            }}
            style={{ display: "grid", gap: 20 }}
          >
            <div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: 6,
                }}
              >
                <h2
                  style={{
                    fontSize: 19,
                    fontWeight: 700,
                    margin: 0,
                    color: "var(--wa-text-primary)",
                    letterSpacing: -0.2,
                  }}
                >
                  Verify WhatsApp OTP
                </h2>
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 700,
                    color: "var(--wa-teal)",
                    background: "rgba(0, 168, 132, 0.15)",
                    border: "1px solid rgba(0, 168, 132, 0.3)",
                    padding: "3px 9px",
                    borderRadius: 8,
                    letterSpacing: 1.5,
                    fontFamily: "monospace",
                  }}
                >
                  {hash}
                </span>
              </div>
              <p
                style={{
                  fontSize: 13.5,
                  color: "var(--wa-text-secondary)",
                  margin: 0,
                  lineHeight: 1.45,
                }}
              >
                We sent a 6-digit verification code directly to the owner&apos;s WhatsApp:
              </p>

              {/* Masked Phone Badge */}
              {maskedPhone && (
                <div
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 8,
                    background: "var(--wa-card-bg)",
                    border: "1px solid var(--wa-border-strong)",
                    padding: "6px 12px",
                    borderRadius: 10,
                    marginTop: 10,
                    fontSize: 13.5,
                    fontWeight: 600,
                    color: "var(--wa-text-primary)",
                  }}
                >
                  <DoubleCheckIcon size={16} isRead={true} />
                  <span style={{ fontFamily: "monospace" }}>{maskedPhone}</span>
                  <span
                    style={{
                      fontSize: 11,
                      color: "var(--wa-green)",
                      fontWeight: 700,
                      background: "rgba(37, 211, 102, 0.12)",
                      padding: "1px 6px",
                      borderRadius: 6,
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 3,
                    }}
                  >
                    <CheckIcon size={11} color="var(--wa-green)" />
                    <span>Verified Owner</span>
                  </span>
                </div>
              )}

              {/* Bridge Delivery Warning */}
              {bridgeWarning && (
                <div
                  style={{
                    background: "rgba(245, 158, 11, 0.12)",
                    border: "1px solid rgba(245, 158, 11, 0.35)",
                    color: "#f59e0b",
                    borderRadius: 10,
                    padding: "9px 12px",
                    fontSize: 12,
                    marginTop: 10,
                    lineHeight: 1.4,
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 8,
                  }}
                >
                  <WarningIcon size={15} color="#f59e0b" />
                  <div style={{ flex: 1 }}>{bridgeWarning}</div>
                </div>
              )}
            </div>

            {/* Discrete 6-Digit PIN Slot Grid */}
            <div style={{ display: "grid", gap: 8 }}>
              <label
                style={{
                  fontSize: 11.5,
                  fontWeight: 700,
                  letterSpacing: 0.6,
                  color: "var(--wa-text-muted)",
                  textTransform: "uppercase",
                  textAlign: "center",
                }}
              >
                6-Digit Verification Code
              </label>

              <div className="wa-pin-grid" onPaste={handlePaste}>
                {otpDigits.map((digit, idx) => (
                  <input
                    key={idx}
                    ref={(el) => (pinInputRefs.current[idx] = el)}
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={1}
                    value={digit}
                    onChange={(e) => handlePinChange(idx, e.target.value)}
                    onKeyDown={(e) => handlePinKeyDown(idx, e)}
                    disabled={loading}
                    className={`wa-pin-slot ${digit ? "filled" : ""}`}
                  />
                ))}
              </div>
            </div>

            {/* Verify Button */}
            <button
              type="submit"
              disabled={loading || otpDigits.join("").length < 6}
              className="wa-btn-primary-gradient"
            >
              {loading ? (
                <>
                  <span style={{ animation: "spin 1s linear infinite", display: "inline-flex" }}>
                    <RefreshIcon size={15} color="#ffffff" />
                  </span>
                  <span>Verifying Session…</span>
                </>
              ) : (
                <>
                  <span>Verify &amp; Unlock Dashboard</span>
                  <CheckIcon size={15} color="#ffffff" />
                </>
              )}
            </button>

            {/* Resend and Navigation Controls */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                paddingTop: 4,
              }}
            >
              <button
                type="button"
                onClick={() => {
                  setStep(1);
                  setOtpDigits(["", "", "", "", "", ""]);
                  setError("");
                }}
                style={{
                  background: "none",
                  border: "none",
                  color: "var(--wa-text-secondary)",
                  fontSize: 13,
                  fontWeight: 500,
                  cursor: "pointer",
                  padding: "4px 0",
                  display: "flex",
                  alignItems: "center",
                  gap: 5,
                }}
              >
                <ArrowLeftIcon size={13} color="var(--wa-text-secondary)" />
                <span>Change code</span>
              </button>

              {resendCooldown > 0 ? (
                <div
                  style={{
                    fontSize: 12,
                    color: "var(--wa-text-muted)",
                    display: "flex",
                    alignItems: "center",
                    gap: 5,
                    background: "var(--wa-card-bg)",
                    padding: "3px 8px",
                    borderRadius: 12,
                    border: "1px solid var(--wa-border)",
                  }}
                >
                  <ClockIcon size={13} color="var(--wa-text-muted)" />
                  <span>Resend in {resendCooldown}s</span>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={(e) => handleSendOtp(e, hash)}
                  disabled={loading}
                  style={{
                    background: "none",
                    border: "none",
                    color: "var(--wa-teal)",
                    fontSize: 13,
                    fontWeight: 700,
                    cursor: "pointer",
                    padding: "4px 0",
                    display: "flex",
                    alignItems: "center",
                    gap: 5,
                  }}
                >
                  <RefreshIcon size={13} color="var(--wa-teal)" />
                  <span>Resend OTP</span>
                </button>
              )}
            </div>
          </form>
        )}

        {/* Security / Encryption Footer */}
        <div
          style={{
            marginTop: 26,
            paddingTop: 16,
            borderTop: "1px solid var(--wa-border)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
            color: "var(--wa-text-muted)",
            fontSize: 11.5,
          }}
        >
          <LockIcon size={13} color="var(--wa-text-muted)" />
          <span>Protected by WhatsApp 2-Factor Device Authentication</span>
        </div>
      </div>
    </div>
  );
}

