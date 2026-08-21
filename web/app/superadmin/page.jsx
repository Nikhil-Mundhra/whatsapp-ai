"use client";

import React, { useState, useEffect, useMemo } from "react";
import SuperadminLogin from "./components/SuperadminLogin";
import SuperadminHeader from "./components/SuperadminHeader";
import FleetTab from "./components/FleetTab";
import AiProvidersTab from "./components/AiProvidersTab";
import SecurityTab from "./components/SecurityTab";
import TenantDrawer from "./components/TenantDrawer";
import { bufferToBase64Url, base64UrlToBuffer } from "./components/utils";
import { CheckIcon } from "../components/Icons/WhatsAppIcons";

export default function SuperadminPage() {
  const [theme, setTheme] = useState("dark");
  const [authenticated, setAuthenticated] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);

  // Active Tab: "fleet" | "ai_providers" | "settings"
  const [activeTab, setActiveTab] = useState("fleet");

  // Login form state
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [otpStep, setOtpStep] = useState(false);
  const [otp, setOtp] = useState("");
  const [maskedPhone, setMaskedPhone] = useState("");
  const [devOtp, setDevOtp] = useState("");
  const [bridgeSent, setBridgeSent] = useState(true);
  const [bridgeError, setBridgeError] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState("");

  // Fleet Dashboard state
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortBy, setSortBy] = useState("lastActive");
  const [selectedUser, setSelectedUser] = useState(null);
  const [actionLoading, setActionLoading] = useState({});

  // Coupon state
  const [activeCoupon, setActiveCoupon] = useState("");
  const [couponLoading, setCouponLoading] = useState(false);
  const [couponCopied, setCouponCopied] = useState(false);
  const [customCouponInput, setCustomCouponInput] = useState("");
  const [showCustomCoupon, setShowCustomCoupon] = useState(false);

  // AI & Whisper Providers state
  const [aiData, setAiData] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiUpdating, setAiUpdating] = useState(false);
  const [saveSuccessMessage, setSaveSuccessMessage] = useState("");

  // Provider Inputs & Form State
  const [editingGroq, setEditingGroq] = useState(false);
  const [groqKeyInput, setGroqKeyInput] = useState("");
  const [showGroqKey, setShowGroqKey] = useState(false);

  const [editingOpenrouter, setEditingOpenrouter] = useState(false);
  const [openrouterKeyInput, setOpenrouterKeyInput] = useState("");
  const [showOpenrouterKey, setShowOpenrouterKey] = useState(false);

  const [editingModel, setEditingModel] = useState(false);
  const [modelInput, setModelInput] = useState("");
  const [whisperProviderInput, setWhisperProviderInput] = useState("groq");

  // Connectivity Test State
  const [testState, setTestState] = useState({
    groq: { loading: false, result: null },
    openrouter: { loading: false, result: null },
  });

  // Apple Passkey / WebAuthn State
  const [passkeySupported, setPasskeySupported] = useState(false);
  const [passkeyLoginLoading, setPasskeyLoginLoading] = useState(false);
  const [passkeys, setPasskeys] = useState([]);
  const [passkeysLoading, setPasskeysLoading] = useState(false);
  const [registerPasskeyLoading, setRegisterPasskeyLoading] = useState(false);
  const [registerPasskeySuccess, setRegisterPasskeySuccess] = useState("");
  const [registerPasskeyError, setRegisterPasskeyError] = useState("");

  // Initialize theme
  useEffect(() => {
    const savedTheme = localStorage.getItem("wa_theme") || "dark";
    setTheme(savedTheme);
    document.documentElement.setAttribute("data-theme", savedTheme);
  }, []);

  const handleThemeChange = (next) => {
    setTheme(next);
    localStorage.setItem("wa_theme", next);
    document.documentElement.setAttribute("data-theme", next);
  };

  // Verify session on mount & detect WebAuthn support
  useEffect(() => {
    if (typeof window !== "undefined" && Boolean(window.PublicKeyCredential)) {
      setPasskeySupported(true);
    }
    checkSession();
  }, []);

  const checkSession = async () => {
    setCheckingAuth(true);
    try {
      const res = await fetch("/api/superadmin/auth/verify", { cache: "no-store" });
      if (res.ok) {
        const json = await res.json();
        if (json.authenticated) {
          setAuthenticated(true);
          fetchUsers();
          fetchCoupon();
          fetchAiStats();
          fetchPasskeys();
          return;
        }
      }
      setAuthenticated(false);
    } catch {
      setAuthenticated(false);
    } finally {
      setCheckingAuth(false);
    }
  };

  // Live polling every 12 seconds when authenticated
  useEffect(() => {
    if (!authenticated) return;
    const interval = setInterval(() => {
      fetchUsersSilent();
      fetchCoupon();
      if (activeTab === "ai_providers") {
        fetchAiStatsSilent();
      }
    }, 12000);
    return () => clearInterval(interval);
  }, [authenticated, activeTab]);

  const fetchUsers = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/superadmin/users", { cache: "no-store" });
      if (!res.ok) {
        if (res.status === 401) {
          setAuthenticated(false);
          return;
        }
        throw new Error(`HTTP ${res.status}`);
      }
      const json = await res.json();
      setData(json);
      fetchCoupon();
    } catch (err) {
      setError(err.message || "Failed to load users overview");
    } finally {
      setLoading(false);
    }
  };

  const fetchUsersSilent = async () => {
    try {
      const res = await fetch("/api/superadmin/users", { cache: "no-store" });
      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } catch {}
  };

  const fetchCoupon = async () => {
    try {
      const res = await fetch("/api/superadmin/coupon", { cache: "no-store" });
      if (res.ok) {
        const json = await res.json();
        if (json.coupon) setActiveCoupon(json.coupon);
      }
    } catch {}
  };

  const fetchAiStats = async () => {
    setAiLoading(true);
    try {
      const res = await fetch("/api/superadmin/ai-providers", { cache: "no-store" });
      if (res.ok) {
        const json = await res.json();
        setAiData(json);
        if (json.config?.aiModel) setModelInput(json.config.aiModel);
        if (json.config?.whisperProvider) setWhisperProviderInput(json.config.whisperProvider);
      }
    } catch (err) {
      console.error("Failed to fetch AI telemetry", err);
    } finally {
      setAiLoading(false);
    }
  };

  const fetchAiStatsSilent = async () => {
    try {
      const res = await fetch("/api/superadmin/ai-providers", { cache: "no-store" });
      if (res.ok) {
        const json = await res.json();
        setAiData(json);
      }
    } catch {}
  };

  const handleSaveAiConfig = async (updates) => {
    setAiUpdating(true);
    try {
      const res = await fetch("/api/superadmin/ai-providers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      if (res.ok) {
        setEditingGroq(false);
        setEditingOpenrouter(false);
        setEditingModel(false);
        setGroqKeyInput("");
        setOpenrouterKeyInput("");
        setSaveSuccessMessage("AI configuration saved successfully");
        setTimeout(() => setSaveSuccessMessage(""), 3000);
        await fetchAiStats();
      } else {
        const errJson = await res.json().catch(() => ({}));
        alert(`Failed to save: ${errJson.error || res.statusText}`);
      }
    } catch (err) {
      alert(`Save error: ${err.message}`);
    } finally {
      setAiUpdating(false);
    }
  };

  const handleTestProvider = async (provider, customKey = null) => {
    setTestState((prev) => ({
      ...prev,
      [provider]: { loading: true, result: null },
    }));

    try {
      const res = await fetch("/api/superadmin/ai-providers/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider,
          apiKey: customKey || undefined,
        }),
      });

      const json = await res.json();
      setTestState((prev) => ({
        ...prev,
        [provider]: { loading: false, result: json },
      }));
    } catch (err) {
      setTestState((prev) => ({
        ...prev,
        [provider]: {
          loading: false,
          result: { success: false, error: err.message || "Request timed out" },
        },
      }));
    }
  };

  const handleRefreshCoupon = async (customVal = null) => {
    setCouponLoading(true);
    try {
      const res = await fetch("/api/superadmin/coupon", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(customVal ? { coupon: customVal } : {}),
      });
      if (res.ok) {
        const json = await res.json();
        if (json.coupon) {
          setActiveCoupon(json.coupon);
          setShowCustomCoupon(false);
          setCustomCouponInput("");
        }
      } else {
        alert("Failed to update coupon");
      }
    } catch (err) {
      alert(`Error updating coupon: ${err.message}`);
    } finally {
      setCouponLoading(false);
    }
  };

  const handleCopyCoupon = () => {
    if (!activeCoupon) return;
    navigator.clipboard.writeText(activeCoupon);
    setCouponCopied(true);
    setTimeout(() => setCouponCopied(false), 2000);
  };

  const fetchPasskeys = async () => {
    setPasskeysLoading(true);
    try {
      const res = await fetch("/api/superadmin/auth/passkey");
      if (res.ok) {
        const json = await res.json();
        setPasskeys(json.passkeys || []);
      }
    } catch (err) {
      console.warn("Failed to fetch passkeys:", err.message);
    } finally {
      setPasskeysLoading(false);
    }
  };

  const handlePasskeyLogin = async () => {
    if (typeof window === "undefined" || !window.PublicKeyCredential) {
      alert("Apple Passkeys / WebAuthn is not supported in this browser.");
      return;
    }

    setPasskeyLoginLoading(true);
    setLoginError("");

    try {
      const optRes = await fetch("/api/superadmin/auth/passkey/login");
      const options = await optRes.json();
      if (!optRes.ok) throw new Error(options.error || "Failed to initialize Passkey login");

      const reqOptions = {
        challenge: base64UrlToBuffer(options.challenge),
        rpId: options.rpId,
        timeout: options.timeout || 60000,
        userVerification: options.userVerification || "preferred",
      };

      if (options.allowCredentials && options.allowCredentials.length > 0) {
        reqOptions.allowCredentials = options.allowCredentials.map((c) => ({
          id: base64UrlToBuffer(c.id),
          type: "public-key",
          transports: c.transports || ["internal"],
        }));
      }

      const assertion = await navigator.credentials.get({
        publicKey: reqOptions,
      });

      if (!assertion) {
        throw new Error("Passkey authentication was cancelled.");
      }

      const payload = {
        id: assertion.id,
        rawId: bufferToBase64Url(assertion.rawId),
        response: {
          clientDataJSON: bufferToBase64Url(assertion.response.clientDataJSON),
          authenticatorData: bufferToBase64Url(assertion.response.authenticatorData),
          signature: bufferToBase64Url(assertion.response.signature),
          userHandle: assertion.response.userHandle
            ? bufferToBase64Url(assertion.response.userHandle)
            : null,
        },
      };

      const verifyRes = await fetch("/api/superadmin/auth/passkey/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const verifyJson = await verifyRes.json();
      if (!verifyRes.ok) {
        throw new Error(verifyJson.error || "Passkey verification failed");
      }

      setAuthenticated(true);
      fetchUsers();
      fetchCoupon();
      fetchAiStats();
      fetchPasskeys();
    } catch (err) {
      if (err.name !== "NotAllowedError") {
        setLoginError(err.message || "Passkey verification failed");
      }
    } finally {
      setPasskeyLoginLoading(false);
    }
  };

  const handleRegisterPasskey = async () => {
    if (typeof window === "undefined" || !window.PublicKeyCredential) {
      alert("Apple Passkeys / WebAuthn is not supported in this browser.");
      return;
    }

    setRegisterPasskeyLoading(true);
    setRegisterPasskeyError("");
    setRegisterPasskeySuccess("");

    try {
      const optRes = await fetch("/api/superadmin/auth/passkey/register");
      const options = await optRes.json();
      if (!optRes.ok) throw new Error(options.error || "Failed to initialize Passkey registration");

      const createOptions = {
        challenge: base64UrlToBuffer(options.challenge),
        rp: options.rp,
        user: {
          id: base64UrlToBuffer(options.user.id),
          name: options.user.name,
          displayName: options.user.displayName,
        },
        pubKeyCredParams: options.pubKeyCredParams,
        authenticatorSelection: options.authenticatorSelection,
        timeout: options.timeout || 60000,
        attestation: options.attestation || "none",
      };

      const credential = await navigator.credentials.create({
        publicKey: createOptions,
      });

      if (!credential) {
        throw new Error("Registration was cancelled.");
      }

      const directPublicKey =
        typeof credential.response.getPublicKey === "function"
          ? bufferToBase64Url(credential.response.getPublicKey())
          : null;

      const deviceName = navigator.userAgent.includes("Mac")
        ? "Apple Device (Touch ID)"
        : navigator.userAgent.includes("iPhone")
        ? "iPhone (Face ID)"
        : "Biometric Passkey Device";

      const payload = {
        id: credential.id,
        rawId: bufferToBase64Url(credential.rawId),
        name: deviceName,
        response: {
          clientDataJSON: bufferToBase64Url(credential.response.clientDataJSON),
          attestationObject: bufferToBase64Url(credential.response.attestationObject),
          publicKey: directPublicKey,
        },
        transports: credential.response.getTransports ? credential.response.getTransports() : ["internal"],
      };

      const regRes = await fetch("/api/superadmin/auth/passkey/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const regJson = await regRes.json();
      if (!regRes.ok) {
        throw new Error(regJson.error || "Failed to register passkey");
      }

      setRegisterPasskeySuccess(regJson.message || "Passkey registered successfully!");
      setTimeout(() => setRegisterPasskeySuccess(""), 4000);
      await fetchPasskeys();
    } catch (err) {
      if (err.name !== "NotAllowedError") {
        setRegisterPasskeyError(err.message || "Failed to register passkey");
      }
    } finally {
      setRegisterPasskeyLoading(false);
    }
  };

  const handleDeletePasskey = async (id) => {
    if (!confirm("Are you sure you want to remove this passkey device?")) return;
    try {
      const res = await fetch("/api/superadmin/auth/passkey", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (res.ok) {
        await fetchPasskeys();
      }
    } catch (err) {
      alert(`Failed to delete passkey: ${err.message}`);
    }
  };

  const handleDevBypassLogin = async () => {
    setLoginLoading(true);
    setLoginError("");
    try {
      const res = await fetch("/api/superadmin/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ devBypass: true }),
      });
      const json = await res.json();
      if (res.ok && json.success) {
        setAuthenticated(true);
        fetchUsers();
        fetchAiStats();
        fetchPasskeys();
      } else {
        throw new Error(json.error || "Failed to bypass authentication");
      }
    } catch (err) {
      setLoginError(err.message);
    } finally {
      setLoginLoading(false);
    }
  };

  const handleLoginSubmit = async (e) => {
    e.preventDefault();
    if (!password.trim()) return;

    setLoginLoading(true);
    setLoginError("");

    try {
      const res = await fetch("/api/superadmin/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: password.trim() }),
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || "Authentication failed");
      }

      if (json.require2fa) {
        setOtpStep(true);
        setMaskedPhone(json.maskedPhone || "");
        setBridgeSent(json.bridgeSent !== false);
        setBridgeError(json.bridgeError || "");
        if (json.devOtp) setDevOtp(json.devOtp);
      } else {
        setAuthenticated(true);
        fetchUsers();
        fetchAiStats();
      }
    } catch (err) {
      setLoginError(err.message || "Failed to log in");
    } finally {
      setLoginLoading(false);
    }
  };

  const handleVerifyOtpSubmit = async (e) => {
    e.preventDefault();
    if (!otp.trim()) return;

    setLoginLoading(true);
    setLoginError("");

    try {
      const res = await fetch("/api/superadmin/auth/otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ otp: otp.trim() }),
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || "OTP verification failed");
      }

      setAuthenticated(true);
      setOtpStep(false);
      setPassword("");
      setOtp("");
      fetchUsers();
      fetchAiStats();
    } catch (err) {
      setLoginError(err.message || "Invalid verification code");
    } finally {
      setLoginLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await fetch("/api/superadmin/auth/logout", { method: "POST" });
    } catch {}
    setAuthenticated(false);
    setData(null);
    setAiData(null);
    setSelectedUser(null);
  };

  const handleUserAction = async (hash, action) => {
    setActionLoading((prev) => ({ ...prev, [`${hash}_${action}`]: true }));
    try {
      const res = await fetch(`/api/superadmin/users/${hash}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (res.ok) {
        await fetchUsers();
      } else {
        const errJson = await res.json().catch(() => ({}));
        alert(`Action failed: ${errJson.error || res.statusText}`);
      }
    } catch (err) {
      alert(`Action error: ${err.message}`);
    } finally {
      setActionLoading((prev) => ({ ...prev, [`${hash}_${action}`]: false }));
    }
  };

  const handleDeleteUser = async (hash) => {
    if (!confirm(`Are you sure you want to completely delete connection ${hash}? This cannot be undone.`)) {
      return;
    }
    setActionLoading((prev) => ({ ...prev, [`${hash}_delete`]: true }));
    try {
      const res = await fetch(`/api/superadmin/users/${hash}`, { method: "DELETE" });
      if (res.ok) {
        if (selectedUser?.hash === hash) setSelectedUser(null);
        await fetchUsers();
      }
    } catch (err) {
      alert(`Delete error: ${err.message}`);
    } finally {
      setActionLoading((prev) => ({ ...prev, [`${hash}_delete`]: false }));
    }
  };

  // Filter and sort fleet users
  const filteredUsers = useMemo(() => {
    if (!data?.users) return [];
    let list = [...data.users];

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(
        (u) =>
          u.hash.toLowerCase().includes(q) ||
          (u.ownerPhone && u.ownerPhone.toLowerCase().includes(q)) ||
          (u.aiModel && u.aiModel.toLowerCase().includes(q)) ||
          (u.allowedRecipients && u.allowedRecipients.some((r) => r.toLowerCase().includes(q)))
      );
    }

    if (statusFilter !== "all") {
      if (statusFilter === "connected") list = list.filter((u) => u.isConnected);
      else if (statusFilter === "disconnected") list = list.filter((u) => u.isLinked && !u.isConnected);
      else if (statusFilter === "pairing") list = list.filter((u) => u.status === "pairing");
      else if (statusFilter === "configuring") list = list.filter((u) => !u.isLinked && u.status === "configuring");
    }

    list.sort((a, b) => {
      if (sortBy === "lastActive") return (b.lastActive || 0) - (a.lastActive || 0);
      if (sortBy === "storage") return (b.storageUsedBytes || 0) - (a.storageUsedBytes || 0);
      if (sortBy === "messages") return (b.totalMessages || 0) - (a.totalMessages || 0);
      if (sortBy === "chats") return (b.chatsAutomated || 0) - (a.chatsAutomated || 0);
      if (sortBy === "createdAt") return (b.createdAt || 0) - (a.createdAt || 0);
      return 0;
    });

    return list;
  }, [data, searchQuery, statusFilter, sortBy]);

  // 1. Initial Auth Check Spinner
  if (checkingAuth) {
    return (
      <div style={{ display: "flex", height: "100vh", alignItems: "center", justifyContent: "center", backgroundColor: "var(--wa-bg-app)" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ width: 44, height: 44, border: "3px solid var(--wa-teal)", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 1s linear infinite", margin: "0 auto 16px" }} />
          <p style={{ color: "var(--wa-text-secondary)", fontSize: "14px" }}>Verifying master authorization...</p>
        </div>
      </div>
    );
  }

  // 2. Unauthenticated Login Screen
  if (!authenticated) {
    return (
      <SuperadminLogin
        otpStep={otpStep}
        maskedPhone={maskedPhone}
        loginError={loginError}
        handlePasskeyLogin={handlePasskeyLogin}
        passkeyLoginLoading={passkeyLoginLoading}
        handleDevBypassLogin={handleDevBypassLogin}
        loginLoading={loginLoading}
        handleLoginSubmit={handleLoginSubmit}
        password={password}
        setPassword={setPassword}
        showPassword={showPassword}
        setShowPassword={setShowPassword}
        handleVerifyOtpSubmit={handleVerifyOtpSubmit}
        otp={otp}
        setOtp={setOtp}
        bridgeSent={bridgeSent}
        bridgeError={bridgeError}
        devOtp={devOtp}
        setOtpStep={setOtpStep}
        setLoginError={setLoginError}
      />
    );
  }

  // 3. Authenticated Superadmin Dashboard
  const summary = data?.summary || {
    totalUsers: 0,
    connectedUsers: 0,
    bridgeStatus: "offline",
    totalStorageBytes: 0,
    totalStorageFormatted: "0 B",
    totalMessages: 0,
    totalAiMessages: 0,
    totalAutomatedChats: 0,
  };

  const aiUsage = aiData?.usage || {
    totalVoiceNotesTranscribed: 0,
    totalAudioDurationFormatted: "0s",
    totalAiMessages: 0,
    estimatedTotalTokens: 0,
    groqSecondsUsedToday: 0,
    groqPercentUsed: 0,
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        backgroundColor: "var(--wa-bg-app)",
        color: "var(--wa-text-primary)",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <SuperadminHeader
        summary={summary}
        fetchUsers={fetchUsers}
        fetchAiStats={fetchAiStats}
        fetchPasskeys={fetchPasskeys}
        fetchCoupon={fetchCoupon}
        loading={loading}
        aiLoading={aiLoading}
        handleThemeChange={handleThemeChange}
        theme={theme}
        handleLogout={handleLogout}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        aiData={aiData}
        passkeys={passkeys}
      />

      {/* Main Content Area */}
      <main style={{ flex: 1, padding: "24px", maxWidth: 1600, width: "100%", margin: "0 auto" }}>
        {saveSuccessMessage && (
          <div
            style={{
              backgroundColor: "rgba(16, 185, 129, 0.15)",
              border: "1px solid rgba(16, 185, 129, 0.3)",
              color: "#10b981",
              padding: "10px 16px",
              borderRadius: 8,
              fontSize: "13px",
              fontWeight: "600",
              marginBottom: 20,
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <CheckIcon size={16} color="#10b981" />
            <span>{saveSuccessMessage}</span>
          </div>
        )}

        {activeTab === "fleet" ? (
          <FleetTab
            summary={summary}
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            statusFilter={statusFilter}
            setStatusFilter={setStatusFilter}
            sortBy={sortBy}
            setSortBy={setSortBy}
            filteredUsers={filteredUsers}
            selectedUser={selectedUser}
            setSelectedUser={setSelectedUser}
            handleUserAction={handleUserAction}
            actionLoading={actionLoading}
          />
        ) : activeTab === "ai_providers" ? (
          <AiProvidersTab
            aiUsage={aiUsage}
            aiData={aiData}
            editingGroq={editingGroq}
            setEditingGroq={setEditingGroq}
            groqKeyInput={groqKeyInput}
            setGroqKeyInput={setGroqKeyInput}
            showGroqKey={showGroqKey}
            setShowGroqKey={setShowGroqKey}
            editingOpenrouter={editingOpenrouter}
            setEditingOpenrouter={setEditingOpenrouter}
            openrouterKeyInput={openrouterKeyInput}
            setOpenrouterKeyInput={setOpenrouterKeyInput}
            showOpenrouterKey={showOpenrouterKey}
            setShowOpenrouterKey={setShowOpenrouterKey}
            modelInput={modelInput}
            setModelInput={setModelInput}
            whisperProviderInput={whisperProviderInput}
            setWhisperProviderInput={setWhisperProviderInput}
            aiUpdating={aiUpdating}
            handleSaveAiConfig={handleSaveAiConfig}
            handleTestProvider={handleTestProvider}
            testState={testState}
          />
        ) : (
          <SecurityTab
            passkeys={passkeys}
            handleRegisterPasskey={handleRegisterPasskey}
            registerPasskeyLoading={registerPasskeyLoading}
            registerPasskeySuccess={registerPasskeySuccess}
            registerPasskeyError={registerPasskeyError}
            handleDeletePasskey={handleDeletePasskey}
            activeCoupon={activeCoupon}
            handleCopyCoupon={handleCopyCoupon}
            couponCopied={couponCopied}
            showCustomCoupon={showCustomCoupon}
            setShowCustomCoupon={setShowCustomCoupon}
            customCouponInput={customCouponInput}
            setCustomCouponInput={setCustomCouponInput}
            handleRefreshCoupon={handleRefreshCoupon}
            couponLoading={couponLoading}
          />
        )}
      </main>

      <TenantDrawer
        selectedUser={selectedUser}
        setSelectedUser={setSelectedUser}
        handleUserAction={handleUserAction}
        handleDeleteUser={handleDeleteUser}
        actionLoading={actionLoading}
      />
    </div>
  );
}
