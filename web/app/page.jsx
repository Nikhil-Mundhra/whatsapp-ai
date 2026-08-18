"use client";

import { useState, useEffect, useRef } from "react";
import { SidebarHeader } from "./components/Sidebar/SidebarHeader";
import { SearchBar } from "./components/Sidebar/SearchBar";
import { ContactList } from "./components/Sidebar/ContactList";
import { ChatHeader } from "./components/Chat/ChatHeader";
import { ChatTimeline } from "./components/Chat/ChatTimeline";
import { ChatInputBar } from "./components/Chat/ChatInputBar";
import { SettingsDrawer } from "./components/Modals/SettingsDrawer";
import { ConnectionSwitcherModal } from "./components/Modals/ConnectionSwitcherModal";
import { QRPairingModal } from "./components/Modals/QRPairingModal";
import { LockIcon, RobotIcon } from "./components/Icons/WhatsAppIcons";

export default function Home() {
  const [hash, setHash] = useState("");
  const [connInfo, setConnInfo] = useState(null);
  const [polls, setPolls] = useState([]);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [votingId, setVotingId] = useState(null);

  // Active Chat Selection & Filtering
  const [selectedContact, setSelectedContact] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState("all");

  // Modals & Drawers
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isSwitcherOpen, setIsSwitcherOpen] = useState(false);
  const [isQrModalOpen, setIsQrModalOpen] = useState(false);

  // QR Code State
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [qrTimeLeft, setQrTimeLeft] = useState(20);

  // Settings Form State
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

  // 1. Initialize hash from URL query or localStorage
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlHash = params.get("hash");
    const storedHash = localStorage.getItem("wa_hash");
    const active = urlHash || storedHash || "";
    if (active) {
      setHash(active.toUpperCase());
    } else {
      setLoading(false);
    }
  }, []);

  // 2. Fetch live connection info, polls, and messages
  async function fetchDashboardData(isManual = false) {
    if (!hash) return;
    if (isManual) setRefreshing(true);

    try {
      const [connRes, pollsRes, msgsRes] = await Promise.all([
        fetch(`/api/connections/${hash}`, { cache: "no-store" }),
        fetch(`/api/polls?hash=${hash}&limit=50`, { cache: "no-store" }),
        fetch(`/api/connections/${hash}/messages?limit=50`, { cache: "no-store" }),
      ]);

      if (connRes.ok) {
        const connData = await connRes.json();
        setConnInfo(connData);

        // Auto-select first contact if none selected
        if (!selectedContact && connData?.connection?.allowedRecipients) {
          const recs = Array.isArray(connData.connection.allowedRecipients)
            ? connData.connection.allowedRecipients
            : typeof connData.connection.allowedRecipients === "string"
            ? connData.connection.allowedRecipients.split(",").map((s) => s.trim())
            : [];
          if (recs.length > 0 && recs[0]) {
            setSelectedContact(recs[0]);
          }
        }

        // Trigger QR modal if waiting for QR
        if (connData?.connection?.status === "waiting_qr" && !qrDataUrl) {
          fetchQrCode();
        }
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
      console.error("Dashboard poll failed", err);
    } finally {
      setLoading(false);
      if (isManual) setTimeout(() => setRefreshing(false), 500);
    }
  }

  // 3. Fetch QR Code for pairing
  async function fetchQrCode() {
    if (!hash) return;
    try {
      const res = await fetch(`/api/connections/${hash}/qr`, { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        if (data.qr) {
          setQrDataUrl(data.qr);
          setQrTimeLeft(data.ttl || 20);
        }
      }
    } catch {}
  }

  useEffect(() => {
    if (!hash) return;
    localStorage.setItem("wa_hash", hash);
    fetchDashboardData();
    const interval = setInterval(fetchDashboardData, 3000);
    return () => clearInterval(interval);
  }, [hash]);

  // 4. Handle Switching Connection Code
  function handleSwitchHash(newHash) {
    const clean = newHash.trim().toUpperCase();
    if (clean) {
      setHash(clean);
      setSelectedContact("");
      localStorage.setItem("wa_hash", clean);
      setLoading(true);
      window.history.replaceState(null, "", `?hash=${clean}`);
    }
  }

  // 5. Handle Voting on Take-Over Polls
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

  // 6. Handle Quick Autonomy Grant
  async function handleQuickGrant(durationOption = "5 minutes") {
    if (!selectedContact) return;
    // Creates an optimistic poll or executes a grant
    try {
      const res = await fetch(`/api/polls`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: `poll-${Date.now()}`,
          hash,
          contact: selectedContact,
          question: `Quick Take-Over Grant (${durationOption})`,
          options: ["Send 1 text", "5 minutes", "2 hours", "Deny"],
          createdAt: Date.now(),
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.poll?.id) {
          handleVote(data.poll.id, durationOption);
        }
      }
    } catch (err) {
      console.error("Quick grant error", err);
    }
  }

  // 7. Handle Revoking Autonomy
  async function handleRevoke() {
    if (!selectedContact) return;
    handleQuickGrant("Deny");
  }

  // 8. Handle Manual Messaging / Drafting
  function handleSendManual(text) {
    // Optimistic message append
    const newMsg = {
      id: `msg-${Date.now()}`,
      sender: "me",
      recipient: selectedContact,
      body: text,
      timestamp: new Date().toISOString(),
      isFromMe: true,
      isAi: false,
    };
    setMessages((prev) => [...prev, newMsg]);
  }

  function handleTriggerDraft() {
    const newMsg = {
      id: `msg-${Date.now()}`,
      sender: "ai",
      recipient: selectedContact,
      body: "Drafting autonomous response mirroring your texting persona...",
      timestamp: new Date().toISOString(),
      isFromMe: true,
      isAi: true,
    };
    setMessages((prev) => [...prev, newMsg]);
  }

  // 9. Settings Modal Handlers
  function openSettings() {
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
    setIsSettingsOpen(true);
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
      let data = {};
      try {
        data = await res.json();
      } catch {}

      if (!res.ok) {
        throw new Error(data.error || `Server responded with status ${res.status}`);
      }

      if (data.connection) {
        setConnInfo((prev) => ({
          ...prev,
          connection: { ...prev?.connection, ...data.connection },
        }));
      }

      setConfigSuccess("Configuration updated & synced! ✓");
      setTimeout(() => {
        setIsSettingsOpen(false);
      }, 900);
    } catch (err) {
      setConfigError(err.message || "Failed to update configuration");
    } finally {
      setSavingConfig(false);
    }
  }

  // Allowed contacts list
  const allowedRecipients = Array.isArray(connInfo?.connection?.allowedRecipients)
    ? connInfo.connection.allowedRecipients
    : typeof connInfo?.connection?.allowedRecipients === "string"
    ? connInfo.connection.allowedRecipients.split(",").map((s) => s.trim()).filter(Boolean)
    : [];

  // Filter messages for selected contact
  const cleanSelected = selectedContact.replace(/\D/g, "");
  const currentChatMessages = messages.filter((m) => {
    const s = (m.sender || "").replace(/\D/g, "");
    const r = (m.recipient || "").replace(/\D/g, "");
    return s === cleanSelected || r === cleanSelected;
  });

  // Filter polls for selected contact
  const currentChatPolls = polls.filter((p) => {
    const c = (p.contact || "").replace(/\D/g, "");
    return c === cleanSelected || p.contact === selectedContact;
  });

  const pendingPollsCount = polls.filter((p) => p.status === "pending").length;
  const currentPendingPolls = currentChatPolls.filter((p) => p.status === "pending").length;

  return (
    <main className="wa-container">
      <div className="wa-app-window">
        {/* Left Sidebar */}
        <div className="wa-sidebar">
          <SidebarHeader
            hash={hash}
            connInfo={connInfo}
            onOpenSettings={openSettings}
            onOpenSwitcher={() => setIsSwitcherOpen(true)}
            onRefresh={() => fetchDashboardData(true)}
            refreshing={refreshing}
          />

          <SearchBar
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            filterType={filterType}
            setFilterType={setFilterType}
            pendingCount={pendingPollsCount}
          />

          <ContactList
            contacts={allowedRecipients}
            selectedContact={selectedContact}
            onSelectContact={(c) => setSelectedContact(c)}
            polls={polls}
            messages={messages}
            searchQuery={searchQuery}
            filterType={filterType}
          />
        </div>

        {/* Right Active Chat Area */}
        <div className="wa-chat-area">
          {!hash ? (
            <div className="wa-empty-state">
              <div
                style={{
                  width: 80,
                  height: 80,
                  borderRadius: "50%",
                  background: "#e2e8f0",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <RobotIcon size={40} color="#008069" />
              </div>
              <h2>Welcome to Take-Over Control Panel</h2>
              <p>
                Enter your 6-character connection code to access your live WhatsApp AI take-over polls, persona texting stream, and smartwatch grants.
              </p>
              <button
                onClick={() => setIsSwitcherOpen(true)}
                style={{
                  marginTop: 18,
                  background: "#00a884",
                  color: "#ffffff",
                  border: "none",
                  borderRadius: 8,
                  padding: "10px 20px",
                  fontWeight: 600,
                  fontSize: 14,
                  cursor: "pointer",
                  boxShadow: "0 2px 4px rgba(0, 168, 132, 0.3)",
                }}
              >
                Enter Connection Code →
              </button>
            </div>
          ) : selectedContact ? (
            <>
              <ChatHeader
                contact={selectedContact}
                pendingCount={currentPendingPolls}
                isAutonomyActive={false}
                onQuickGrant={handleQuickGrant}
                onRevoke={handleRevoke}
              />

              <ChatTimeline
                messages={currentChatMessages}
                polls={currentChatPolls}
                onVote={handleVote}
                votingId={votingId}
                contact={selectedContact}
              />

              <ChatInputBar
                contact={selectedContact}
                onSendManual={handleSendManual}
                onTriggerDraft={handleTriggerDraft}
              />
            </>
          ) : (
            <div className="wa-empty-state">
              <div
                style={{
                  width: 72,
                  height: 72,
                  borderRadius: "50%",
                  background: "#ffffff",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
                }}
              >
                <RobotIcon size={36} color="#00a884" />
              </div>
              <h2>WhatsApp AI Take-Over</h2>
              <p>
                Select an allowed contact from the left sidebar to view live take-over permission polls, messages, and autonomous replies.
              </p>
              <div
                style={{
                  marginTop: 28,
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  color: "#8696a0",
                  fontSize: 12,
                }}
              >
                <LockIcon size={13} color="#8696a0" />
                <span>End-to-end encrypted autonomous texting companion</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Slide-out Settings Drawer */}
      <SettingsDrawer
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        configForm={configForm}
        setConfigForm={setConfigForm}
        onSave={handleSaveConfig}
        saving={savingConfig}
        error={configError}
        success={configSuccess}
        keyStatus={keyStatus}
        onApiKeyChange={handleApiKeyChange}
      />

      {/* Connection Hash Switcher Modal */}
      <ConnectionSwitcherModal
        isOpen={isSwitcherOpen}
        onClose={() => setIsSwitcherOpen(false)}
        currentHash={hash}
        onSwitchHash={handleSwitchHash}
      />

      {/* QR Pairing Modal */}
      <QRPairingModal
        isOpen={isQrModalOpen}
        onClose={() => setIsQrModalOpen(false)}
        qrDataUrl={qrDataUrl}
        timeLeft={qrTimeLeft}
        onRefreshQr={fetchQrCode}
      />
    </main>
  );
}
