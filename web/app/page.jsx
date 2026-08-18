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
  const [chats, setChats] = useState([]);
  const [polls, setPolls] = useState([]);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [votingId, setVotingId] = useState(null);

  // Active Chat Selection & Filtering
  const [selectedContact, setSelectedContact] = useState("");
  const [selectedContactName, setSelectedContactName] = useState("");
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

  // Resizable Sidebar State (15% to 50%)
  const [sidebarWidth, setSidebarWidth] = useState(30);
  const [isDragging, setIsDragging] = useState(false);
  const isDraggingRef = useRef(false);
  const appWindowRef = useRef(null);

  // 1. Initialize hash and sidebar width from URL query or localStorage
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

    const savedWidth = localStorage.getItem("wa_sidebar_width");
    if (savedWidth) {
      const parsed = parseFloat(savedWidth);
      if (!isNaN(parsed) && parsed >= 15 && parsed <= 50) {
        setSidebarWidth(parsed);
      }
    }
  }, []);

  // Handle Dragging Divider (Clamped between 15% and 50%)
  function handleMouseDown(e) {
    e.preventDefault();
    isDraggingRef.current = true;
    setIsDragging(true);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    const handleMouseMove = (moveEvent) => {
      if (!isDraggingRef.current || !appWindowRef.current) return;
      const rect = appWindowRef.current.getBoundingClientRect();
      const newWidthPx = moveEvent.clientX - rect.left;
      const newWidthPct = (newWidthPx / rect.width) * 100;
      const clamped = Math.min(Math.max(newWidthPct, 15), 50);
      setSidebarWidth(clamped);
    };

    const handleMouseUp = () => {
      if (isDraggingRef.current) {
        isDraggingRef.current = false;
        setIsDragging(false);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        setSidebarWidth((latest) => {
          localStorage.setItem("wa_sidebar_width", String(latest));
          return latest;
        });
      }
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
  }

  // 2. Fetch live connection info, chats, polls, and messages
  async function fetchDashboardData(isManual = false) {
    if (!hash) {
      setLoading(false);
      return;
    }
    if (isManual) setRefreshing(true);

    try {
      const [connRes, chatsRes, pollsRes, msgsRes] = await Promise.all([
        fetch(`/api/connections/${hash}`, { cache: "no-store" }),
        fetch(`/api/chats?limit=50`, { cache: "no-store" }),
        fetch(`/api/polls?hash=${hash}&limit=50`, { cache: "no-store" }),
        fetch(`/api/connections/${hash}/messages?limit=200`, { cache: "no-store" }),
      ]);

      let loadedChats = [];
      if (chatsRes.ok) {
        const chatsData = await chatsRes.json();
        loadedChats = chatsData.chats || [];
        setChats(loadedChats);
      }

      if (connRes.ok) {
        const connData = await connRes.json();
        setConnInfo(connData);

        // Auto-select first chat or first recipient if none selected
        if (!selectedContact) {
          if (loadedChats.length > 0) {
            setSelectedContact(loadedChats[0].jid || loadedChats[0].phone);
            setSelectedContactName(loadedChats[0].name || "");
          } else if (connData?.connection?.allowedRecipients) {
            const recs = Array.isArray(connData.connection.allowedRecipients)
              ? connData.connection.allowedRecipients
              : typeof connData.connection.allowedRecipients === "string"
              ? connData.connection.allowedRecipients.split(",").map((s) => s.trim())
              : [];
            if (recs.length > 0 && recs[0]) {
              setSelectedContact(recs[0]);
            }
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
    fetchDashboardData();
    const interval = setInterval(fetchDashboardData, 3000);
    return () => clearInterval(interval);
  }, [hash]);

  // 4. Handle Switching Connection Code
  function handleSwitchHash(newHash) {
    const clean = newHash.trim().toUpperCase();
    if (clean) {
      setHash(clean);
      localStorage.setItem("wa_hash", clean);
      setLoading(true);
      window.history.replaceState(null, "", `?hash=${clean}`);
    }
  }

  // Handle Logout / Disconnect
  function handleLogout() {
    localStorage.removeItem("wa_hash");
    setHash("");
    setConnInfo(null);
    setChats([]);
    setMessages([]);
    setPolls([]);
    setSelectedContact("");
    setSelectedContactName("");
    setIsSettingsOpen(false);
    setLoading(false);
    window.history.replaceState(null, "", window.location.pathname);
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
    try {
      const res = await fetch(`/api/polls`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: `poll-${Date.now()}`,
          hash,
          contact: selectedContact,
          contactDisplay: selectedContactName || selectedContact,
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
    const newMsg = {
      id: `msg-${Date.now()}`,
      sender: "me",
      chatJid: selectedContact,
      content: text,
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
      chatJid: selectedContact,
      content: "Drafting autonomous response mirroring your texting persona...",
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
      const res = await fetch(`/api/connections/${hash || "default"}`, {
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

  // Filter messages for selected contact / chatJid
  const cleanSelected = selectedContact.replace(/\D/g, "");
  const currentChatMessages = messages.filter((m) => {
    const chatJid = (m.chatJid || m.chat_jid || "");
    const sender = (m.sender || "");
    const recipient = (m.recipient || "");
    return (
      chatJid === selectedContact ||
      (cleanSelected && chatJid.includes(cleanSelected)) ||
      (cleanSelected && sender.includes(cleanSelected)) ||
      (cleanSelected && recipient.includes(cleanSelected))
    );
  });

  // Filter polls for selected contact
  const currentChatPolls = polls.filter((p) => {
    const c = (p.contact || "").replace(/\D/g, "");
    return (
      p.contact === selectedContact ||
      (cleanSelected && c === cleanSelected) ||
      (cleanSelected && (p.contact || "").includes(cleanSelected))
    );
  });

  const pendingPollsCount = polls.filter((p) => p.status === "pending").length;
  const currentPendingPolls = currentChatPolls.filter((p) => p.status === "pending").length;

  const isSelectedWhitelisted = allowedRecipients.some(
    (r) => String(r).replace(/\D/g, "") === cleanSelected || selectedContact.includes(String(r))
  );

  return (
    <main className="wa-container">
      <div className="wa-app-window" ref={appWindowRef}>
        {/* Left Sidebar */}
        <div
          className="wa-sidebar"
          style={{ width: `${sidebarWidth}%` }}
        >
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
            chats={chats}
            allowedRecipients={allowedRecipients}
            selectedContact={selectedContact}
            onSelectContact={(c, name) => {
              setSelectedContact(c);
              setSelectedContactName(name || "");
            }}
            polls={polls}
            messages={messages}
            searchQuery={searchQuery}
            filterType={filterType}
          />
        </div>

        {/* Draggable Resizer Divider (15% - 50%) */}
        <div
          className={`wa-resizer ${isDragging ? "dragging" : ""}`}
          onMouseDown={handleMouseDown}
          title="Drag to resize sidebar (15% - 50%)"
        />

        {/* Right Active Chat Area */}
        <div
          className="wa-chat-area"
          style={{ width: `calc(${100 - sidebarWidth}% - 5px)` }}
        >
          {selectedContact ? (
            <>
              <ChatHeader
                contact={selectedContact}
                contactName={selectedContactName}
                pendingCount={currentPendingPolls}
                isAutonomyActive={false}
                isWhitelisted={isSelectedWhitelisted}
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
                Select a chat from the left sidebar to view live take-over permission polls, messages, and autonomous replies.
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
        onLogout={handleLogout}
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
