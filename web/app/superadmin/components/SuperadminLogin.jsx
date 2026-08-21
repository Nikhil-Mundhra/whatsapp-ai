"use client";

import React from "react";
import {
  LockIcon,
  WarningIcon,
  ZapIcon,
  FingerprintIcon,
} from "../../components/Icons/WhatsAppIcons";

export default function SuperadminLogin({
  otpStep,
  maskedPhone,
  loginError,
  handlePasskeyLogin,
  passkeyLoginLoading,
  handleDevBypassLogin,
  loginLoading,
  handleLoginSubmit,
  password,
  setPassword,
  showPassword,
  setShowPassword,
  handleVerifyOtpSubmit,
  otp,
  setOtp,
  bridgeSent,
  bridgeError,
  devOtp,
  setOtpStep,
  setLoginError,
}) {
  return (
    <div className="wa-container" style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div
        style={{
          width: "100%",
          maxWidth: 440,
          backgroundColor: "var(--wa-panel-bg)",
          borderRadius: 12,
          border: "1px solid var(--wa-border)",
          boxShadow: "0 8px 24px rgba(0,0,0,0.18)",
          padding: 32,
          position: "relative",
          zIndex: 10,
        }}
      >
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <div
            style={{
              width: 56,
              height: 56,
              backgroundColor: "rgba(0, 168, 132, 0.12)",
              borderRadius: "50%",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              marginBottom: 12,
            }}
          >
            <LockIcon size={26} color="var(--wa-teal)" />
          </div>
          <h1 style={{ fontSize: "20px", fontWeight: "700", color: "var(--wa-text-primary)", marginBottom: 6 }}>
            Superadmin Control Portal
          </h1>
          <p style={{ fontSize: "13px", color: "var(--wa-text-secondary)" }}>
            {otpStep
              ? `Enter the 6-digit WhatsApp 2FA code sent to ${maskedPhone || "your phone"}`
              : "Master Authentication & Multi-Tenant Fleet Overview"}
          </p>
        </div>

        {loginError && (
          <div
            style={{
              backgroundColor: "rgba(220, 38, 38, 0.1)",
              border: "1px solid rgba(220, 38, 38, 0.25)",
              color: "#ef4444",
              padding: "10px 14px",
              borderRadius: 8,
              fontSize: "13px",
              marginBottom: 18,
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <WarningIcon size={14} color="#ef4444" />
            <span>{loginError}</span>
          </div>
        )}

        {!otpStep ? (
          <div>
            <button
              type="button"
              onClick={handlePasskeyLogin}
              disabled={passkeyLoginLoading || loginLoading}
              className="wa-btn-primary-gradient"
              style={{
                width: "100%",
                padding: "12px 16px",
                marginBottom: "10px",
                borderRadius: 8,
                fontSize: "14px",
                fontWeight: "700",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                boxShadow: "0 4px 14px rgba(0, 168, 132, 0.25)",
              }}
            >
              <FingerprintIcon size={18} color="#ffffff" />
              <span>{passkeyLoginLoading ? "Authenticating with Touch ID / Face ID..." : "Sign in with Apple Passkey"}</span>
            </button>

            <button
              type="button"
              onClick={handleDevBypassLogin}
              disabled={loginLoading || passkeyLoginLoading}
              style={{
                width: "100%",
                padding: "10px 16px",
                marginBottom: "16px",
                borderRadius: 8,
                backgroundColor: "rgba(0, 168, 132, 0.12)",
                border: "1px solid var(--wa-teal)",
                color: "var(--wa-teal)",
                fontSize: "13px",
                fontWeight: "700",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
              }}
            >
              <ZapIcon size={15} color="var(--wa-teal)" />
              <span>Dev 1-Click Instant Access</span>
            </button>

            <div style={{ display: "flex", alignItems: "center", margin: "16px 0", gap: 10 }}>
              <div style={{ flex: 1, height: "1px", backgroundColor: "var(--wa-border)" }} />
              <span style={{ fontSize: "11px", color: "var(--wa-text-muted)", textTransform: "uppercase", fontWeight: "600" }}>or use master password</span>
              <div style={{ flex: 1, height: "1px", backgroundColor: "var(--wa-border)" }} />
            </div>

            <form onSubmit={handleLoginSubmit}>
              <div style={{ marginBottom: 20 }}>
                <label style={{ display: "block", fontSize: "12px", fontWeight: "600", color: "var(--wa-text-secondary)", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.5px" }}>
                  Master Admin Secret Key
                </label>
                <div style={{ position: "relative" }}>
                  <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter SUPERADMIN_SECRET"
                    required
                    style={{
                      width: "100%",
                      padding: "10px 14px",
                      borderRadius: 8,
                      border: "1px solid var(--wa-border-strong)",
                      backgroundColor: "var(--wa-input-bg)",
                      color: "var(--wa-text-primary)",
                      fontSize: "14px",
                      outline: "none",
                      boxSizing: "border-box",
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    style={{
                      position: "absolute",
                      right: 10,
                      top: "50%",
                      transform: "translateY(-50%)",
                      background: "none",
                      border: "none",
                      color: "var(--wa-text-secondary)",
                      cursor: "pointer",
                      fontSize: "12px",
                      padding: "4px 6px",
                    }}
                  >
                    {showPassword ? "Hide" : "Show"}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loginLoading}
                className="wa-btn-primary-gradient"
                style={{ width: "100%", padding: "12px", fontSize: "14px" }}
              >
                {loginLoading ? "Sending OTP..." : "Send WhatsApp 2FA OTP"}
              </button>
            </form>
          </div>
        ) : (
          <form onSubmit={handleVerifyOtpSubmit}>
            <div style={{ marginBottom: 20 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <label style={{ fontSize: "12px", fontWeight: "600", color: "var(--wa-text-secondary)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                  6-Digit Verification Code
                </label>
                {maskedPhone && (
                  <span style={{ fontSize: "11px", color: "var(--wa-teal)", fontWeight: "600" }}>
                    Sent to {maskedPhone}
                  </span>
                )}
              </div>
              <input
                type="text"
                maxLength={6}
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
                placeholder="• • • • • •"
                autoFocus
                required
                style={{
                  width: "100%",
                  padding: "12px 14px",
                  borderRadius: 8,
                  border: "1px solid var(--wa-border-strong)",
                  backgroundColor: "var(--wa-input-bg)",
                  color: "var(--wa-text-primary)",
                  fontSize: "20px",
                  fontWeight: "700",
                  letterSpacing: "6px",
                  textAlign: "center",
                  outline: "none",
                  boxSizing: "border-box",
                }}
              />
              {!bridgeSent && (
                <div
                  style={{
                    marginTop: 10,
                    padding: "10px 12px",
                    backgroundColor: "rgba(234, 179, 8, 0.12)",
                    border: "1px solid rgba(234, 179, 8, 0.3)",
                    borderRadius: 8,
                    fontSize: "12px",
                    color: "#eab308",
                    lineHeight: "1.4",
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 6,
                  }}
                >
                  <WarningIcon size={14} color="#eab308" />
                  <div><strong>Bridge Delivery Warning</strong>: WhatsApp bridge could not deliver the text message ({bridgeError || "no active connected sender"}). Ensure at least one WhatsApp account is linked &amp; online on the bridge.</div>
                </div>
              )}
              {devOtp && (
                <div style={{ marginTop: 8, fontSize: "12px", color: "var(--wa-teal)", textAlign: "center" }}>
                  Dev Auto-Code: <strong>{devOtp}</strong>
                </div>
              )}
            </div>

            <button
              type="submit"
              disabled={loginLoading || otp.length < 6}
              className="wa-btn-primary-gradient"
              style={{ width: "100%", padding: "12px", fontSize: "14px", marginBottom: 12 }}
            >
              {loginLoading ? "Verifying..." : "Verify & Enter Superadmin"}
            </button>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <button
                type="button"
                onClick={() => {
                  setOtpStep(false);
                  setOtp("");
                  setLoginError("");
                }}
                style={{
                  background: "none",
                  border: "none",
                  color: "var(--wa-text-secondary)",
                  fontSize: "12px",
                  cursor: "pointer",
                  padding: 0,
                }}
              >
                Back to Password
              </button>
              <button
                type="button"
                onClick={handleLoginSubmit}
                disabled={loginLoading}
                style={{
                  background: "none",
                  border: "none",
                  color: "var(--wa-teal)",
                  fontSize: "12px",
                  fontWeight: "600",
                  cursor: "pointer",
                  padding: 0,
                }}
              >
                Resend OTP
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
