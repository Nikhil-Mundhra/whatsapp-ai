"use client";

import { useState, useEffect, useRef } from "react";

export default function Home() {
  const [hash, setHash] = useState("");
  const [inputHash, setInputHash] = useState("");
  const [isEditingHash, setIsEditingHash] = useState(false);
  const [connInfo, setConnInfo] = useState(null);
  const [polls, setPolls] = useState([]);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [votingId, setVotingId] = useState(null);

  // Edit Settings Modal State
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [configForm, setConfigForm] = useState({
    ownerPhone: "",
    allowedRecipients: "",
    aiApiKey: "",
    aiModel: "",
  });
  const [savingConfig, setSavingConfig] = useState(false);
  const [configSuccess, setConfigSuccess] = useState("");
  const [configError, setConfigError] = useState("");
  const [keyStatus, setKeyStatus] = useState({ state: "idle", message: "", provider: "", models: [] });
  const validateTimerRef = useRef(null);

  // 1. Initialize hash from URL searchParams or localStorage
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlHash = params.get("hash");
    const storedHash = localStorage.getItem("wa_hash");
    const active = urlHash || storedHash || "";
    if (active) {
      setHash(active.toUpperCase());
      setInputHash(active.toUpperCase());
    } else {
      setLoading(false);
    }
  }, []);

  // 2. Fetch live connection info, polls, and messages whenever hash changes
  useEffect(() => {
    if (!hash) return;
    localStorage.setItem("wa_hash", hash);

    async function fetchData() {
      try {
        const [connRes, pollsRes, msgsRes] = await Promise.all([
          fetch(`/api/connections/${hash}`, { cache: "no-store" }),
          fetch(`/api/polls?hash=${hash}&limit=50`, { cache: "no-store" }),
          fetch(`/api/connections/${hash}/messages?limit=20`, { cache: "no-store" }),
        ]);

        if (connRes.ok) {
          const connData = await connRes.json();
          setConnInfo(connData);
        }

        if (pollsRes.ok) {
          const pollsData = await pollsRes.json();
          setPolls(pollsData.polls || []);
        }

        if (msgsRes.ok) {
          const msgsData = await msgsRes.json();
          setMessages(msgsData.messages || []);
        }
      } catch (err) {
        console.error("Failed to load dashboard data", err);
      } finally {
        setLoading(false);
      }
    }

    fetchData();
    const interval = setInterval(fetchData, 3000);
    return () => clearInterval(interval);
  }, [hash]);

  function handleSaveHash(e) {
    e?.preventDefault();
    const clean = inputHash.trim().toUpperCase();
    if (clean) {
      setHash(clean);
      localStorage.setItem("wa_hash", clean);
      setIsEditingHash(false);
      setLoading(true);
      window.history.replaceState(null, "", `?hash=${clean}`);
    }
  }

  async function handleVote(pollId, option) {
    setVotingId(pollId);
    try {
      const res = await fetch(`/api/polls/${pollId}?hash=${hash}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ option, source: "panel" }),
      });
      if (res.ok) {
        const data = await res.json();
        setPolls((prev) =>
          prev.map((p) => (p.id === pollId ? data.poll : p))
        );
      }
    } catch (err) {
      console.error("Vote failed", err);
    } finally {
      setVotingId(null);
    }
  }

  function openEditModal() {
    setConfigForm({
      ownerPhone: connInfo?.connection?.ownerPhone || "",
      allowedRecipients: Array.isArray(connInfo?.connection?.allowedRecipients)
        ? connInfo.connection.allowedRecipients.join(", ")
        : connInfo?.connection?.allowedRecipients || "",
      aiApiKey: "",
      aiModel: connInfo?.connection?.aiModel || "qwen/qwen3.8-27b",
    });
    setKeyStatus({ state: "idle", message: "", provider: "", models: [] });
    setConfigError("");
    setConfigSuccess("");
    setIsConfigOpen(true);
  }

  function handleApiKeyChange(e) {
    const val = e.target.value;
    setConfigForm((prev) => ({ ...prev, aiApiKey: val }));

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
            setConfigForm((prev) => ({ ...prev, aiModel: data.defaultModel }));
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

  async function handleSaveConfig(e) {
    e.preventDefault();
    setSavingConfig(true);
    setConfigError("");
    setConfigSuccess("");

    try {
      const res = await fetch(`/api/connections/${hash}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ownerPhone: configForm.ownerPhone,
          allowedRecipients: configForm.allowedRecipients,
          aiApiKey: configForm.aiApiKey || undefined,
          aiModel: configForm.aiModel,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update configuration");

      setConfigSuccess("Configuration updated & synced with bridge! ✓");
      setTimeout(() => {
        setIsConfigOpen(false);
      }, 1200);
    } catch (err) {
      setConfigError(err.message);
    } finally {
      setSavingConfig(false);
    }
  }

  const pending = polls.filter((p) => p.status === "pending");

  return (
    <main style={{ maxWidth: 760, margin: "0 auto", padding: 24, fontFamily: "system-ui, sans-serif" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <img src="/logo.svg" alt="WhatsApp AI" style={{ width: 44, height: 44 }} />
          <div>
            <h1 style={{ fontSize: 22, margin: 0 }}>Take-Over Control Panel</h1>
            <p style={{ margin: "2px 0 0" }}>
              <a href="/setup" style={{ color: "#2b6cb0", fontSize: 13, textDecoration: "none", fontWeight: 500 }}>
                + New Connection Setup
              </a>
            </p>
          </div>
        </div>

        {/* Quick Connection Code Switcher */}
        <div style={{ background: "#f8fafc", padding: "6px 12px", borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 13 }}>
          {isEditingHash || !hash ? (
            <form onSubmit={handleSaveHash} style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <input
                value={inputHash}
                onChange={(e) => setInputHash(e.target.value.toUpperCase())}
                placeholder="e.g. VB552P"
                maxLength={8}
                style={{
                  width: 90,
                  padding: "4px 8px",
                  borderRadius: 4,
                  border: "1px solid #cbd5e1",
                  fontWeight: 700,
                  fontSize: 13,
                  textTransform: "uppercase",
                }}
                autoFocus
              />
              <button
                type="submit"
                style={{
                  background: "#2563eb",
                  color: "#fff",
                  border: "none",
                  padding: "4px 10px",
                  borderRadius: 4,
                  cursor: "pointer",
                  fontSize: 12,
                  fontWeight: 600,
                }}
              >
                Load
              </button>
              {hash && (
                <button
                  type="button"
                  onClick={() => setIsEditingHash(false)}
                  style={{ background: "none", border: "none", color: "#64748b", cursor: "pointer", fontSize: 12 }}
                >
                  Cancel
                </button>
              )}
            </form>
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ color: "#64748b" }}>Code:</span>
              <code style={{ fontWeight: 700, fontSize: 14, color: "#0f172a" }}>{hash}</code>
              <button
                onClick={() => {
                  setInputHash(hash);
                  setIsEditingHash(true);
                }}
                style={{
                  background: "none",
                  border: "1px solid #cbd5e1",
                  padding: "2px 6px",
                  borderRadius: 4,
                  fontSize: 11,
                  color: "#475569",
                  cursor: "pointer",
                }}
              >
                Switch
              </button>
            </div>
          )}
        </div>
      </div>

      {/* No Connection Entered State */}
      {!hash && (
        <div style={{ background: "#f8fafc", border: "1px dashed #cbd5e1", borderRadius: 12, padding: 32, textAlign: "center", margin: "20px 0" }}>
          <h2 style={{ fontSize: 18, margin: "0 0 8px" }}>Enter your Connection Code</h2>
          <p style={{ color: "#64748b", fontSize: 14, margin: "0 0 16px" }}>
            Enter your 6-character code (e.g. <code>VB552P</code>) to view live takeover polls, messages, and link status.
          </p>
          <form onSubmit={handleSaveHash} style={{ display: "inline-flex", gap: 8 }}>
            <input
              value={inputHash}
              onChange={(e) => setInputHash(e.target.value.toUpperCase())}
              placeholder="e.g. VB552P"
              maxLength={8}
              style={{
                padding: "8px 12px",
                borderRadius: 6,
                border: "1px solid #cbd5e1",
                fontSize: 16,
                fontWeight: 700,
                letterSpacing: 1,
                textAlign: "center",
                width: 140,
              }}
            />
            <button
              type="submit"
              style={{
                background: "#2563eb",
                color: "#fff",
                border: "none",
                padding: "8px 18px",
                borderRadius: 6,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Open Panel →
            </button>
          </form>
        </div>
      )}

      {/* Connection Info Banner */}
      {hash && connInfo && (
        <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 10, padding: "12px 16px", marginBottom: 20, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ width: 10, height: 10, borderRadius: "50%", background: connInfo.whatsapp === "linked" ? "#22c55e" : "#eab308" }} />
            <div>
              <div style={{ fontWeight: 600, fontSize: 14, color: "#166534" }}>
                {connInfo.whatsapp === "linked" ? "WhatsApp Connected & Live" : "Pairing in progress..."}
              </div>
              <div style={{ fontSize: 12, color: "#15803d" }}>
                Owner: {connInfo.connection?.ownerPhone || "Configured"} | Recipient: {Array.isArray(connInfo.connection?.allowedRecipients) ? connInfo.connection.allowedRecipients.join(", ") : connInfo.connection?.allowedRecipients || "Active"}
              </div>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {connInfo.connection?.aiModel && (
              <span style={{ fontSize: 12, background: "#dcfce7", color: "#15803d", padding: "4px 8px", borderRadius: 6, fontWeight: 500 }}>
                {connInfo.connection.aiModel}
              </span>
            )}
            <button
              onClick={openEditModal}
              style={{
                background: "#ffffff",
                border: "1px solid #86efac",
                color: "#166534",
                padding: "4px 10px",
                borderRadius: 6,
                fontSize: 12,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              ⚙️ Edit Config
            </button>
          </div>
        </div>
      )}

      {/* Edit Config Modal */}
      {isConfigOpen && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: 16 }}>
          <div style={{ background: "#fff", borderRadius: 12, padding: 24, maxWidth: 500, width: "100%", boxShadow: "0 20px 25px -5px rgba(0,0,0,0.1)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <h2 style={{ fontSize: 18, margin: 0 }}>⚙️ Edit Connection Settings</h2>
              <button
                onClick={() => setIsConfigOpen(false)}
                style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "#64748b" }}
              >
                ✕
              </button>
            </div>

            {configError && (
              <div style={{ color: "#b91c1c", background: "#fef2f2", padding: "8px 12px", borderRadius: 6, fontSize: 13, marginBottom: 12 }}>
                {configError}
              </div>
            )}
            {configSuccess && (
              <div style={{ color: "#15803d", background: "#f0fdf4", padding: "8px 12px", borderRadius: 6, fontSize: 13, marginBottom: 12 }}>
                {configSuccess}
              </div>
            )}

            <form onSubmit={handleSaveConfig} style={{ display: "grid", gap: 12 }}>
              <label style={{ display: "grid", gap: 4 }}>
                <span style={{ fontWeight: 600, fontSize: 13 }}>OWNER_PHONE</span>
                <input
                  value={configForm.ownerPhone}
                  onChange={(e) => setConfigForm({ ...configForm, ownerPhone: e.target.value })}
                  placeholder="e.g. 917060410033"
                  style={{ padding: 8, borderRadius: 6, border: "1px solid #ccc", fontSize: 14 }}
                />
              </label>

              <label style={{ display: "grid", gap: 4 }}>
                <span style={{ fontWeight: 600, fontSize: 13 }}>ALLOWED_RECIPIENTS</span>
                <input
                  value={configForm.allowedRecipients}
                  onChange={(e) => setConfigForm({ ...configForm, allowedRecipients: e.target.value })}
                  placeholder="e.g. 917893472546"
                  style={{ padding: 8, borderRadius: 6, border: "1px solid #ccc", fontSize: 14 }}
                />
              </label>

              <div style={{ display: "grid", gap: 4 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontWeight: 600, fontSize: 13 }}>AI API KEY (OpenRouter, Gemini, OpenAI)</span>
                  {keyStatus.state === "checking" && (
                    <span style={{ fontSize: 11, color: "#6b7280" }}>⏳ Verifying...</span>
                  )}
                  {keyStatus.state === "valid" && (
                    <span style={{ fontSize: 11, color: "#16a34a", fontWeight: 600 }}>{keyStatus.message}</span>
                  )}
                  {keyStatus.state === "invalid" && (
                    <span style={{ fontSize: 11, color: "#dc2626", fontWeight: 600 }}>❌ {keyStatus.message}</span>
                  )}
                </div>
                <input
                  type="password"
                  value={configForm.aiApiKey}
                  onChange={handleApiKeyChange}
                  placeholder="Paste your API key to update"
                  style={{
                    padding: 8,
                    borderRadius: 6,
                    border: `1px solid ${
                      keyStatus.state === "valid"
                        ? "#22c55e"
                        : keyStatus.state === "invalid"
                        ? "#ef4444"
                        : "#ccc"
                    }`,
                    fontSize: 14,
                  }}
                />
                <small style={{ color: "#64748b", fontSize: 11 }}>
                  Leave empty if you don't want to change the existing key.
                </small>
              </div>

              {keyStatus.models?.length > 0 ? (
                <div style={{ display: "grid", gap: 4 }}>
                  <span style={{ fontWeight: 600, fontSize: 13 }}>AI MODEL</span>
                  <select
                    value={configForm.aiModel}
                    onChange={(e) => setConfigForm({ ...configForm, aiModel: e.target.value })}
                    style={{ padding: 8, borderRadius: 6, border: "1px solid #ccc", fontSize: 14, background: "#fff" }}
                  >
                    {keyStatus.models.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name || m.id}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <label style={{ display: "grid", gap: 4 }}>
                  <span style={{ fontWeight: 600, fontSize: 13 }}>AI MODEL</span>
                  <input
                    value={configForm.aiModel}
                    onChange={(e) => setConfigForm({ ...configForm, aiModel: e.target.value })}
                    placeholder="e.g. qwen/qwen3.8-27b"
                    style={{ padding: 8, borderRadius: 6, border: "1px solid #ccc", fontSize: 14 }}
                  />
                </label>
              )}

              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 8 }}>
                <button
                  type="button"
                  onClick={() => setIsConfigOpen(false)}
                  style={{ padding: "8px 16px", borderRadius: 6, border: "1px solid #ccc", background: "#fff", cursor: "pointer" }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingConfig}
                  style={{ padding: "8px 18px", borderRadius: 6, border: "none", background: "#2563eb", color: "#fff", fontWeight: 600, cursor: "pointer" }}
                >
                  {savingConfig ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Pending Polls Section */}
      {hash && (
        <>
          {pending.length > 0 && (
            <section style={{ marginBottom: 24 }}>
              <h2 style={{ fontSize: 16, display: "flex", alignItems: "center", gap: 8, color: "#1e293b", margin: "0 0 12px" }}>
                <span>🔥 Pending Takeovers ({pending.length})</span>
              </h2>
              {pending.map((p) => (
                <div key={p.id} style={{ border: "1px solid #bfdbfe", background: "#eff6ff", borderRadius: 10, padding: 18, marginBottom: 12, boxShadow: "0 2px 4px rgba(0,0,0,0.02)" }}>
                  <div style={{ fontWeight: 700, fontSize: 16, color: "#1e3a8a" }}>
                    💬 {p.contactDisplay} texted you
                  </div>
                  <div style={{ color: "#334155", margin: "6px 0 14px", fontSize: 15 }}>
                    {p.question}
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 8 }}>
                    {(p.options || ["Send 1 text", "5 minutes", "2 hours", "Deny"]).map((opt) => (
                      <button
                        key={opt}
                        type="button"
                        disabled={votingId === p.id}
                        onClick={() => handleVote(p.id, opt)}
                        style={{
                          padding: "10px 14px",
                          borderRadius: 6,
                          border: opt === "Deny" ? "1px solid #fecaca" : "1px solid #93c5fd",
                          background: opt === "Deny" ? "#fef2f2" : "#ffffff",
                          color: opt === "Deny" ? "#dc2626" : "#1d4ed8",
                          fontWeight: 600,
                          fontSize: 13,
                          cursor: "pointer",
                          transition: "all 0.15s ease",
                        }}
                      >
                        {opt}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </section>
          )}

          {/* Live Recent Messages from Contacts */}
          <section style={{ marginBottom: 24 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <h2 style={{ fontSize: 16, margin: 0, color: "#1e293b" }}>💬 Live Recent Messages</h2>
              <span style={{ fontSize: 12, color: "#64748b" }}>Auto-refreshing (3s)</span>
            </div>

            {messages.length === 0 ? (
              <div style={{ padding: 20, textAlign: "center", background: "#f8fafc", borderRadius: 8, border: "1px solid #f1f5f9", color: "#64748b", fontSize: 13 }}>
                No messages recorded yet. Live texts will stream here automatically.
              </div>
            ) : (
              <div style={{ display: "grid", gap: 8 }}>
                {messages.slice(0, 10).map((m, idx) => (
                  <div
                    key={idx}
                    style={{
                      border: "1px solid #e2e8f0",
                      background: m.isFromMe ? "#f0fdf4" : "#ffffff",
                      borderRadius: 8,
                      padding: "10px 14px",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "flex-start",
                      gap: 12,
                    }}
                  >
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                        <span style={{ fontWeight: 600, fontSize: 13, color: m.isFromMe ? "#166534" : "#1e293b" }}>
                          {m.isFromMe ? "You (Me)" : m.senderName || m.sender}
                        </span>
                        <span
                          style={{
                            fontSize: 10,
                            padding: "1px 6px",
                            borderRadius: 4,
                            background: m.isFromMe ? "#dcfce7" : "#e0e7ff",
                            color: m.isFromMe ? "#15803d" : "#4338ca",
                            fontWeight: 600,
                          }}
                        >
                          {m.isFromMe ? "OUTGOING →" : "INCOMING ←"}
                        </span>
                      </div>
                      <div style={{ color: "#334155", fontSize: 14 }}>
                        {m.content || (m.mediaType ? `[${m.mediaType}]` : "(no text)")}
                      </div>
                    </div>
                    <span style={{ color: "#94a3b8", fontSize: 11, whiteSpace: "nowrap" }}>
                      {m.timestamp ? new Date(m.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : ""}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* History Section */}
          <section>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <h2 style={{ fontSize: 16, margin: 0, color: "#334155" }}>Take-over History</h2>
            </div>

            {loading && polls.length === 0 && (
              <p style={{ color: "#64748b", fontSize: 14 }}>Loading polls...</p>
            )}

            {!loading && polls.length === 0 && (
              <div style={{ padding: 20, textAlign: "center", background: "#f8fafc", borderRadius: 8, border: "1px solid #f1f5f9", color: "#64748b", fontSize: 13 }}>
                No past takeovers yet.
              </div>
            )}

            {polls.map((p) => (
              <div key={p.id} style={{ border: "1px solid #f1f5f9", background: "#ffffff", borderRadius: 8, padding: "12px 16px", marginBottom: 8 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <strong style={{ fontSize: 14, color: "#0f172a" }}>{p.contactDisplay}</strong>
                  <span style={{ color: "#94a3b8", fontSize: 12 }}>
                    {p.createdAt ? new Date(p.createdAt).toLocaleTimeString() : ""}
                  </span>
                </div>
                <div style={{ color: "#475569", margin: "4px 0", fontSize: 13 }}>{p.question}</div>
                <div style={{ fontSize: 12, fontWeight: 500, color: p.status === "answered" ? "#16a34a" : p.status === "expired" ? "#ea580c" : "#2563eb" }}>
                  {p.status === "answered"
                    ? `✓ Granted: ${p.selectedOption} (${p.source || "watch"})`
                    : p.status === "expired"
                    ? "Expired / Fallback"
                    : "⏳ Pending answer"}
                </div>
              </div>
            ))}
          </section>
        </>
      )}
    </main>
  );
}
