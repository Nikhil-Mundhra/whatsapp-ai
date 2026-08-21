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
import { CreatePollModal } from "./components/Modals/CreatePollModal";
import { UnlistedContactConfirmModal } from "./components/Modals/UnlistedContactConfirmModal";
import { ChatSettingsModal } from "./components/Chat/ChatSettingsModal";
import { LoginCard } from "./components/Auth/LoginCard";
import { LockIcon, RobotIcon } from "./components/Icons/WhatsAppIcons";
import {
  parseRecipientsToContacts,
  serializeContactsToRecipients,
  createContactObject,
} from "../lib/contacts";

export default function Home() {
  const [hash, setHash] = useState("");
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [sessionChecked, setSessionChecked] = useState(false);
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
  const selectedContactRef = useRef("");
  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState("all");

  // Modals & Drawers
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isSwitcherOpen, setIsSwitcherOpen] = useState(false);
  const [isQrModalOpen, setIsQrModalOpen] = useState(false);
  const [isPollModalOpen, setIsPollModalOpen] = useState(false);
  const [isUnlistedModalOpen, setIsUnlistedModalOpen] = useState(false);
  const [isChatSettingsOpen, setIsChatSettingsOpen] = useState(false);
  const [pendingTakeoverAction, setPendingTakeoverAction] = useState(null);
  const [unlistedActionDesc, setUnlistedActionDesc] = useState("take over conversation");

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

  // Theme State (Dark / Light)
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

  // 1. Initialize hash, verify session from Cookies, URL query, or localStorage
  useEffect(() => {
    async function checkSession() {
      const params = new URLSearchParams(window.location.search);
      const urlHash = params.get("hash");
      const storedHash = localStorage.getItem("wa_hash");
      const active = (urlHash || storedHash || "").toUpperCase();

      const savedWidth = localStorage.getItem("wa_sidebar_width");
      if (savedWidth) {
        const parsed = parseFloat(savedWidth);
        if (!isNaN(parsed) && parsed >= 15 && parsed <= 50) {
          setSidebarWidth(parsed);
        }
      }

      if (active) {
        setHash(active);
      }

      const token =
        (active ? localStorage.getItem(`wa_session_${active}`) : "") ||
        localStorage.getItem("wa_auth_token") ||
        "";

      try {
        const res = await fetch("/api/auth/session/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            hash: active || undefined,
            token: token || undefined,
          }),
        });
        const data = await res.json();
        if (data.valid && data.hash) {
          setHash(data.hash);
          setIsAuthenticated(true);
          localStorage.setItem("wa_hash", data.hash);
          if (data.token) {
            localStorage.setItem(`wa_session_${data.hash}`, data.token);
            localStorage.setItem("wa_auth_token", data.token);
          }
        } else {
          setIsAuthenticated(false);
          if (active) {
            localStorage.removeItem(`wa_session_${active}`);
          }
        }
      } catch {
        setIsAuthenticated(false);
      }

      setSessionChecked(true);
      setLoading(false);
    }

    checkSession();
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
        fetch(`/api/chats?hash=${hash}&limit=50`, { cache: "no-store" }),
        fetch(`/api/polls?hash=${hash}&limit=50`, { cache: "no-store" }),
        fetch(`/api/connections/${hash}/messages?limit=200`, { cache: "no-store" }),
      ]);

      let loadedChats = [];
      if (chatsRes.ok) {
        const chatsData = await chatsRes.json();
        loadedChats = chatsData.chats || [];
      }

      let loadedMessages = [];
      if (msgsRes.ok) {
        const msgsData = await msgsRes.json();
        loadedMessages = msgsData.messages || [];
        setMessages(loadedMessages);
      }

      // If /api/chats returned empty (e.g. cloud VM), dynamically derive chat list from loadedMessages
      if (loadedChats.length === 0 && loadedMessages.length > 0) {
        const chatMap = new Map();
        for (const m of loadedMessages) {
          const jid = m.chatJid || m.chat_jid || m.sender || "";
          if (!jid || jid === "status@broadcast") continue;
          const num = jid.split("@")[0];
          const clean = num.replace(/\D/g, "");
          const name = m.senderName || m.chatName || num;
          const isGroup = jid.endsWith("@g.us");

          let key = jid;
          if (!isGroup) {
            for (const [k, v] of chatMap.entries()) {
              if (!v.isGroup) {
                if (clean && v.phone === clean) {
                  key = k;
                  break;
                }
                if (name && v.name === name && !name.match(/^\+?\d+$/)) {
                  key = k;
                  break;
                }
              }
            }
          }

          if (!chatMap.has(key)) {
            chatMap.set(key, {
              jid: key.endsWith("@lid") && !jid.endsWith("@lid") ? jid : key,
              name,
              phone: clean || num,
              lastMessage: m.content || m.body || "",
              lastMessageTime: m.timestamp || null,
              lastIsFromMe: Boolean(m.isFromMe || m.is_from_me),
              isGroup,
              aliases: [jid, clean, num].filter(Boolean),
            });
          } else {
            const existing = chatMap.get(key);
            const existingTime = existing.lastMessageTime ? new Date(existing.lastMessageTime).getTime() : 0;
            const msgTime = m.timestamp ? new Date(m.timestamp).getTime() : 0;
            if (msgTime > existingTime) {
              existing.lastMessage = m.content || m.body || "";
              existing.lastMessageTime = m.timestamp;
              existing.lastIsFromMe = Boolean(m.isFromMe || m.is_from_me);
            }
            if (name && !name.match(/^\+?\d+$/)) {
              existing.name = name;
            }
            if (jid.endsWith("@s.whatsapp.net")) {
              existing.jid = jid;
              existing.phone = clean || existing.phone;
            }
            existing.aliases = Array.from(
              new Set([...(existing.aliases || []), jid, clean, num].filter(Boolean))
            );
          }
        }
        loadedChats = Array.from(chatMap.values());
      }
      setChats(loadedChats);

      if (connRes.ok) {
        const connData = await connRes.json();
        setConnInfo(connData);

        // Auto-select first chat or first recipient ONLY if none is currently selected
        if (!selectedContactRef.current) {
          if (loadedChats.length > 0) {
            const first = loadedChats[0].jid || loadedChats[0].phone;
            const firstName = loadedChats[0].name || "";
            setSelectedContact(first);
            setSelectedContactName(firstName);
            selectedContactRef.current = first;
          } else if (connData?.connection?.allowedRecipients) {
            const recs = Array.isArray(connData.connection.allowedRecipients)
              ? connData.connection.allowedRecipients
              : typeof connData.connection.allowedRecipients === "string"
              ? connData.connection.allowedRecipients.split(",").map((s) => s.trim())
              : [];
            if (recs.length > 0 && recs[0]) {
              setSelectedContact(recs[0]);
              selectedContactRef.current = recs[0];
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
  function handleSwitchHash(newHash, newToken) {
    const clean = newHash.trim().toUpperCase();
    if (clean) {
      setHash(clean);
      setIsAuthenticated(true);
      localStorage.setItem("wa_hash", clean);
      if (newToken) {
        localStorage.setItem(`wa_session_${clean}`, newToken);
        localStorage.setItem("wa_auth_token", newToken);
      }
      setLoading(true);
      window.history.replaceState(null, "", `?hash=${clean}`);
    }
  }

  // Handle Successful Login
  function handleLoginSuccess({ hash: loggedInHash, token }) {
    setHash(loggedInHash);
    setIsAuthenticated(true);
    localStorage.setItem("wa_hash", loggedInHash);
    localStorage.setItem(`wa_session_${loggedInHash}`, token);
    localStorage.setItem("wa_auth_token", token);
    window.history.replaceState(null, "", `?hash=${loggedInHash}`);
    setLoading(true);
  }

  // Handle Logout / Disconnect
  async function handleLogout() {
    const token =
      localStorage.getItem(`wa_session_${hash}`) ||
      localStorage.getItem("wa_auth_token") ||
      "";
    if (token) {
      try {
        await fetch("/api/auth/logout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });
      } catch {}
    }

    selectedContactRef.current = "";
    localStorage.removeItem("wa_hash");
    if (hash) {
      localStorage.removeItem(`wa_session_${hash}`);
    }
    localStorage.removeItem("wa_auth_token");
    setHash("");
    setIsAuthenticated(false);
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

  // Allowed contacts list
  const allowedRecipients = Array.isArray(connInfo?.connection?.allowedRecipients)
    ? connInfo.connection.allowedRecipients
    : typeof connInfo?.connection?.allowedRecipients === "string"
    ? connInfo.connection.allowedRecipients.split(",").map((s) => s.trim()).filter(Boolean)
    : [];

  const isSelectedWhitelisted = allowedRecipients.some((r) => {
    const cleanR = String(r).replace(/\D/g, "");
    const cleanSel = (selectedContact || "").replace(/\D/g, "");
    return (
      (cleanR && cleanSel && cleanR === cleanSel) ||
      (selectedContact && String(selectedContact).includes(String(r))) ||
      (r && String(r).includes(selectedContact))
    );
  });

  // Active Autonomy Grants State (by contact JID/phone)
  const [activeGrants, setActiveGrants] = useState({});

  // Poll Configuration Template
  const [pollConfig, setPollConfig] = useState({
    question: "Permission to take over conversation?",
    options: ["Send 1 text", "5 minutes", "2 hours", "Deny"],
  });

  // 5. Execute Voting on Take-Over Polls
  async function executeVote(pollId, option, contact = selectedContact) {
    setVotingId(pollId);
    try {
      const res = await fetch(`/api/polls/${pollId}?hash=${hash}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          option,
          source: "panel",
          contact: contact || selectedContact,
        }),
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

  // Handle Voting on Take-Over Polls (with Unlisted Contact Interception)
  async function handleVote(pollId, option) {
    const isDeny = (option || "").toLowerCase().includes("deny");
    if (!isSelectedWhitelisted && !isDeny) {
      setUnlistedActionDesc(`grant "${option}"`);
      setPendingTakeoverAction({ type: "vote", pollId, option });
      setIsUnlistedModalOpen(true);
      return;
    }
    await executeVote(pollId, option);
  }

  // Execute Direct Quick Vote
  async function executeQuickVote(option, question, options, targetContact = selectedContact) {
    if (!targetContact || !hash) return;

    // Optimistic grant activation
    const optLower = (option || "").toLowerCase();
    if (optLower.includes("5 min")) {
      setActiveGrants((prev) => ({
        ...prev,
        [targetContact]: { type: "duration", expiresAt: Date.now() + 5 * 60 * 1000 },
      }));
    } else if (optLower.includes("2 hour") || optLower.includes("2 hr")) {
      setActiveGrants((prev) => ({
        ...prev,
        [targetContact]: { type: "duration", expiresAt: Date.now() + 2 * 60 * 60 * 1000 },
      }));
    } else if (optLower.includes("1 text") || optLower.includes("1") || optLower.includes("send 1")) {
      setActiveGrants((prev) => ({
        ...prev,
        [targetContact]: { type: "count", remainingCount: 1, expiresAt: Date.now() + 10 * 60 * 1000 },
      }));
    } else {
      setActiveGrants((prev) => ({
        ...prev,
        [targetContact]: { type: "none" },
      }));
    }

    try {
      await fetch(`/api/connections/${hash}/grant`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          option,
          contact: targetContact,
        }),
      });
    } catch (err) {
      console.error("Quick vote grant failed", err);
    }
  }

  // 6. Handle Direct Quick Vote from Overlay (with Unlisted Contact Interception)
  async function handleQuickVote(option, question, options) {
    const isDeny = (option || "").toLowerCase().includes("deny");
    if (!isSelectedWhitelisted && !isDeny) {
      setUnlistedActionDesc(`grant "${option}"`);
      setPendingTakeoverAction({ type: "quick_vote", option, question, options });
      setIsUnlistedModalOpen(true);
      return;
    }
    await executeQuickVote(option, question, options);
  }

  // 7. Handle Revoking Take-Over Autonomy
  async function handleRevokeAutonomy(notifyBridge = true) {
    if (!selectedContact) return;
    setActiveGrants((prev) => ({
      ...prev,
      [selectedContact]: { type: "none" },
    }));

    if (notifyBridge && hash) {
      try {
        await executeQuickVote("Deny", pollConfig.question, pollConfig.options, selectedContact);
      } catch (err) {
        console.warn("Revoke failed", err);
      }
    }
  }

  // Execute Saving/Sending Custom Poll
  async function executeSaveCustomPoll({ question, options, allowMultiple = false }) {
    if (!selectedContact || !hash) return;
    try {
      const res = await fetch(`/api/polls`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: `poll-${Date.now()}`,
          hash,
          contact: selectedContact,
          contactDisplay: selectedContactName || selectedContact,
          question,
          options,
          allowMultiple,
          createdAt: Date.now(),
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.poll) {
          setPolls((prev) => [data.poll, ...prev.filter((p) => p.id !== data.poll.id)]);
        }
      }
    } catch (err) {
      console.error("Failed to create take-over poll", err);
    }
  }

  // 8. Handle Saving/Sending Customized Poll from Editor (with Unlisted Contact Interception)
  async function handleSaveCustomPoll({ question, options, allowMultiple = false }) {
    setPollConfig({ question, options });
    if (!isSelectedWhitelisted) {
      setUnlistedActionDesc("send a custom take-over poll");
      setPendingTakeoverAction({
        type: "custom_poll",
        params: { question, options, allowMultiple },
      });
      setIsUnlistedModalOpen(true);
      return;
    }
    await executeSaveCustomPoll({ question, options, allowMultiple });
  }

  // Handle Confirmation of Take-Over for Unlisted Contact
  async function handleConfirmUnlistedTakeover({ addToWhitelist }) {
    const contactToGrant = selectedContact;
    if (addToWhitelist && contactToGrant) {
      const nextAllowed = Array.from(new Set([...allowedRecipients, contactToGrant]));
      try {
        await fetch(`/api/connections/${hash}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ allowedRecipients: nextAllowed }),
        });
        setConnInfo((prev) => ({
          ...prev,
          connection: {
            ...prev?.connection,
            allowedRecipients: nextAllowed,
          },
        }));
      } catch (err) {
        console.warn("Failed to update allowed recipients", err);
      }
    }

    if (!pendingTakeoverAction) return;
    const action = pendingTakeoverAction;
    setPendingTakeoverAction(null);

    if (action.type === "quick_vote") {
      await executeQuickVote(action.option, action.question, action.options, contactToGrant);
    } else if (action.type === "vote") {
      await executeVote(action.pollId, action.option, contactToGrant);
    } else if (action.type === "custom_poll") {
      await executeSaveCustomPoll(action.params);
    }
  }

  // 9. Handle Real WhatsApp Outgoing Messages
  const [isSendingMessage, setIsSendingMessage] = useState(false);

  async function handleSendManual(text, imageUrls = []) {
    const cleanText = (text || "").trim();
    if (!cleanText && imageUrls.length === 0) return;
    if (!selectedContact || !hash) return;

    const tempId = `temp-${Date.now()}`;
    const optimisticMsg = {
      id: tempId,
      sender: "me",
      chatJid: selectedContact,
      content: cleanText,
      imageUrls: imageUrls.length > 0 ? imageUrls : undefined,
      timestamp: new Date().toISOString(),
      isFromMe: true,
      isAi: false,
    };

    // Optimistically display in timeline
    setMessages((prev) => [...prev, optimisticMsg]);
    setIsSendingMessage(true);

    // Manual texting cancels active takeover grant for this contact
    setActiveGrants((prev) => ({
      ...prev,
      [selectedContact]: { type: "none" },
    }));

    // Only send text to the API — images are local/blob display only
    if (!cleanText) {
      setIsSendingMessage(false);
      setTimeout(() => fetchDashboardData(), 1000);
      return;
    }

    try {
      const res = await fetch(`/api/connections/${hash}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipient: selectedContact,
          message: cleanText,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        console.error("Failed to send WhatsApp message:", errData.error || res.status);
      } else {
        const data = await res.json();
        if (data.messageId) {
          setMessages((prev) =>
            prev.map((m) => (m.id === tempId ? { ...m, id: data.messageId } : m))
          );
        }
      }
    } catch (err) {
      console.error("Network error sending WhatsApp message:", err);
    } finally {
      setIsSendingMessage(false);
      setTimeout(() => fetchDashboardData(), 1000);
    }
  }

  // 10. Settings Modal Handlers
  function openSettings() {
    setConfigForm({
      ownerPhone: connInfo?.connection?.ownerPhone || "",
      allowedRecipients: parseRecipientsToContacts(
        connInfo?.connection?.allowedRecipients || [],
        [],
        chats
      ),
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
            message: data.warning || `Valid ${data.provider} Key`,
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
      const serializedRecipients = serializeContactsToRecipients(configForm.allowedRecipients);
      const res = await fetch(`/api/connections/${hash || "default"}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ownerPhone: configForm.ownerPhone,
          allowedRecipients: serializedRecipients,
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

      setConfigSuccess("Configuration updated & synced!");
      setTimeout(() => {
        setIsSettingsOpen(false);
      }, 900);
    } catch (err) {
      setConfigError(err.message || "Failed to update configuration");
    } finally {
      setSavingConfig(false);
    }
  }

  // Filter messages for selected contact / chatJid (concatenating @lid and phone number)
  const cleanSelected = selectedContact.replace(/\D/g, "");
  const selectedContactItem = chats.find(
    (c) =>
      c.jid === selectedContact ||
      c.phone === selectedContact ||
      (c.aliases && (c.aliases.includes(selectedContact) || (cleanSelected && c.aliases.includes(cleanSelected))))
  );

  const selectedAliases = new Set(
    [
      selectedContact,
      cleanSelected,
      selectedContactItem?.jid,
      selectedContactItem?.phone,
      selectedContactItem?.lid,
      ...(selectedContactItem?.aliases || []),
    ]
      .filter(Boolean)
      .map((s) => String(s).toLowerCase())
  );

  const selectedName = selectedContactName || selectedContactItem?.name;
  const isRealName = selectedName && !selectedName.match(/^\+?\d+$/);

  const currentChatMessages = messages.filter((m) => {
    const chatJid = (m.chatJid || m.chat_jid || "").toLowerCase();
    const sender = (m.sender || "").toLowerCase();
    const recipient = (m.recipient || "").toLowerCase();
    const cleanChat = chatJid.replace(/\D/g, "");
    const cleanSender = sender.replace(/\D/g, "");
    const cleanRecipient = recipient.replace(/\D/g, "");

    // 1. Direct match with any alias
    if (
      selectedAliases.has(chatJid) ||
      selectedAliases.has(sender) ||
      selectedAliases.has(recipient) ||
      (cleanChat && selectedAliases.has(cleanChat)) ||
      (cleanSender && selectedAliases.has(cleanSender)) ||
      (cleanRecipient && selectedAliases.has(cleanRecipient))
    ) {
      return true;
    }

    // 2. Real name match across threads
    if (isRealName && (m.senderName === selectedName || m.chatName === selectedName)) {
      return true;
    }

    // 3. Substring match for valid phone numbers (>= 7 digits)
    if (cleanSelected && cleanSelected.length >= 7) {
      if (
        chatJid.includes(cleanSelected) ||
        sender.includes(cleanSelected) ||
        recipient.includes(cleanSelected)
      ) {
        return true;
      }
    }

    return false;
  });

  // Filter polls for selected contact
  const currentChatPolls = polls.filter((p) => {
    const contact = (p.contact || "").toLowerCase();
    const cleanContact = contact.replace(/\D/g, "");
    if (selectedAliases.has(contact) || (cleanContact && selectedAliases.has(cleanContact))) {
      return true;
    }
    if (isRealName && p.contactDisplay === selectedName) {
      return true;
    }
    if (cleanSelected && cleanSelected.length >= 7 && contact.includes(cleanSelected)) {
      return true;
    }
    return false;
  });

  const pendingPollsCount = polls.filter((p) => p.status === "pending").length;
  const currentPendingPolls = currentChatPolls.filter((p) => p.status === "pending").length;

  if (!sessionChecked) {
    return (
      <main
        className="wa-container"
        data-theme={theme}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "100vh",
          backgroundColor: "var(--wa-bg)",
        }}
      >
        <div style={{ textAlign: "center", color: "var(--wa-text-secondary)" }}>
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: "50%",
              backgroundColor: "var(--wa-teal)",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              marginBottom: 16,
              boxShadow: "0 4px 12px rgba(0, 168, 132, 0.3)",
            }}
          >
            <RobotIcon size={26} color="#ffffff" />
          </div>
          <p style={{ margin: 0, fontSize: 14, fontWeight: 500 }}>Connecting to Take-Over...</p>
        </div>
      </main>
    );
  }

  if (!isAuthenticated) {
    return (
      <LoginCard
        initialHash={hash}
        onLoginSuccess={handleLoginSuccess}
        theme={theme}
        onThemeChange={handleThemeChange}
      />
    );
  }

  return (
    <main className="wa-container" data-theme={theme}>
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
              selectedContactRef.current = c;
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
                isWhitelisted={isSelectedWhitelisted}
                onOpenSettings={() => setIsChatSettingsOpen(true)}
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
                onQuickVote={handleQuickVote}
                onOpenPollEditor={() => setIsPollModalOpen(true)}
                onRevokeGrant={handleRevokeAutonomy}
                activeGrant={activeGrants[selectedContact] || null}
                pollConfig={pollConfig}
                loading={isSendingMessage}
              />
            </>
          ) : (
            <div className="wa-empty-state">
              <div
                style={{
                  width: 72,
                  height: 72,
                  borderRadius: "50%",
                  background: "var(--wa-card-bg)",
                  border: "1px solid var(--wa-border)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
                }}
              >
                <RobotIcon size={36} color="var(--wa-teal)" />
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
                  color: "var(--wa-text-muted)",
                  fontSize: 12,
                }}
              >
                <LockIcon size={13} color="var(--wa-text-muted)" />
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
        theme={theme}
        onThemeChange={handleThemeChange}
        chats={chats}
        hash={hash}
      />

      {/* Create / Edit Take-Over Poll Modal */}
      <CreatePollModal
        isOpen={isPollModalOpen}
        onClose={() => setIsPollModalOpen(false)}
        onSubmit={handleSaveCustomPoll}
        contact={selectedContact}
        contactName={selectedContactName}
        initialConfig={pollConfig}
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

      {/* Unlisted Contact Take-Over Confirmation Warning Modal */}
      <UnlistedContactConfirmModal
        isOpen={isUnlistedModalOpen}
        onClose={() => {
          setIsUnlistedModalOpen(false);
          setPendingTakeoverAction(null);
        }}
        onConfirm={handleConfirmUnlistedTakeover}
        contact={selectedContact}
        contactName={selectedContactName}
        actionDescription={unlistedActionDesc}
      />

      {/* Chat Settings / AI Persona Modal */}
      {isChatSettingsOpen && selectedContact && (
        <div style={{ position: "fixed", inset: 0, zIndex: 100 }}>
          <ChatSettingsModal
            contact={selectedContact}
            contactName={selectedContactName}
            hash={hash}
            chats={chats}
            onClose={() => setIsChatSettingsOpen(false)}
          />
        </div>
      )}
    </main>
  );
}
