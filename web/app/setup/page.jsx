"use client";

import { useState, useEffect, useRef } from "react";
import { LockIcon, RobotIcon, DoubleCheckIcon, RefreshIcon } from "../components/Icons/WhatsAppIcons";

export default function SetupPage() {
  const [step, setStep] = useState(1);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    ownerPhone: "",
    allowedRecipients: "",
    aiApiKey: "",
    aiModel: "",
    coupon: "",
  });
  const [showApiKey, setShowApiKey] = useState(false);
  const [hash, setHash] = useState(null);
  const [qr, setQr] = useState(null);
  const [rawQr, setRawQr] = useState("");
  const [timeLeft, setTimeLeft] = useState(20);
  const [linked, setLinked] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [copiedHash, setCopiedHash] = useState(false);
  const [keyStatus, setKeyStatus] = useState({ state: "idle", message: "", provider: "", models: [] }); // idle | checking | valid | invalid
  const validateTimerRef = useRef(null);

  const rawQrRef = useRef("");
  const pollIntervalRef = useRef(null);
  const timerIntervalRef = useRef(null);

  // Theme Management (Dark / Light)
  const [theme, setTheme] = useState("dark");

  useEffect(() => {
    const savedTheme = localStorage.getItem("wa_theme") || "dark";
    setTheme(savedTheme);
    document.documentElement.setAttribute("data-theme", savedTheme);
  }, []);

  function handleThemeChange(newTheme) {
    setTheme(newTheme);
    localStorage.setItem("wa_theme", newTheme);
    document.documentElement.setAttribute("data-theme", newTheme);
  }

  function update(key) {
    return (e) => {
      const val = e.target.value;
      setForm((prev) => ({ ...prev, [key]: val }));
      if (key === "aiApiKey") {
        if (!val.trim()) {
          setKeyStatus({ state: "idle", message: "", provider: "", models: [] });
          return;
        }
        setKeyStatus({ state: "checking", message: "Verifying API key...", provider: "", models: [] });
        if (validateTimerRef.current) clearTimeout(validateTimerRef.current);
        validateTimerRef.current = setTimeout(async () => {
          try {
            const res = await fetch("/api/validate-key", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ apiKey: val.trim() }),
            });
            const data = await res.json();
            if (data.valid) {
              setKeyStatus({
                state: "valid",
                message: data.warning || `Valid ${data.provider} Key ✓`,
                provider: data.provider,
                models: data.models || [],
              });
              if (data.defaultModel) {
                setForm((prev) => ({ ...prev, aiModel: data.defaultModel }));
              } else if (data.models?.[0]?.id) {
                setForm((prev) => ({ ...prev, aiModel: data.models[0].id }));
              }
            } else {
              setKeyStatus({
                state: "invalid",
                message: data.error || "Invalid API key",
                provider: "",
                models: [],
              });
            }
          } catch {
            setKeyStatus({ state: "idle", message: "", provider: "", models: [] });
          }
        }, 800);
      }
    };
  }

  // 1-second countdown timer for the active QR code
  useEffect(() => {
    if (step === 2 && !linked) {
      timerIntervalRef.current = setInterval(() => {
        setTimeLeft((prev) => {
          if (prev <= 1) {
            return 20; // reset for next cycle
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => clearInterval(timerIntervalRef.current);
  }, [step, linked]);

  const [existingHash, setExistingHash] = useState("");

  useEffect(() => {
    try {
      const saved = localStorage.getItem("wa_hash");
      if (saved) setExistingHash(saved.toUpperCase());
    } catch {}
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setSubmitting(true);

    try {
      const res = await fetch("/api/connections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ownerPhone: form.ownerPhone,
          allowedRecipients: form.allowedRecipients,
          aiApiKey: form.aiApiKey,
          aiModel: form.aiModel,
          coupon: form.coupon,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Setup failed");
      setHash(data.hash);
      if (typeof window !== "undefined") {
        localStorage.setItem("wa_hash", data.hash);
        if (data.token) {
          localStorage.setItem(`wa_session_${data.hash}`, data.token);
          localStorage.setItem("wa_auth_token", data.token);
        }
      }
      setStep(2);
      await provisionQr(data.hash);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function provisionQr(h) {
    setSyncing(true);
    setError("");
    try {
      const res = await fetch(`/api/connections/${h}/qr`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ownerPhone: form.ownerPhone,
          allowedRecipients: form.allowedRecipients,
          aiApiKey: form.aiApiKey,
          aiModel: form.aiModel,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to start WhatsApp pairing");
      if (data.rawQr) {
        rawQrRef.current = data.rawQr;
        setRawQr(data.rawQr);
      }
      if (data.qr) {
        setQr(data.qr);
      }
      setTimeLeft(data.ttl || 20);
      startPolling(h);
    } catch (err) {
      setError(err.message);
      setSyncing(false);
    }
  }

  function startPolling(h) {
    if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    let ticks = 0;
    pollIntervalRef.current = setInterval(async () => {
      ticks++;
      try {
        const res = await fetch(`/api/connections/${h}/status`, { cache: "no-store" });
        const data = await res.json();
        if (data.linked) {
          setLinked(true);
          setSyncing(false);
          clearInterval(pollIntervalRef.current);
          clearInterval(timerIntervalRef.current);
          setTimeout(() => setStep(3), 800);
          return;
        }

        // Poll for QR updates every 4 seconds
        if (ticks % 2 === 0) {
          const qrRes = await fetch(`/api/connections/${h}/qr`, { cache: "no-store" });
          const qrData = await qrRes.json();
          if (qrData.rawQr && qrData.rawQr !== rawQrRef.current) {
            rawQrRef.current = qrData.rawQr;
            setRawQr(qrData.rawQr);
            setQr(qrData.qr);
            setTimeLeft(qrData.ttl || 20);
          }
        }
      } catch {
        /* retry */
      }
    }, 2000);
  }

  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    };
  }, []);

  function handleCopyHash() {
    if (!hash) return;
    navigator.clipboard.writeText(hash);
    setCopiedHash(true);
    setTimeout(() => setCopiedHash(false), 2000);
  }

  // Calculate circular countdown stroke dashoffset (circumference = 2 * PI * r = 2 * 3.14159 * 18 = 113.1)
  const timerRadius = 18;
  const timerCircumference = 2 * Math.PI * timerRadius;
  const timerOffset = timerCircumference - (timeLeft / 20) * timerCircumference;
  const timerColor = timeLeft <= 5 ? "#ef4444" : timeLeft <= 10 ? "#f59e0b" : "#00a884";

  return (
    <div className="wa-auth-page" data-theme={theme} style={{ padding: "20px 16px 40px" }}>
      {/* Ambient background light orbs & subtle grid */}
      <div className="wa-ambient-orb wa-orb-1" />
      <div className="wa-ambient-orb wa-orb-2" />
      <div className="wa-ambient-orb wa-orb-3" />
      <div className="wa-auth-grid-overlay" />

      {/* Top Navigation Bar */}
      <header
        style={{
          width: "100%",
          maxWidth: 680,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 24,
          position: "relative",
          zIndex: 2,
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
              <span style={{ fontSize: 17, fontWeight: 700, color: "var(--wa-text-primary)" }}>
                WhatsApp AI
              </span>
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  textTransform: "uppercase",
                  padding: "2px 6px",
                  borderRadius: 6,
                  backgroundColor: "rgba(0, 168, 132, 0.15)",
                  color: "var(--wa-teal)",
                  border: "1px solid rgba(0, 168, 132, 0.3)",
                }}
              >
                Provisioning
              </span>
            </div>
            <span style={{ fontSize: 12, color: "var(--wa-text-muted)" }}>
              Take-Over Onboarding Wizard
            </span>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <a
            href="/"
            style={{
              background: "var(--wa-card-bg)",
              border: "1px solid var(--wa-border-strong)",
              borderRadius: 20,
              padding: "5px 12px",
              fontSize: 12,
              fontWeight: 600,
              color: "var(--wa-text-secondary)",
              textDecoration: "none",
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              transition: "all 0.15s ease",
            }}
          >
            <span>Log In</span>
            <span>→</span>
          </a>

          <button
            onClick={() => handleThemeChange(theme === "dark" ? "light" : "dark")}
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
              gap: 4,
            }}
          >
            <span>{theme === "dark" ? "☀️" : "🌙"}</span>
          </button>
        </div>
      </header>

      {/* Main Glass Card Container */}
      <main
        className="wa-glass-card"
        style={{
          width: "100%",
          maxWidth: 680,
          padding: "32px 30px",
        }}
      >
        {/* Interactive 3-Step Stepper Rail */}
        <div className="wa-stepper-container">
          <div className="wa-stepper-track">
            <div
              className="wa-stepper-progress"
              style={{
                width: step === 1 ? "0%" : step === 2 ? "50%" : "100%",
              }}
            />
          </div>

          <div className={`wa-stepper-step ${step === 1 ? "active" : step > 1 ? "completed" : ""}`}>
            <div className="wa-stepper-badge">
              {step > 1 ? "✓" : "1"}
            </div>
            <span className="wa-stepper-label">01 Configure</span>
          </div>

          <div className={`wa-stepper-step ${step === 2 ? "active" : step > 2 ? "completed" : ""}`}>
            <div className="wa-stepper-badge">
              {step > 2 ? "✓" : "2"}
            </div>
            <span className="wa-stepper-label">02 QR Scan</span>
          </div>

          <div className={`wa-stepper-step ${step === 3 ? "active" : ""}`}>
            <div className="wa-stepper-badge">
              3
            </div>
            <span className="wa-stepper-label">03 Ready &amp; Watch</span>
          </div>
        </div>

        {/* Global Error Notice */}
        {error && (
          <div
            style={{
              color: "#ef4444",
              background: "rgba(239, 68, 68, 0.12)",
              border: "1px solid rgba(239, 68, 68, 0.35)",
              borderRadius: 12,
              padding: "12px 16px",
              fontSize: 13.5,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 22,
              lineHeight: 1.4,
              animation: "fadeIn 0.2s ease-out",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span>⚠️</span>
              <span>{error.includes("wa.me") ? "Access requires a valid coupon code." : error}</span>
            </div>
            {error.includes("wa.me") && (
              <a
                href="https://wa.me/917060410033?text=Hey,%20I%20need%20a%20coupon%20for%20TakeOver"
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  color: "var(--wa-green)",
                  fontWeight: 700,
                  textDecoration: "none",
                  whiteSpace: "nowrap",
                  marginLeft: 8,
                  fontSize: 13,
                  background: "rgba(37, 211, 102, 0.15)",
                  padding: "4px 10px",
                  borderRadius: 6,
                }}
              >
                Get pass on WhatsApp →
              </a>
            )}
          </div>
        )}

        {/* ── STEP 1: Interactive Configuration Form ──────────────────────── */}
        {step === 1 && (
          <div style={{ display: "grid", gap: 20 }}>
            {existingHash && (
              <div
                style={{
                  background: "rgba(0, 168, 132, 0.08)",
                  border: "1px solid rgba(0, 168, 132, 0.25)",
                  padding: "12px 16px",
                  borderRadius: 14,
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontSize: 16 }}>⚡</span>
                  <div>
                    <div style={{ fontSize: 11.5, color: "var(--wa-text-muted)" }}>Existing Active Connection</div>
                    <code style={{ fontWeight: 700, color: "var(--wa-teal)", fontSize: 14, fontFamily: "monospace" }}>
                      {existingHash}
                    </code>
                  </div>
                </div>
                <a
                  href={`/?hash=${existingHash}`}
                  style={{
                    color: "var(--wa-teal)",
                    fontWeight: 700,
                    fontSize: 13,
                    textDecoration: "none",
                    background: "rgba(0, 168, 132, 0.12)",
                    padding: "6px 12px",
                    borderRadius: 8,
                  }}
                >
                  Open Dashboard →
                </a>
              </div>
            )}

            <form onSubmit={handleSubmit} style={{ display: "grid", gap: 16 }}>
              {/* Field 1: Owner Phone */}
              <div className="wa-form-card">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <label style={{ fontSize: 12, fontWeight: 700, color: "var(--wa-text-primary)", letterSpacing: 0.4 }}>
                    📱 OWNER WHATSAPP NUMBER
                  </label>
                  <span style={{ fontSize: 11, color: "var(--wa-text-muted)" }}>
                    Country code, no +
                  </span>
                </div>
                <input
                  value={form.ownerPhone}
                  onChange={update("ownerPhone")}
                  placeholder="e.g. 14155550100 or 917060410033"
                  className="wa-input-stylish"
                  required
                  disabled={submitting}
                />
                <small style={{ color: "var(--wa-text-muted)", fontSize: 11.5 }}>
                  This number receives the approval polls &amp; 2FA verification codes on WhatsApp.
                </small>
              </div>

              {/* Field 2: Allowed Recipients */}
              <div className="wa-form-card">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <label style={{ fontSize: 12, fontWeight: 700, color: "var(--wa-text-primary)", letterSpacing: 0.4 }}>
                    👥 ALLOWED RECIPIENTS (WHITELIST)
                  </label>
                  <span
                    style={{
                      fontSize: 11,
                      color: "var(--wa-teal)",
                      background: "rgba(0, 168, 132, 0.12)",
                      padding: "1px 6px",
                      borderRadius: 6,
                      fontWeight: 600,
                    }}
                  >
                    Safety Gate
                  </span>
                </div>
                <input
                  value={form.allowedRecipients}
                  onChange={update("allowedRecipients")}
                  placeholder="e.g. 14155550199, 447123456789"
                  className="wa-input-stylish"
                  disabled={submitting}
                />
                <small style={{ color: "var(--wa-text-muted)", fontSize: 11.5 }}>
                  Comma-separated phone numbers. The AI texting companion will only interact with these contacts.
                </small>
              </div>

              {/* Field 3: AI Engine & API Key */}
              <div className="wa-form-card">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <label style={{ fontSize: 12, fontWeight: 700, color: "var(--wa-text-primary)", letterSpacing: 0.4 }}>
                    🤖 AI MODEL API KEY
                  </label>
                  <div>
                    {keyStatus.state === "checking" && (
                      <span style={{ fontSize: 12, color: "var(--wa-text-muted)" }}>⏳ Testing key…</span>
                    )}
                    {keyStatus.state === "valid" && (
                      <span style={{ fontSize: 12, color: "var(--wa-green)", fontWeight: 700 }}>
                        {keyStatus.message}
                      </span>
                    )}
                    {keyStatus.state === "invalid" && (
                      <span style={{ fontSize: 12, color: "#ef4444", fontWeight: 700 }}>
                        ❌ {keyStatus.message}
                      </span>
                    )}
                  </div>
                </div>

                <div style={{ position: "relative" }}>
                  <input
                    type={showApiKey ? "text" : "password"}
                    value={form.aiApiKey}
                    onChange={update("aiApiKey")}
                    placeholder="Enter Gemini, OpenAI, Claude, Groq, or OpenRouter key"
                    className="wa-input-stylish"
                    style={{
                      paddingRight: 40,
                      borderColor:
                        keyStatus.state === "valid"
                          ? "var(--wa-green)"
                          : keyStatus.state === "invalid"
                          ? "#ef4444"
                          : undefined,
                    }}
                    disabled={submitting}
                  />
                  <button
                    type="button"
                    onClick={() => setShowApiKey(!showApiKey)}
                    style={{
                      position: "absolute",
                      right: 10,
                      top: "50%",
                      transform: "translateY(-50%)",
                      background: "none",
                      border: "none",
                      color: "var(--wa-text-muted)",
                      cursor: "pointer",
                      fontSize: 14,
                      padding: 4,
                    }}
                    title={showApiKey ? "Hide Key" : "Show Key"}
                  >
                    {showApiKey ? "👁️" : "🙈"}
                  </button>
                </div>

                {/* Dynamic AI Model Dropdown */}
                {keyStatus.models?.length > 0 && (
                  <div
                    style={{
                      marginTop: 6,
                      background: "var(--wa-header-bg)",
                      padding: "12px 14px",
                      borderRadius: 10,
                      border: "1px solid var(--wa-border)",
                      display: "grid",
                      gap: 6,
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontWeight: 700, fontSize: 12, color: "var(--wa-text-primary)" }}>
                        AI MODEL ({keyStatus.provider})
                      </span>
                      <span style={{ fontSize: 11, color: "var(--wa-text-muted)" }}>
                        {keyStatus.models.length} models detected
                      </span>
                    </div>
                    <select
                      value={form.aiModel}
                      onChange={update("aiModel")}
                      className="wa-input-stylish"
                      style={{ padding: "8px 12px", fontSize: 13, cursor: "pointer" }}
                    >
                      {keyStatus.models.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name || m.id}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              {/* Field 4: Access Coupon */}
              <div className="wa-form-card">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <label style={{ fontSize: 12, fontWeight: 700, color: "var(--wa-text-primary)", letterSpacing: 0.4 }}>
                    🎟️ ACCESS PASS / COUPON
                  </label>
                  <a
                    href="https://wa.me/917060410033?text=Hey,%20I%20need%20a%20coupon%20for%20TakeOver"
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      color: "var(--wa-teal)",
                      fontSize: 12,
                      fontWeight: 700,
                      textDecoration: "none",
                      display: "flex",
                      alignItems: "center",
                      gap: 4,
                    }}
                  >
                    <span>💬 Get one on WhatsApp</span>
                    <span>→</span>
                  </a>
                </div>
                <input
                  value={form.coupon}
                  onChange={update("coupon")}
                  placeholder="Enter your invitation coupon"
                  className="wa-input-stylish"
                  disabled={submitting}
                />
              </div>

              {/* Submit Action */}
              <button
                type="submit"
                disabled={submitting || !form.ownerPhone.trim()}
                className="wa-btn-primary-gradient"
                style={{ marginTop: 8 }}
              >
                {submitting ? (
                  <>
                    <span style={{ animation: "spin 1s linear infinite" }}>🔄</span>
                    <span>Provisioning Connection…</span>
                  </>
                ) : (
                  <>
                    <span>Generate Connection &amp; Pair WhatsApp</span>
                    <span style={{ fontSize: 16 }}>→</span>
                  </>
                )}
              </button>
            </form>
          </div>
        )}

        {/* ── STEP 2: Futuristic WhatsApp QR Scanner Frame ───────────────── */}
        {step === 2 && (
          <div style={{ textAlign: "center", display: "grid", gap: 20, justifyItems: "center" }}>
            <div>
              <h2 style={{ fontSize: 20, fontWeight: 700, margin: "0 0 6px", color: "var(--wa-text-primary)" }}>
                Scan with WhatsApp
              </h2>
              <p style={{ color: "var(--wa-text-secondary)", margin: 0, fontSize: 14 }}>
                Point your phone&apos;s camera to link your multi-device WhatsApp companion.
              </p>
            </div>

            {/* Circular Timer Ring & Status */}
            {qr && !linked && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  background: "var(--wa-card-bg)",
                  padding: "8px 18px",
                  borderRadius: 30,
                  border: "1px solid var(--wa-border)",
                }}
              >
                <div className="wa-timer-ring-container">
                  <svg className="wa-timer-ring-svg">
                    <circle cx="22" cy="22" r={timerRadius} className="wa-timer-ring-bg" />
                    <circle
                      cx="22"
                      cy="22"
                      r={timerRadius}
                      className="wa-timer-ring-bar"
                      style={{
                        strokeDasharray: timerCircumference,
                        strokeDashoffset: timerOffset,
                        stroke: timerColor,
                      }}
                    />
                  </svg>
                  <span
                    style={{
                      position: "absolute",
                      fontSize: 11,
                      fontWeight: 700,
                      color: timerColor,
                    }}
                  >
                    {timeLeft}s
                  </span>
                </div>
                <div style={{ textAlign: "left" }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "var(--wa-text-primary)" }}>
                    {timeLeft <= 5 ? "Refreshing code shortly…" : "Awaiting device scan…"}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--wa-text-muted)" }}>
                    Auto-refreshes for security
                  </div>
                </div>
              </div>
            )}

            {/* Futuristic QR Scanner Frame */}
            {qr && !linked ? (
              <div className="wa-scanner-frame">
                <div className="wa-scanner-corner wa-corner-tl" />
                <div className="wa-scanner-corner wa-corner-tr" />
                <div className="wa-scanner-corner wa-corner-bl" />
                <div className="wa-scanner-corner wa-corner-br" />
                <div className="wa-scanner-laser" />
                <img
                  src={qr}
                  alt="WhatsApp pairing QR code"
                  width={260}
                  height={260}
                  style={{ display: "block", borderRadius: 8 }}
                />
              </div>
            ) : linked ? (
              <div
                style={{
                  padding: "36px 48px",
                  borderRadius: 16,
                  background: "rgba(37, 211, 102, 0.12)",
                  border: "1px solid rgba(37, 211, 102, 0.35)",
                  color: "var(--wa-green)",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 12,
                  animation: "fadeIn 0.3s ease",
                }}
              >
                <div
                  style={{
                    width: 56,
                    height: 56,
                    borderRadius: "50%",
                    backgroundColor: "var(--wa-green)",
                    color: "#fff",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 28,
                  }}
                >
                  ✓
                </div>
                <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>
                  Device Linked Successfully!
                </h3>
                <p style={{ margin: 0, fontSize: 13, color: "var(--wa-text-secondary)" }}>
                  Finalizing companion settings…
                </p>
              </div>
            ) : (
              <div
                style={{
                  width: 280,
                  height: 280,
                  border: "2px dashed var(--wa-border-strong)",
                  borderRadius: 16,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 12,
                  color: "var(--wa-text-muted)",
                }}
              >
                <span style={{ fontSize: 28, animation: "spin 2s linear infinite" }}>⏳</span>
                <p style={{ margin: 0, fontSize: 13.5, fontWeight: 500 }}>
                  {syncing ? "Generating fresh QR code…" : "Connecting to bridge…"}
                </p>
              </div>
            )}

            {/* Visual Step-by-Step Instructions */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
                gap: 10,
                width: "100%",
                marginTop: 6,
              }}
            >
              <div
                style={{
                  background: "var(--wa-card-bg)",
                  border: "1px solid var(--wa-border)",
                  borderRadius: 12,
                  padding: "12px 14px",
                  textAlign: "left",
                }}
              >
                <div style={{ fontSize: 12, fontWeight: 700, color: "var(--wa-teal)", marginBottom: 3 }}>
                  STEP 1
                </div>
                <div style={{ fontSize: 12.5, color: "var(--wa-text-primary)", fontWeight: 500 }}>
                  Open WhatsApp on your mobile phone.
                </div>
              </div>

              <div
                style={{
                  background: "var(--wa-card-bg)",
                  border: "1px solid var(--wa-border)",
                  borderRadius: 12,
                  padding: "12px 14px",
                  textAlign: "left",
                }}
              >
                <div style={{ fontSize: 12, fontWeight: 700, color: "var(--wa-teal)", marginBottom: 3 }}>
                  STEP 2
                </div>
                <div style={{ fontSize: 12.5, color: "var(--wa-text-primary)", fontWeight: 500 }}>
                  Go to <strong>Settings</strong> &gt; <strong>Linked Devices</strong>.
                </div>
              </div>

              <div
                style={{
                  background: "var(--wa-card-bg)",
                  border: "1px solid var(--wa-border)",
                  borderRadius: 12,
                  padding: "12px 14px",
                  textAlign: "left",
                }}
              >
                <div style={{ fontSize: 12, fontWeight: 700, color: "var(--wa-teal)", marginBottom: 3 }}>
                  STEP 3
                </div>
                <div style={{ fontSize: 12.5, color: "var(--wa-text-primary)", fontWeight: 500 }}>
                  Tap <strong>Link a Device</strong> and scan this code.
                </div>
              </div>
            </div>

            {/* Refresh Action */}
            <button
              onClick={() => provisionQr(hash)}
              className="wa-btn-secondary-glass"
              style={{ marginTop: 4 }}
            >
              <RefreshIcon size={14} color="currentColor" />
              <span>Refresh QR Code</span>
            </button>
          </div>
        )}

        {/* ── STEP 3: Celebratory Completion & Smartwatch Onboarding ───────── */}
        {step === 3 && (
          <div style={{ textAlign: "center", display: "grid", gap: 24, justifyItems: "center" }}>
            {/* Header with celebration badge */}
            <div>
              <div
                style={{
                  width: 58,
                  height: 58,
                  borderRadius: "50%",
                  backgroundColor: "var(--wa-teal)",
                  color: "#ffffff",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 28,
                  margin: "0 auto 14px",
                  boxShadow: "0 0 24px rgba(0, 168, 132, 0.45)",
                }}
              >
                🎉
              </div>
              <h2 style={{ fontSize: 22, fontWeight: 700, margin: "0 0 6px", color: "var(--wa-text-primary)" }}>
                You&apos;re All Set!
              </h2>
              <p style={{ color: "var(--wa-text-secondary)", margin: 0, fontSize: 14 }}>
                WhatsApp is connected and your autonomous AI texting bridge is active.
              </p>
            </div>

            {/* Large Prominent Connection Hash Card */}
            <div
              style={{
                width: "100%",
                background: "rgba(0, 168, 132, 0.08)",
                border: "1.5px solid rgba(0, 168, 132, 0.35)",
                borderRadius: 16,
                padding: "20px 24px",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 12,
              }}
            >
              <span
                style={{
                  fontSize: 11.5,
                  fontWeight: 700,
                  letterSpacing: 1,
                  textTransform: "uppercase",
                  color: "var(--wa-teal)",
                }}
              >
                Your Secret Connection Hash
              </span>
              <code
                style={{
                  fontSize: 32,
                  fontWeight: 800,
                  letterSpacing: 6,
                  color: "var(--wa-teal)",
                  fontFamily: "monospace",
                }}
              >
                {hash}
              </code>
              <button
                onClick={handleCopyHash}
                style={{
                  background: copiedHash ? "var(--wa-green)" : "var(--wa-card-bg)",
                  color: copiedHash ? "#fff" : "var(--wa-text-primary)",
                  border: "1px solid var(--wa-border-strong)",
                  borderRadius: 10,
                  padding: "6px 14px",
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  transition: "all 0.15s ease",
                }}
              >
                <span>{copiedHash ? "✓ Copied!" : "📋 Copy Hash"}</span>
              </button>
            </div>

            {/* Dual Companion Guides: Smartwatch + Web Dashboard */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
                gap: 14,
                width: "100%",
                textAlign: "left",
              }}
            >
              {/* Card 1: Zepp OS Smartwatch */}
              <div
                style={{
                  background: "var(--wa-card-bg)",
                  border: "1px solid var(--wa-border)",
                  borderRadius: 14,
                  padding: "18px",
                  display: "flex",
                  flexDirection: "column",
                  gap: 10,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 18 }}>⌚</span>
                  <h4 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: "var(--wa-text-primary)" }}>
                    Amazfit / Zepp OS Watch
                  </h4>
                </div>
                <p style={{ margin: 0, fontSize: 12.5, color: "var(--wa-text-secondary)", lineHeight: 1.4 }}>
                  Install the <strong>TakeOver</strong> app on your Amazfit smartwatch, open Settings in the Zepp app, and paste hash <strong>{hash}</strong> to receive wrist approval polls.
                </p>
              </div>

              {/* Card 2: Web Take-Over Panel */}
              <div
                style={{
                  background: "var(--wa-card-bg)",
                  border: "1px solid var(--wa-border)",
                  borderRadius: 14,
                  padding: "18px",
                  display: "flex",
                  flexDirection: "column",
                  gap: 10,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 18 }}>💻</span>
                  <h4 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: "var(--wa-text-primary)" }}>
                    Web Control Panel
                  </h4>
                </div>
                <p style={{ margin: 0, fontSize: 12.5, color: "var(--wa-text-secondary)", lineHeight: 1.4 }}>
                  Monitor chats, view live messages, grant timed take-overs, and review autonomous replies in real time.
                </p>
              </div>
            </div>

            {/* Launch Dashboard Action */}
            <a
              href="/"
              className="wa-btn-primary-gradient"
              style={{
                width: "100%",
                textDecoration: "none",
                marginTop: 6,
                boxSizing: "border-box",
              }}
            >
              <span>Open Take-Over Control Panel</span>
              <span style={{ fontSize: 16 }}>→</span>
            </a>
          </div>
        )}

        {/* Security Footer */}
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
          <span>Secured with multi-device cryptographic pairing &amp; server-side KV encryption</span>
        </div>
      </main>
    </div>
  );
}

