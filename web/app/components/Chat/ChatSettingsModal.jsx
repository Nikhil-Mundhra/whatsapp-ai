"use client";

import { useState, useEffect, useRef } from "react";

function ContactAvatar({ name }) {
  const initial = name ? name.slice(0, 2).toUpperCase() : "?";
  return (
    <div style={{
      width: 80, height: 80, borderRadius: "50%",
      background: "linear-gradient(135deg, #008069, #00a884)",
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: 28, fontWeight: 700, color: "#fff", flexShrink: 0,
    }}>
      {initial}
    </div>
  );
}

function CirclePill({ jid, name, onRemove }) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 6,
      background: "var(--wa-input-bg, #2a3942)", color: "var(--wa-text-primary, #e9edef)",
      borderRadius: 16, padding: "4px 10px", fontSize: 13, flexShrink: 0,
    }}>
      {name || jid}
      <button onClick={() => onRemove(jid)} style={{
        background: "none", border: "none", cursor: "pointer",
        color: "var(--wa-icon-color, #8696a0)", padding: 0, fontSize: 14,
        display: "flex", alignItems: "center",
      }}>×</button>
    </span>
  );
}

export function ChatSettingsModal({ contact, contactName, hash, chats = [], onClose }) {
  const [settings, setSettings] = useState({ relationship: "", friendCircle: [], customPrompt: "", model: "" });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [circleSearch, setCircleSearch] = useState("");
  const [showCircleDropdown, setShowCircleDropdown] = useState(false);
  const circleRef = useRef(null);

  // Load existing settings on open
  useEffect(() => {
    if (!contact || !hash) return;
    setLoading(true);
    fetch(`/api/connections/${hash}/chats/${encodeURIComponent(contact)}/settings`)
      .then((r) => r.json())
      .then((data) => {
        if (data?.settings) {
          setSettings({
            relationship: data.settings.relationship || "",
            friendCircle: data.settings.friendCircle || [],
            customPrompt: data.settings.customPrompt || "",
            model: data.settings.model || "",
          });
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [contact, hash]);

  // Close dropdown on outside click
  useEffect(() => {
    function handler(e) {
      if (circleRef.current && !circleRef.current.contains(e.target)) {
        setShowCircleDropdown(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch(`/api/connections/${hash}/chats/${encodeURIComponent(contact)}/settings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      if (res.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 2500);
      }
    } catch {}
    setSaving(false);
  }

  function addToCircle(jid) {
    if (!settings.friendCircle.includes(jid)) {
      setSettings((s) => ({ ...s, friendCircle: [...s.friendCircle, jid] }));
    }
    setCircleSearch("");
    setShowCircleDropdown(false);
  }

  function removeFromCircle(jid) {
    setSettings((s) => ({ ...s, friendCircle: s.friendCircle.filter((f) => f !== jid) }));
  }

  const availableChats = chats.filter(
    (c) => c.jid !== contact && !settings.friendCircle.includes(c.jid)
  );
  const filteredChats = availableChats.filter((c) =>
    (c.name || c.jid).toLowerCase().includes(circleSearch.toLowerCase())
  );

  const wordCount = settings.relationship.trim().split(/\s+/).filter(Boolean).length;

  return (
    <div className="wa-drawer-backdrop" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="wa-drawer" style={{ width: 420 }}>
        {/* Header */}
        <div className="wa-drawer-header">
          <button onClick={onClose} style={{
            background: "none", border: "none", cursor: "pointer",
            color: "#fff", display: "flex", alignItems: "center", flexShrink: 0,
          }}>
            <svg width={20} height={20} viewBox="0 0 24 24" fill="currentColor">
              <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/>
            </svg>
          </button>
          <span style={{ fontSize: 18, fontWeight: 600 }}>Contact info & AI</span>
        </div>

        {/* Body */}
        <div className="wa-drawer-body">
          {/* Contact Info Card */}
          <div className="wa-card" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, padding: "24px 20px" }}>
            <ContactAvatar name={contactName || contact} />
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 20, fontWeight: 700, color: "var(--wa-text-primary, #e9edef)" }}>
                {contactName || contact}
              </div>
              <div style={{ fontSize: 13, color: "var(--wa-text-secondary, #8696a0)", marginTop: 2 }}>
                {contact}
              </div>
            </div>
          </div>

          {loading ? (
            <div style={{ textAlign: "center", color: "var(--wa-text-secondary, #8696a0)", padding: 24 }}>Loading…</div>
          ) : (
            <>
              {/* Relationship Type */}
              <div className="wa-card" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <label style={{ fontWeight: 600, fontSize: 14, color: "var(--wa-text-primary, #e9edef)" }}>
                    Relationship &amp; Dynamics
                  </label>
                  <span style={{
                    fontSize: 11, color: wordCount > 100 ? "#ef4444" : "var(--wa-text-secondary, #8696a0)"
                  }}>
                    {wordCount}/100 words
                  </span>
                </div>
                <p style={{ margin: 0, fontSize: 12, color: "var(--wa-text-secondary, #8696a0)" }}>
                  Describe how the AI should relate to this person — tone, intimacy, banter, inside jokes, shared history.
                </p>
                <textarea
                  value={settings.relationship}
                  onChange={(e) => setSettings((s) => ({ ...s, relationship: e.target.value }))}
                  placeholder={`e.g. "Close college bestie, ultra-casual, lots of roasting and inside jokes about hostel life. Very playful but always warm underneath."`}
                  rows={4}
                  style={{
                    width: "100%", boxSizing: "border-box",
                    background: "var(--wa-input-bg, #2a3942)",
                    border: "1px solid var(--wa-input-border, #3b4a54)",
                    borderRadius: 8, padding: "10px 12px",
                    color: "var(--wa-text-primary, #e9edef)", fontSize: 13,
                    resize: "vertical", outline: "none", fontFamily: "inherit",
                  }}
                />
              </div>

              {/* Friend Circle */}
              <div className="wa-card" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <label style={{ fontWeight: 600, fontSize: 14, color: "var(--wa-text-primary, #e9edef)" }}>
                  Friend Circle
                </label>
                <p style={{ margin: 0, fontSize: 12, color: "var(--wa-text-secondary, #8696a0)" }}>
                  Select other chats in the same social circle. The AI will use shared social context when replying.
                </p>

                {/* Pills */}
                {settings.friendCircle.length > 0 && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {settings.friendCircle.map((jid) => {
                      const chat = chats.find((c) => c.jid === jid);
                      return (
                        <CirclePill
                          key={jid}
                          jid={jid}
                          name={chat?.name || jid}
                          onRemove={removeFromCircle}
                        />
                      );
                    })}
                  </div>
                )}

                {/* Dropdown picker */}
                <div ref={circleRef} style={{ position: "relative" }}>
                  <input
                    type="text"
                    placeholder="Search contacts to add…"
                    value={circleSearch}
                    onChange={(e) => { setCircleSearch(e.target.value); setShowCircleDropdown(true); }}
                    onFocus={() => setShowCircleDropdown(true)}
                    style={{
                      width: "100%", boxSizing: "border-box",
                      background: "var(--wa-input-bg, #2a3942)",
                      border: "1px solid var(--wa-input-border, #3b4a54)",
                      borderRadius: 8, padding: "8px 12px",
                      color: "var(--wa-text-primary, #e9edef)", fontSize: 13,
                      outline: "none",
                    }}
                  />
                  {showCircleDropdown && filteredChats.length > 0 && (
                    <div style={{
                      position: "absolute", top: "100%", left: 0, right: 0, zIndex: 20,
                      background: "var(--wa-card-bg, #1f2c34)",
                      border: "1px solid var(--wa-card-border, #2a3942)",
                      borderRadius: 8, maxHeight: 200, overflowY: "auto",
                      boxShadow: "0 8px 24px rgba(0,0,0,0.3)",
                    }}>
                      {filteredChats.slice(0, 20).map((c) => (
                        <button
                          key={c.jid}
                          onClick={() => addToCircle(c.jid)}
                          style={{
                            width: "100%", background: "none", border: "none",
                            padding: "10px 14px", textAlign: "left", cursor: "pointer",
                            color: "var(--wa-text-primary, #e9edef)", fontSize: 13,
                            display: "flex", alignItems: "center", gap: 10,
                            borderBottom: "1px solid var(--wa-divider, #2a3942)",
                          }}
                          onMouseEnter={(e) => e.currentTarget.style.background = "var(--wa-hover-bg, #2a3942)"}
                          onMouseLeave={(e) => e.currentTarget.style.background = "none"}
                        >
                          <span style={{
                            width: 32, height: 32, borderRadius: "50%",
                            background: "linear-gradient(135deg, #008069, #00a884)",
                            display: "flex", alignItems: "center", justifyContent: "center",
                            fontSize: 12, fontWeight: 700, color: "#fff", flexShrink: 0,
                          }}>
                            {(c.name || c.jid).slice(0, 2).toUpperCase()}
                          </span>
                          {c.name || c.jid}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Custom Prompt Override */}
              <div className="wa-card" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <label style={{ fontWeight: 600, fontSize: 14, color: "var(--wa-text-primary, #e9edef)" }}>
                  Custom Prompt (Optional)
                </label>
                <p style={{ margin: 0, fontSize: 12, color: "var(--wa-text-secondary, #8696a0)" }}>
                  Additional context or override instructions for this specific chat. Leave blank to use defaults.
                </p>
                <textarea
                  value={settings.customPrompt}
                  onChange={(e) => setSettings((s) => ({ ...s, customPrompt: e.target.value }))}
                  placeholder="e.g. Never bring up the breakup. Always use Hinglish."
                  rows={3}
                  style={{
                    width: "100%", boxSizing: "border-box",
                    background: "var(--wa-input-bg, #2a3942)",
                    border: "1px solid var(--wa-input-border, #3b4a54)",
                    borderRadius: 8, padding: "10px 12px",
                    color: "var(--wa-text-primary, #e9edef)", fontSize: 13,
                    resize: "vertical", outline: "none", fontFamily: "inherit",
                  }}
                />
              </div>

              {/* Model Override */}
              <div className="wa-card" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <label style={{ fontWeight: 600, fontSize: 14, color: "var(--wa-text-primary, #e9edef)" }}>
                  AI Model (Optional)
                </label>
                <p style={{ margin: 0, fontSize: 12, color: "var(--wa-text-secondary, #8696a0)" }}>
                  Override the AI model for this chat. Leave blank to use the default.
                </p>
                <input
                  type="text"
                  value={settings.model}
                  onChange={(e) => setSettings((s) => ({ ...s, model: e.target.value }))}
                  placeholder="e.g. anthropic/claude-3-haiku or google/gemini-flash-1.5"
                  style={{
                    width: "100%", boxSizing: "border-box",
                    background: "var(--wa-input-bg, #2a3942)",
                    border: "1px solid var(--wa-input-border, #3b4a54)",
                    borderRadius: 8, padding: "10px 12px",
                    color: "var(--wa-text-primary, #e9edef)", fontSize: 13,
                    outline: "none", fontFamily: "inherit",
                  }}
                />
              </div>

              {/* Save Button */}
              <button
                onClick={handleSave}
                disabled={saving || wordCount > 100}
                style={{
                  width: "100%", padding: "13px 0", borderRadius: 8,
                  background: saved ? "#22c55e" : "var(--wa-teal, #00a884)",
                  color: "#fff", border: "none", cursor: saving ? "wait" : "pointer",
                  fontSize: 15, fontWeight: 600, transition: "background 0.2s",
                  opacity: saving || wordCount > 100 ? 0.7 : 1,
                }}
              >
                {saving ? "Saving…" : saved ? "Saved" : "Save Settings"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
