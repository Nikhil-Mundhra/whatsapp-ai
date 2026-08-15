"use client";

import { useState } from "react";

export default function SetupPage() {
  const [step, setStep] = useState(1);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    ownerPhone: "",
    allowedRecipients: "",
    aiApiKey: "",
    coupon: "",
  });
  const [hash, setHash] = useState(null);
  const [qr, setQr] = useState(null);
  const [linked, setLinked] = useState(false);
  const [syncing, setSyncing] = useState(false);

  function update(key) {
    return (e) => setForm({ ...form, [key]: e.target.value });
  }

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
          coupon: form.coupon,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "setup failed");
      setHash(data.hash);
      setStep(2);
      await provisionQr(data.hash);
    } catch (err) {
      setError(err.message);
    }
  }

  async function provisionQr(h) {
    setSyncing(true);
    try {
      const res = await fetch(`/api/connections/${h}/qr`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "failed to start pairing");
      setQr(data.qr);
      pollStatus(h);
    } catch (err) {
      setError(err.message);
      setSyncing(false);
    }
  }

  async function pollStatus(h) {
    let ticks = 0;
    const interval = setInterval(async () => {
      ticks++;
      try {
        const res = await fetch(`/api/connections/${h}/status`, { cache: "no-store" });
        const data = await res.json();
        if (data.linked) {
          setLinked(true);
          setSyncing(false);
          clearInterval(interval);
          setTimeout(() => setStep(3), 800);
          return;
        }
        if (ticks % 5 === 0) {
          const qrRes = await fetch(`/api/connections/${h}/qr`, { cache: "no-store" });
          const qrData = await qrRes.json();
          if (qrData.qr) setQr(qrData.qr);
        }
      } catch {
        /* retry */
      }
    }, 2000);
  }

  return (
    <main style={{ maxWidth: 560, margin: "0 auto", padding: 24, fontFamily: "system-ui, sans-serif" }}>
      <h1 style={{ fontSize: 22 }}>Set up your connection</h1>

      {error && (
        <p style={{ color: "#b91c1c", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 6, padding: 10 }}>
          {error}
        </p>
      )}

      {step === 1 && (
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

          <label style={{ display: "grid", gap: 4 }}>
            <span style={{ fontWeight: 600 }}>AI API KEY</span>
            <input
              type="password"
              value={form.aiApiKey}
              onChange={update("aiApiKey")}
              placeholder="Your AI provider key"
              style={{ padding: 10, borderRadius: 6, border: "1px solid #ccc" }}
            />
          </label>

          <label style={{ display: "grid", gap: 4 }}>
            <span style={{ fontWeight: 600 }}>Coupon</span>
            <input
              value={form.coupon}
              onChange={update("coupon")}
              placeholder="Contact wa.me/+917060410033"
              style={{ padding: 10, borderRadius: 6, border: "1px solid #ccc" }}
            />
          </label>

          <button
            type="submit"
            style={{ padding: "12px 24px", borderRadius: 6, border: "none", background: "#2b6cb0", color: "#fff", cursor: "pointer", fontSize: 15 }}
          >
            Continue
          </button>
        </form>
      )}

      {step === 2 && (
        <div style={{ textAlign: "center", display: "grid", gap: 12, justifyContent: "center" }}>
          <h2 style={{ fontSize: 18 }}>Scan with WhatsApp</h2>
          <p style={{ color: "#555" }}>
            Open WhatsApp &gt; Linked devices &gt; Link a device, then scan this QR.
          </p>
          {qr && !linked ? (
            <img
              src={qr}
              alt="WhatsApp pairing QR code"
              width={280}
              height={280}
              style={{ display: "inline-block", borderRadius: 8, background: "#fff", padding: 8 }}
            />
          ) : linked ? (
            <p style={{ color: "#0a7d32", fontWeight: 600 }}>Linked! ✓</p>
          ) : (
            <p>{syncing ? "Starting pairing…" : "Not scanning. Check the bridge."}</p>
          )}
          <button
            onClick={() => provisionQr(hash)}
            style={{ padding: "10px 20px", borderRadius: 6, border: "1px solid #ccc", background: "#fff", cursor: "pointer" }}
          >
            Refresh QR
          </button>
        </div>
      )}

      {step === 3 && (
        <div style={{ textAlign: "center", display: "grid", gap: 12, justifyContent: "center" }}>
          <h2 style={{ fontSize: 18 }}>All set! 🎉</h2>
          <p style={{ color: "#555" }}>Your connection is linked and ready.</p>
          <div>
            <p style={{ fontWeight: 600, marginBottom: 4 }}>Enter this code on your watch:</p>
            <code
              style={{
                fontSize: 34, letterSpacing: 6, background: "#f3f4f6", borderRadius: 8,
                padding: "10px 20px", display: "inline-block",
              }}
            >
              {hash}
            </code>
          </div>
          <p style={{ color: "#888", fontSize: 13 }}>
            Install the TakeOver app via Zepp on your Amazfit watch and enter this code to link it.
          </p>
        </div>
      )}
    </main>
  );
}
