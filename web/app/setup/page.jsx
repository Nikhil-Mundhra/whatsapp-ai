"use client";

import { useState, useEffect, useRef } from "react";

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
  const [hash, setHash] = useState(null);
  const [qr, setQr] = useState(null);
  const [rawQr, setRawQr] = useState("");
  const [timeLeft, setTimeLeft] = useState(20);
  const [linked, setLinked] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [keyStatus, setKeyStatus] = useState({ state: "idle", message: "", provider: "", models: [] }); // idle | checking | valid | invalid
  const validateTimerRef = useRef(null);

  const rawQrRef = useRef("");
  const pollIntervalRef = useRef(null);
  const timerIntervalRef = useRef(null);

  function update(key) {
    return (e) => {
      const val = e.target.value;
      setForm((prev) => ({ ...prev, [key]: val }));
      if (key === "aiApiKey") {
        if (!val.trim()) {
          setKeyStatus({ state: "idle", message: "", provider: "", models: [] });
          return;
        }
        setKeyStatus({ state: "checking", message: "Checking API key...", provider: "", models: [] });
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
    const saved = localStorage.getItem("wa_hash");
    if (saved) setExistingHash(saved);
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
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
      if (!res.ok) throw new Error(data.error || "setup failed");
      setHash(data.hash);
      if (typeof window !== "undefined") {
        localStorage.setItem("wa_hash", data.hash);
      }
      setStep(2);
      await provisionQr(data.hash);
    } catch (err) {
      setError(err.message);
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
      if (!res.ok) throw new Error(data.error || "failed to start pairing");
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

  return (
    <main style={{ maxWidth: 560, margin: "0 auto", padding: 24, fontFamily: "system-ui, sans-serif" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
        <img src="/logo.svg" alt="WhatsApp AI" style={{ width: 44, height: 44 }} />
        <h1 style={{ fontSize: 22, margin: 0 }}>Set up your connection</h1>
      </div>

      {error && (
        <div style={{ color: "#b91c1c", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 6, padding: "10px 14px", fontSize: 14, display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <span>{error.includes("wa.me") ? "Invalid coupon code." : error}</span>
          {error.includes("wa.me") && (
            <a
              href="https://wa.me/917060410033?text=Hey,%20I%20need%20a%20coupon%20for%20TakeOver"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: "#059669", fontWeight: 600, textDecoration: "none", whiteSpace: "nowrap", marginLeft: 8 }}
            >
              Get one now →
            </a>
          )}
        </div>
      )}

      {step === 1 && (
        <div style={{ display: "grid", gap: 14 }}>
          {existingHash && (
            <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", padding: "10px 14px", borderRadius: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 13, color: "#166534" }}>Existing Connection:</span>
                <code style={{ fontWeight: 700, color: "#15803d", fontSize: 14 }}>{existingHash}</code>
              </div>
              <a href={`/?hash=${existingHash}`} style={{ color: "#2563eb", fontWeight: 600, fontSize: 13, textDecoration: "none" }}>
                Open Control Panel →
              </a>
            </div>
          )}

          <form onSubmit={handleSubmit} style={{ display: "grid", gap: 14 }}>
            <label style={{ display: "grid", gap: 4 }}>
              <span style={{ fontWeight: 600 }}>OWNER_PHONE</span>
            <input
              value={form.ownerPhone}
              onChange={update("ownerPhone")}
              placeholder="e.g. 14155550100"
              style={{ padding: 10, borderRadius: 6, border: "1px solid #ccc" }}
            />
            <small style={{ color: "#888" }}>Receives the approval polls. Country code, no +.</small>
          </label>

          <label style={{ display: "grid", gap: 4 }}>
            <span style={{ fontWeight: 600 }}>ALLOWED_RECIPIENTS</span>
            <input
              value={form.allowedRecipients}
              onChange={update("allowedRecipients")}
              placeholder="e.g. 14155550199,447123456789"
              style={{ padding: 10, borderRadius: 6, border: "1px solid #ccc" }}
            />
            <small style={{ color: "#888" }}>Comma-separated contacts the AI may text.</small>
          </label>

          <div style={{ display: "grid", gap: 4 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontWeight: 600 }}>AI API KEY</span>
              {keyStatus.state === "checking" && (
                <span style={{ fontSize: 12, color: "#6b7280" }}>⏳ Verifying key...</span>
              )}
              {keyStatus.state === "valid" && (
                <span style={{ fontSize: 12, color: "#16a34a", fontWeight: 600 }}>{keyStatus.message}</span>
              )}
              {keyStatus.state === "invalid" && (
                <span style={{ fontSize: 12, color: "#dc2626", fontWeight: 600 }}>❌ {keyStatus.message}</span>
              )}
            </div>
            <input
              type="password"
              value={form.aiApiKey}
              onChange={update("aiApiKey")}
              placeholder="e.g. Gemini, OpenAI, Claude, Groq or OpenRouter key"
              style={{
                padding: 10,
                borderRadius: 6,
                border: `1px solid ${
                  keyStatus.state === "valid"
                    ? "#22c55e"
                    : keyStatus.state === "invalid"
                    ? "#ef4444"
                    : "#ccc"
                }`,
              }}
            />
          </div>

          {/* Dynamic AI Model Dropdown when valid key is provided */}
          {keyStatus.models?.length > 0 && (
            <div style={{ display: "grid", gap: 4, background: "#f8fafc", padding: 12, borderRadius: 8, border: "1px solid #e2e8f0" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontWeight: 600, fontSize: 13, color: "#334155" }}>
                  AI MODEL ({keyStatus.provider})
                </span>
                <span style={{ fontSize: 11, color: "#64748b" }}>
                  {keyStatus.models.length} models available
                </span>
              </div>
              <select
                value={form.aiModel}
                onChange={update("aiModel")}
                style={{
                  padding: "10px 12px",
                  borderRadius: 6,
                  border: "1px solid #cbd5e1",
                  background: "#fff",
                  cursor: "pointer",
                  fontSize: 14,
                  fontWeight: 500,
                  color: "#1e293b",
                }}
              >
                {keyStatus.models.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name || m.id}
                  </option>
                ))}
              </select>
              <small style={{ color: "#64748b", fontSize: 12 }}>
                Selected model will generate all persona-aligned responses.
              </small>
            </div>
          )}

          <div style={{ display: "grid", gap: 4 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontWeight: 600 }}>Coupon</span>
              <a
                href="https://wa.me/917060410033?text=Hey,%20I%20need%20a%20coupon%20for%20TakeOver"
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: "#25D366", fontSize: 13, fontWeight: 600, textDecoration: "none" }}
              >
                Get one now →
              </a>
            </div>
            <input
              value={form.coupon}
              onChange={update("coupon")}
              placeholder="Enter coupon code"
              style={{ padding: 10, borderRadius: 6, border: "1px solid #ccc" }}
            />
          </div>

          <button
            type="submit"
            style={{ padding: "12px 24px", borderRadius: 6, border: "none", background: "#2b6cb0", color: "#fff", cursor: "pointer", fontSize: 15 }}
          >
            Continue
          </button>
        </form>
      </div>
    )}

      {step === 2 && (
        <div style={{ textAlign: "center", display: "grid", gap: 14, justifyContent: "center" }}>
          <h2 style={{ fontSize: 18, margin: 0 }}>Scan with WhatsApp</h2>
          <p style={{ color: "#555", margin: 0, fontSize: 14 }}>
            Open WhatsApp &gt; Linked devices &gt; Link a device, then scan this QR.
          </p>

          {/* Countdown & Refresh Indicator */}
          {qr && !linked && (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 600, color: timeLeft <= 5 ? "#dc2626" : "#4b5563" }}>
                <span>⏳ QR Code expires in: {timeLeft}s</span>
              </div>
              <div style={{ width: 280, height: 4, background: "#e5e7eb", borderRadius: 999, overflow: "hidden" }}>
                <div
                  style={{
                    height: "100%",
                    width: `${(timeLeft / 20) * 100}%`,
                    background: timeLeft <= 5 ? "#ef4444" : timeLeft <= 10 ? "#f59e0b" : "#10b981",
                    transition: "width 1s linear, background-color 0.5s ease",
                  }}
                />
              </div>
            </div>
          )}

          {qr && !linked ? (
            <div style={{ background: "#fff", padding: 12, borderRadius: 12, border: "1px solid #e2e8f0", display: "inline-block", boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.05)" }}>
              <img
                src={qr}
                alt="WhatsApp pairing QR code"
                width={280}
                height={280}
                style={{ display: "block", borderRadius: 6 }}
              />
            </div>
          ) : linked ? (
            <p style={{ color: "#0a7d32", fontWeight: 600, fontSize: 16 }}>Linked successfully! ✓</p>
          ) : (
            <div style={{ padding: 40, border: "1px dashed #cbd5e1", borderRadius: 12, color: "#64748b" }}>
              <p>{syncing ? "Generating fresh QR code…" : "Connecting to bridge…"}</p>
            </div>
          )}

          <button
            onClick={() => provisionQr(hash)}
            style={{ padding: "8px 16px", borderRadius: 6, border: "1px solid #d1d5db", background: "#fff", color: "#374151", cursor: "pointer", fontSize: 13, fontWeight: 500 }}
          >
            🔄 Refresh QR Code
          </button>
        </div>
      )}

      {step === 3 && (
        <div style={{ textAlign: "center", display: "grid", gap: 12, justifyContent: "center" }}>
          <h2 style={{ fontSize: 18 }}>All set! 🎉</h2>
          <p style={{ color: "#555" }}>
            WhatsApp is linked. Your AI texting bridge is active.
          </p>
          <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", padding: 16, borderRadius: 8 }}>
            <p style={{ margin: "0 0 6px", fontWeight: 600, color: "#166534" }}>Your Connection Hash:</p>
            <code style={{ fontSize: 24, fontWeight: 700, letterSpacing: 2, color: "#15803d" }}>{hash}</code>
          </div>
          <p style={{ fontSize: 13, color: "#6b7280" }}>
            Enter this hash in the TakeOver companion settings in the Zepp app on your phone.
          </p>
          <p>
            <a href="/" style={{ color: "#2b6cb0", fontWeight: 600, fontSize: 14 }}>
              Open Take-Over Panel →
            </a>
          </p>
        </div>
      )}
    </main>
  );
}
