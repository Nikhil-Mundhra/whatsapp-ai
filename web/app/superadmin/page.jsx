"use client";

import React, { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import {
  LockIcon,
  RefreshIcon,
  SearchIcon,
  RobotIcon,
  CloseIcon,
  DoubleCheckIcon,
  SunIcon,
  MoonIcon,
  WarningIcon,
  CheckIcon,
  TicketIcon,
  CopyIcon,
} from "../components/Icons/WhatsAppIcons";

export default function SuperadminPage() {
  const [theme, setTheme] = useState("dark");
  const [authenticated, setAuthenticated] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);

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

  // Dashboard state
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

  // Initialize theme
  useEffect(() => {
    const savedTheme = localStorage.getItem("wa_theme") || "dark";
    setTheme(savedTheme);
    document.documentElement.setAttribute("data-theme", savedTheme);
  }, []);

  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    localStorage.setItem("wa_theme", next);
    document.documentElement.setAttribute("data-theme", next);
  };

  // Verify session on mount
  useEffect(() => {
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
    }, 12000);
    return () => clearInterval(interval);
  }, [authenticated]);

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
      }
    } catch (err) {
      setLoginError(err.message || "Failed to log in");
    } finally {
      setLoginLoading(false);
    }
  };

  const handleOtpSubmit = async (e) => {
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

  // Filter and sort users
  const filteredUsers = useMemo(() => {
    if (!data?.users) return [];
    let list = [...data.users];

    // Search query
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

    // Status filter
    if (statusFilter !== "all") {
      if (statusFilter === "connected") list = list.filter((u) => u.isConnected);
      else if (statusFilter === "disconnected") list = list.filter((u) => u.isLinked && !u.isConnected);
      else if (statusFilter === "pairing") list = list.filter((u) => u.status === "pairing");
      else if (statusFilter === "configuring") list = list.filter((u) => !u.isLinked && u.status === "configuring");
    }

    // Sorting
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

  const formatTimeAgo = (ts) => {
    if (!ts) return "Never";
    const sec = Math.floor((Date.now() - ts) / 1000);
    if (sec < 60) return "Just now";
    const min = Math.floor(sec / 60);
    if (min < 60) return `${min}m ago`;
    const hrs = Math.floor(min / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return `${days}d ago`;
  };

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

          <div style={{ marginTop: 24, textAlign: "center", borderTop: "1px solid var(--wa-border)", paddingTop: 16 }}>
            <Link href="/" style={{ color: "var(--wa-teal)", fontSize: "13px", textDecoration: "none" }}>
              Return to User Control Panel
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // 3. Authenticated Superadmin Dashboard
  const summary = data?.summary || {
    totalUsers: 0,
    connectedUsers: 0,
    totalStorageFormatted: "0 B",
    totalMessages: 0,
    totalAiMessages: 0,
    totalAutomatedChats: 0,
    bridgeStatus: "offline",
    uptimeSeconds: 0,
  };

  return (
    <div style={{ minHeight: "100vh", backgroundColor: "var(--wa-bg-app)", color: "var(--wa-text-primary)", display: "flex", flexDirection: "column" }}>
      {/* Header Bar */}
      <header
        style={{
          backgroundColor: "var(--wa-header-bg)",
          borderBottom: "1px solid var(--wa-border)",
          padding: "12px 24px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          position: "sticky",
          top: 0,
          zIndex: 50,
          boxShadow: "0 2px 4px rgba(0,0,0,0.06)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: "8px",
              backgroundColor: "var(--wa-teal)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#ffffff",
              fontWeight: "700",
              fontSize: "16px",
            }}
          >
            <LockIcon size={18} color="#ffffff" />
          </div>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <h1 style={{ fontSize: "16px", fontWeight: "700", margin: 0 }}>Superadmin Dashboard</h1>
              <span
                style={{
                  fontSize: "11px",
                  padding: "2px 8px",
                  borderRadius: 12,
                  backgroundColor: summary.bridgeStatus === "online" ? "rgba(37, 211, 102, 0.15)" : "rgba(234, 179, 8, 0.15)",
                  color: summary.bridgeStatus === "online" ? "#10b981" : "#eab308",
                  fontWeight: "600",
                }}
              >
                ● Bridge {summary.bridgeStatus}
              </span>
            </div>
            <p style={{ fontSize: "12px", color: "var(--wa-text-muted)", margin: 0 }}>
              Multi-Tenant Fleet Telemetry & Centralized Management
            </p>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button
            onClick={fetchUsers}
            disabled={loading}
            title="Refresh All Telemetry"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "7px 12px",
              backgroundColor: "var(--wa-btn-secondary-bg)",
              border: "1px solid var(--wa-border)",
              borderRadius: 6,
              color: "var(--wa-text-primary)",
              fontSize: "13px",
              cursor: loading ? "not-allowed" : "pointer",
            }}
          >
            <RefreshIcon size={14} color="var(--wa-icon-color)" />
            <span>{loading ? "Refreshing..." : "Refresh"}</span>
          </button>

          <button
            onClick={() => handleThemeChange(theme === "dark" ? "light" : "dark")}
            style={{
              padding: "7px 10px",
              backgroundColor: "var(--wa-btn-secondary-bg)",
              border: "1px solid var(--wa-border)",
              borderRadius: 6,
              color: "var(--wa-text-primary)",
              fontSize: "13px",
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            {theme === "dark" ? (
              <>
                <SunIcon size={13} color="currentColor" />
                <span>Light</span>
              </>
            ) : (
              <>
                <MoonIcon size={13} color="currentColor" />
                <span>Dark</span>
              </>
            )}
          </button>

          <Link
            href="/"
            style={{
              padding: "7px 12px",
              backgroundColor: "var(--wa-btn-secondary-bg)",
              border: "1px solid var(--wa-border)",
              borderRadius: 6,
              color: "var(--wa-teal)",
              fontSize: "13px",
              textDecoration: "none",
              fontWeight: "600",
            }}
          >
            User Panel ↗
          </Link>

          <button
            onClick={handleLogout}
            style={{
              padding: "7px 12px",
              backgroundColor: "rgba(220, 38, 38, 0.1)",
              border: "1px solid rgba(220, 38, 38, 0.2)",
              borderRadius: 6,
              color: "#ef4444",
              fontSize: "13px",
              fontWeight: "600",
              cursor: "pointer",
            }}
          >
            Logout
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main style={{ flex: 1, padding: "24px", maxWidth: 1600, width: "100%", margin: "0 auto" }}>
        {/* KPI Cards Grid */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
            gap: "16px",
            marginBottom: "24px",
          }}
        >
          {/* Card 1: Total Users */}
          <div
            style={{
              backgroundColor: "var(--wa-card-bg)",
              border: "1px solid var(--wa-card-border)",
              borderRadius: 10,
              padding: "16px 20px",
              boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
            }}
          >
            <div style={{ fontSize: "12px", color: "var(--wa-text-muted)", fontWeight: "600", marginBottom: 6, textTransform: "uppercase" }}>
              Total Registered Users
            </div>
            <div style={{ fontSize: "28px", fontWeight: "700", color: "var(--wa-text-primary)" }}>
              {summary.totalUsers}
            </div>
            <div style={{ fontSize: "12px", color: "var(--wa-text-secondary)", marginTop: 4 }}>
              Active instances in fleet
            </div>
          </div>

          {/* Card 2: Live Online */}
          <div
            style={{
              backgroundColor: "var(--wa-card-bg)",
              border: "1px solid var(--wa-card-border)",
              borderRadius: 10,
              padding: "16px 20px",
              boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
            }}
          >
            <div style={{ fontSize: "12px", color: "var(--wa-text-muted)", fontWeight: "600", marginBottom: 6, textTransform: "uppercase" }}>
              Live WhatsApp Sessions
            </div>
            <div style={{ fontSize: "28px", fontWeight: "700", color: "#10b981", display: "flex", alignItems: "center", gap: 8 }}>
              <span>{summary.connectedUsers}</span>
              <span style={{ fontSize: "14px", fontWeight: "500", color: "var(--wa-text-muted)" }}>
                / {summary.totalUsers} online
              </span>
            </div>
            <div style={{ fontSize: "12px", color: "var(--wa-text-secondary)", marginTop: 4 }}>
              whatsmeow socket connected
            </div>
          </div>

          {/* Card 3: Storage Footprint */}
          <div
            style={{
              backgroundColor: "var(--wa-card-bg)",
              border: "1px solid var(--wa-card-border)",
              borderRadius: 10,
              padding: "16px 20px",
              boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
            }}
          >
            <div style={{ fontSize: "12px", color: "var(--wa-text-muted)", fontWeight: "600", marginBottom: 6, textTransform: "uppercase" }}>
              Storage Used (Disk & Memory)
            </div>
            <div style={{ fontSize: "28px", fontWeight: "700", color: "var(--wa-text-primary)" }}>
              {summary.totalStorageFormatted}
            </div>
            <div style={{ fontSize: "12px", color: "var(--wa-text-secondary)", marginTop: 4 }}>
              SQLite DBs & JSON payloads
            </div>
          </div>

          {/* Card 4: Automated Chats */}
          <div
            style={{
              backgroundColor: "var(--wa-card-bg)",
              border: "1px solid var(--wa-card-border)",
              borderRadius: 10,
              padding: "16px 20px",
              boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
            }}
          >
            <div style={{ fontSize: "12px", color: "var(--wa-text-muted)", fontWeight: "600", marginBottom: 6, textTransform: "uppercase" }}>
              Automated Chats (Whitelisted)
            </div>
            <div style={{ fontSize: "28px", fontWeight: "700", color: "var(--wa-teal)" }}>
              {summary.totalAutomatedChats}
            </div>
            <div style={{ fontSize: "12px", color: "var(--wa-text-secondary)", marginTop: 4 }}>
              Configured recipient whitelist
            </div>
          </div>

          {/* Card 5: Messages Sent & AI Volume */}
          <div
            style={{
              backgroundColor: "var(--wa-card-bg)",
              border: "1px solid var(--wa-card-border)",
              borderRadius: 10,
              padding: "16px 20px",
              boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
            }}
          >
            <div style={{ fontSize: "12px", color: "var(--wa-text-muted)", fontWeight: "600", marginBottom: 6, textTransform: "uppercase" }}>
              Total Messages & AI Replies
            </div>
            <div style={{ fontSize: "28px", fontWeight: "700", color: "var(--wa-text-primary)", display: "flex", alignItems: "baseline", gap: 8 }}>
              <span>{summary.totalMessages}</span>
              <span style={{ fontSize: "14px", color: "var(--wa-teal)", fontWeight: "600" }}>
                ({summary.totalAiMessages} AI)
              </span>
            </div>
            <div style={{ fontSize: "12px", color: "var(--wa-text-secondary)", marginTop: 4 }}>
              Autonomous Takeover replies
            </div>
          </div>
        </div>

        {/* Valid Coupon Widget */}
        <div
          style={{
            backgroundColor: "var(--wa-card-bg)",
            border: "1px solid var(--wa-teal)",
            borderRadius: 10,
            padding: "16px 20px",
            marginBottom: "20px",
            boxShadow: "0 2px 8px rgba(0, 168, 132, 0.08)",
            display: "flex",
            flexWrap: "wrap",
            gap: "16px",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          {/* Left: Info & Coupon Display */}
          <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 10,
                backgroundColor: "rgba(0, 168, 132, 0.15)",
                color: "var(--wa-teal)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <TicketIcon size={22} color="var(--wa-teal)" />
            </div>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <span style={{ fontSize: "12px", fontWeight: "700", textTransform: "uppercase", color: "var(--wa-text-muted)" }}>
                  Valid Registration Coupon:
                </span>
                <span
                  style={{
                    fontSize: "18px",
                    fontWeight: "800",
                    fontFamily: "monospace",
                    letterSpacing: "1.5px",
                    padding: "4px 12px",
                    borderRadius: 6,
                    backgroundColor: "var(--wa-search-input)",
                    border: "1px solid var(--wa-border-strong)",
                    color: "var(--wa-teal)",
                  }}
                >
                  {activeCoupon || "LOADING..."}
                </span>
                <button
                  onClick={handleCopyCoupon}
                  title="Copy Coupon"
                  style={{
                    padding: "4px 10px",
                    borderRadius: 6,
                    backgroundColor: couponCopied ? "rgba(16, 185, 129, 0.15)" : "var(--wa-btn-secondary-bg)",
                    border: couponCopied ? "1px solid #10b981" : "1px solid var(--wa-border)",
                    color: couponCopied ? "#10b981" : "var(--wa-text-primary)",
                    fontSize: "12px",
                    fontWeight: "600",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                  }}
                >
                  {couponCopied ? (
                    <>
                      <CheckIcon size={12} color="#10b981" />
                      <span>Copied!</span>
                    </>
                  ) : (
                    <>
                      <CopyIcon size={12} color="currentColor" />
                      <span>Copy</span>
                    </>
                  )}
                </button>
              </div>
              <p style={{ fontSize: "12px", color: "var(--wa-text-secondary)", margin: "4px 0 0 0" }}>
                Users must enter this coupon at <strong>/setup</strong> to register a new WhatsApp account.
              </p>
            </div>
          </div>

          {/* Right: Actions & Custom Coupon Input */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            {showCustomCoupon ? (
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <input
                  type="text"
                  placeholder="CUSTOM-CODE"
                  value={customCouponInput}
                  onChange={(e) => setCustomCouponInput(e.target.value.toUpperCase())}
                  style={{
                    padding: "7px 10px",
                    backgroundColor: "var(--wa-search-input)",
                    border: "1px solid var(--wa-teal)",
                    borderRadius: 6,
                    color: "var(--wa-text-primary)",
                    fontSize: "13px",
                    fontWeight: "700",
                    fontFamily: "monospace",
                    outline: "none",
                    width: 140,
                  }}
                />
                <button
                  onClick={() => customCouponInput.trim() && handleRefreshCoupon(customCouponInput.trim())}
                  disabled={couponLoading || !customCouponInput.trim()}
                  style={{
                    padding: "7px 12px",
                    backgroundColor: "var(--wa-teal)",
                    color: "#ffffff",
                    border: "none",
                    borderRadius: 6,
                    fontSize: "12px",
                    fontWeight: "600",
                    cursor: "pointer",
                  }}
                >
                  Set
                </button>
                <button
                  onClick={() => {
                    setShowCustomCoupon(false);
                    setCustomCouponInput("");
                  }}
                  style={{
                    padding: "7px 10px",
                    backgroundColor: "transparent",
                    color: "var(--wa-text-muted)",
                    border: "1px solid var(--wa-border)",
                    borderRadius: 6,
                    fontSize: "12px",
                    cursor: "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                  }}
                >
                  <CloseIcon size={12} color="var(--wa-text-muted)" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => setShowCustomCoupon(true)}
                style={{
                  padding: "7px 12px",
                  backgroundColor: "var(--wa-btn-secondary-bg)",
                  border: "1px solid var(--wa-border)",
                  borderRadius: 6,
                  color: "var(--wa-text-primary)",
                  fontSize: "12px",
                  fontWeight: "600",
                  cursor: "pointer",
                }}
              >
                Custom Coupon
              </button>
            )}

            <button
              onClick={() => handleRefreshCoupon()}
              disabled={couponLoading}
              title="Generate a new valid registration coupon"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "7px 14px",
                backgroundColor: "var(--wa-teal)",
                color: "#ffffff",
                border: "none",
                borderRadius: 6,
                fontSize: "12px",
                fontWeight: "600",
                cursor: couponLoading ? "not-allowed" : "pointer",
                boxShadow: "0 1px 3px rgba(0,0,0,0.12)",
              }}
            >
              <span style={{ display: "inline-block", transform: couponLoading ? "rotate(360deg)" : "none", transition: "transform 0.5s" }}>
                🔄
              </span>
              <span>{couponLoading ? "Generating..." : "Generate New Coupon"}</span>
            </button>

            <a
              href={`https://wa.me/?text=${encodeURIComponent(
                `Here is your WhatsApp AI Setup Access Coupon: *${activeCoupon}*\n\nGet started here: https://whatsapp-ai-nikhil.vercel.app/setup`
              )}`}
              target="_blank"
              rel="noreferrer"
              title="Share Coupon via WhatsApp"
              style={{
                padding: "7px 12px",
                backgroundColor: "rgba(37, 211, 102, 0.15)",
                border: "1px solid rgba(37, 211, 102, 0.3)",
                borderRadius: 6,
                color: "#10b981",
                fontSize: "12px",
                fontWeight: "600",
                textDecoration: "none",
                display: "flex",
                alignItems: "center",
                gap: 4,
              }}
            >
              Share ↗
            </a>
          </div>
        </div>

        {/* Filter, Search & Controls Bar */}
        <div
          style={{
            backgroundColor: "var(--wa-card-bg)",
            border: "1px solid var(--wa-card-border)",
            borderRadius: 10,
            padding: "14px 18px",
            marginBottom: "20px",
            display: "flex",
            flexWrap: "wrap",
            gap: "14px",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          {/* Search box */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, flex: "1 1 280px", maxWidth: 420, backgroundColor: "var(--wa-search-input)", borderRadius: 8, padding: "8px 12px" }}>
            <SearchIcon size={16} color="var(--wa-text-muted)" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by User Code, Phone, AI Model..."
              style={{
                background: "none",
                border: "none",
                outline: "none",
                color: "var(--wa-text-primary)",
                fontSize: "13px",
                width: "100%",
              }}
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                style={{ background: "none", border: "none", color: "var(--wa-text-muted)", cursor: "pointer", padding: 0, display: "flex", alignItems: "center" }}
              >
                <CloseIcon size={13} color="var(--wa-text-muted)" />
              </button>
            )}
          </div>

          {/* Status Filter Tabs */}
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            {[
              { id: "all", label: "All Users" },
              { id: "connected", label: "Online" },
              { id: "disconnected", label: "Offline" },
              { id: "pairing", label: "Pairing" },
              { id: "configuring", label: "Configuring" },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setStatusFilter(tab.id)}
                style={{
                  padding: "6px 12px",
                  borderRadius: 6,
                  fontSize: "12px",
                  fontWeight: "600",
                  border: statusFilter === tab.id ? "1px solid var(--wa-teal)" : "1px solid var(--wa-border)",
                  backgroundColor: statusFilter === tab.id ? "rgba(0, 168, 132, 0.12)" : "transparent",
                  color: statusFilter === tab.id ? "var(--wa-teal)" : "var(--wa-text-secondary)",
                  cursor: "pointer",
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Sort By Dropdown */}
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: "12px", color: "var(--wa-text-muted)" }}>Sort:</span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              style={{
                padding: "6px 10px",
                borderRadius: 6,
                fontSize: "12px",
                backgroundColor: "var(--wa-search-input)",
                color: "var(--wa-text-primary)",
                border: "1px solid var(--wa-border)",
                outline: "none",
                cursor: "pointer",
              }}
            >
              <option value="lastActive">Latest Activity</option>
              <option value="storage">Storage Footprint</option>
              <option value="messages">Total Messages</option>
              <option value="chats">Chats Automated</option>
              <option value="createdAt">Registration Date</option>
            </select>
          </div>
        </div>

        {/* Users Table / Grid */}
        <div
          style={{
            backgroundColor: "var(--wa-card-bg)",
            border: "1px solid var(--wa-card-border)",
            borderRadius: 10,
            overflow: "hidden",
            boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
          }}
        >
          {filteredUsers.length === 0 ? (
            <div style={{ padding: "60px 20px", textAlign: "center" }}>
              <div style={{ fontSize: "36px", marginBottom: 12 }}>🔍</div>
              <h3 style={{ fontSize: "16px", fontWeight: "600", color: "var(--wa-text-primary)", marginBottom: 4 }}>
                No users found
              </h3>
              <p style={{ fontSize: "13px", color: "var(--wa-text-secondary)" }}>
                {searchQuery || statusFilter !== "all"
                  ? "Try adjusting your search query or status filter."
                  : "No connections have been provisioned yet. Set up a user via /setup."}
              </p>
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px", textAlign: "left" }}>
                <thead>
                  <tr
                    style={{
                      backgroundColor: "var(--wa-header-bg)",
                      borderBottom: "1px solid var(--wa-border)",
                      color: "var(--wa-text-secondary)",
                      fontSize: "11px",
                      textTransform: "uppercase",
                      letterSpacing: "0.5px",
                    }}
                  >
                    <th style={{ padding: "12px 18px", fontWeight: "600" }}>User / Hash</th>
                    <th style={{ padding: "12px 18px", fontWeight: "600" }}>Status</th>
                    <th style={{ padding: "12px 18px", fontWeight: "600" }}>Storage Used</th>
                    <th style={{ padding: "12px 18px", fontWeight: "600" }}>Chats Automated</th>
                    <th style={{ padding: "12px 18px", fontWeight: "600" }}>Messages (Sent / AI)</th>
                    <th style={{ padding: "12px 18px", fontWeight: "600" }}>AI Model</th>
                    <th style={{ padding: "12px 18px", fontWeight: "600" }}>Last Active</th>
                    <th style={{ padding: "12px 18px", fontWeight: "600", textAlign: "right" }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.map((u) => {
                    const isSelected = selectedUser?.hash === u.hash;
                    return (
                      <tr
                        key={u.hash}
                        style={{
                          borderBottom: "1px solid var(--wa-border)",
                          backgroundColor: isSelected ? "var(--wa-selected-bg)" : "transparent",
                          transition: "background-color 0.15s ease",
                        }}
                      >
                        {/* User / Hash */}
                        <td style={{ padding: "14px 18px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <div
                              style={{
                                width: 34,
                                height: 34,
                                borderRadius: "50%",
                                backgroundColor: "rgba(0, 168, 132, 0.15)",
                                color: "var(--wa-teal)",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                fontWeight: "700",
                                fontSize: "12px",
                                letterSpacing: "0.5px",
                              }}
                            >
                              {u.hash.slice(0, 2)}
                            </div>
                            <div>
                              <div style={{ fontWeight: "700", color: "var(--wa-text-primary)", display: "flex", alignItems: "center", gap: 6 }}>
                                <span>{u.hash}</span>
                                <button
                                  onClick={() => navigator.clipboard.writeText(u.hash)}
                                  title="Copy Code"
                                  style={{ background: "none", border: "none", color: "var(--wa-text-muted)", cursor: "pointer", padding: 0, display: "inline-flex", alignItems: "center" }}
                                >
                                  <CopyIcon size={12} color="currentColor" />
                                </button>
                              </div>
                              <div style={{ fontSize: "12px", color: "var(--wa-text-secondary)" }}>
                                {u.ownerPhone ? `+${u.ownerPhone.replace(/\D/g, "")}` : "Phone unassigned"}
                              </div>
                            </div>
                          </div>
                        </td>

                        {/* Status */}
                        <td style={{ padding: "14px 18px" }}>
                          <span
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 5,
                              padding: "4px 9px",
                              borderRadius: 12,
                              fontSize: "11px",
                              fontWeight: "600",
                              backgroundColor:
                                u.status === "connected"
                                  ? "rgba(16, 185, 129, 0.12)"
                                  : u.status === "pairing"
                                  ? "rgba(234, 179, 8, 0.12)"
                                  : u.status === "disconnected"
                                  ? "rgba(239, 68, 68, 0.12)"
                                  : "rgba(148, 163, 184, 0.12)",
                              color:
                                u.status === "connected"
                                  ? "#10b981"
                                  : u.status === "pairing"
                                  ? "#eab308"
                                  : u.status === "disconnected"
                                  ? "#ef4444"
                                  : "#94a3b8",
                            }}
                          >
                            <span>●</span>
                            <span style={{ textTransform: "capitalize" }}>{u.status}</span>
                          </span>
                        </td>

                        {/* Storage Used */}
                        <td style={{ padding: "14px 18px" }}>
                          <div style={{ fontWeight: "600", color: "var(--wa-text-primary)" }}>
                            {u.storageUsedFormatted}
                          </div>
                          <div style={{ fontSize: "11px", color: "var(--wa-text-muted)" }}>
                            {u.storageUsedBytes > 1024 * 1024
                              ? `${(u.storageUsedBytes / (1024 * 1024)).toFixed(2)} MB`
                              : `${Math.round(u.storageUsedBytes / 1024)} KB`}
                          </div>
                        </td>

                        {/* Chats Automated */}
                        <td style={{ padding: "14px 18px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <span
                              style={{
                                padding: "2px 8px",
                                borderRadius: 10,
                                backgroundColor: "rgba(0, 168, 132, 0.12)",
                                color: "var(--wa-teal)",
                                fontWeight: "700",
                                fontSize: "12px",
                              }}
                            >
                              {u.chatsAutomated}
                            </span>
                            <span style={{ fontSize: "12px", color: "var(--wa-text-secondary)" }}>
                              whitelisted
                            </span>
                          </div>
                        </td>

                        {/* Messages Sent / AI */}
                        <td style={{ padding: "14px 18px" }}>
                          <div style={{ fontWeight: "600", color: "var(--wa-text-primary)" }}>
                            {u.messagesSent} sent / {u.totalMessages} total
                          </div>
                          <div style={{ fontSize: "11px", color: "var(--wa-teal)", display: "flex", alignItems: "center", gap: 4 }}>
                            <RobotIcon size={12} color="var(--wa-teal)" />
                            <span>{u.aiMessagesSent} AI Takeovers</span>
                          </div>
                        </td>

                        {/* AI Model */}
                        <td style={{ padding: "14px 18px" }}>
                          <span
                            style={{
                              padding: "3px 8px",
                              borderRadius: 6,
                              backgroundColor: "var(--wa-search-input)",
                              border: "1px solid var(--wa-border)",
                              fontSize: "11px",
                              fontFamily: "monospace",
                              color: "var(--wa-text-secondary)",
                            }}
                          >
                            {u.aiModel?.split("/").pop() || u.aiModel || "default"}
                          </span>
                        </td>

                        {/* Last Active */}
                        <td style={{ padding: "14px 18px", color: "var(--wa-text-secondary)" }}>
                          <span title={new Date(u.lastActive).toLocaleString()}>
                            {formatTimeAgo(u.lastActive)}
                          </span>
                        </td>

                        {/* Actions */}
                        <td style={{ padding: "14px 18px", textAlign: "right" }}>
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 6 }}>
                            <button
                              onClick={() => setSelectedUser(u)}
                              title="Inspect Details"
                              style={{
                                padding: "5px 9px",
                                backgroundColor: "var(--wa-btn-secondary-bg)",
                                border: "1px solid var(--wa-border)",
                                borderRadius: 6,
                                color: "var(--wa-text-primary)",
                                fontSize: "12px",
                                cursor: "pointer",
                              }}
                            >
                              Inspect
                            </button>

                            {u.isConnected ? (
                              <button
                                onClick={() => handleUserAction(u.hash, "disconnect")}
                                disabled={actionLoading[`${u.hash}_disconnect`]}
                                title="Disconnect WhatsApp Session"
                                style={{
                                  padding: "5px 9px",
                                  backgroundColor: "rgba(234, 179, 8, 0.1)",
                                  border: "1px solid rgba(234, 179, 8, 0.2)",
                                  borderRadius: 6,
                                  color: "#eab308",
                                  fontSize: "12px",
                                  cursor: "pointer",
                                }}
                              >
                                Disconnect
                              </button>
                            ) : (
                              <button
                                onClick={() => handleUserAction(u.hash, "reconnect")}
                                disabled={actionLoading[`${u.hash}_reconnect`]}
                                title="Trigger Auto-Reconnect"
                                style={{
                                  padding: "5px 9px",
                                  backgroundColor: "rgba(16, 185, 129, 0.1)",
                                  border: "1px solid rgba(16, 185, 129, 0.2)",
                                  borderRadius: 6,
                                  color: "#10b981",
                                  fontSize: "12px",
                                  cursor: "pointer",
                                }}
                              >
                                Reconnect
                              </button>
                            )}

                            <a
                              href={`/?hash=${u.hash}`}
                              target="_blank"
                              rel="noreferrer"
                              title="Open User Panel"
                              style={{
                                padding: "5px 9px",
                                backgroundColor: "var(--wa-teal)",
                                color: "#ffffff",
                                borderRadius: 6,
                                fontSize: "12px",
                                textDecoration: "none",
                                fontWeight: "600",
                              }}
                            >
                              Open ↗
                            </a>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>

      {/* User Details Drawer / Modal */}
      {selectedUser && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0, 0, 0, 0.6)",
            backdropFilter: "blur(3px)",
            zIndex: 100,
            display: "flex",
            justifyContent: "flex-end",
          }}
          onClick={() => setSelectedUser(null)}
        >
          <div
            style={{
              width: "100%",
              maxWidth: 480,
              height: "100%",
              backgroundColor: "var(--wa-panel-bg)",
              borderLeft: "1px solid var(--wa-border)",
              display: "flex",
              flexDirection: "column",
              boxShadow: "-6px 0 24px rgba(0,0,0,0.2)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Drawer Header */}
            <div
              style={{
                padding: "16px 20px",
                backgroundColor: "var(--wa-header-bg)",
                borderBottom: "1px solid var(--wa-border)",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: "50%",
                    backgroundColor: "var(--wa-teal)",
                    color: "#ffffff",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontWeight: "700",
                    fontSize: "14px",
                  }}
                >
                  {selectedUser.hash.slice(0, 2)}
                </div>
                <div>
                  <h2 style={{ fontSize: "16px", fontWeight: "700", margin: 0 }}>
                    Tenant #{selectedUser.hash}
                  </h2>
                  <p style={{ fontSize: "12px", color: "var(--wa-text-secondary)", margin: 0 }}>
                    Detailed Metrics & Health State
                  </p>
                </div>
              </div>

              <button
                onClick={() => setSelectedUser(null)}
                style={{
                  background: "none",
                  border: "none",
                  color: "var(--wa-text-muted)",
                  cursor: "pointer",
                  padding: 4,
                }}
              >
                <CloseIcon size={18} color="var(--wa-icon-color)" />
              </button>
            </div>

            {/* Drawer Body */}
            <div style={{ flex: 1, overflowY: "auto", padding: "20px" }}>
              {/* Telemetry Overview Section */}
              <div style={{ marginBottom: 24 }}>
                <h3 style={{ fontSize: "12px", fontWeight: "700", textTransform: "uppercase", color: "var(--wa-text-muted)", marginBottom: 12 }}>
                  Storage & Activity
                </h3>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <div style={{ padding: "12px", borderRadius: 8, backgroundColor: "var(--wa-card-bg)", border: "1px solid var(--wa-border)" }}>
                    <div style={{ fontSize: "11px", color: "var(--wa-text-muted)" }}>Storage Used</div>
                    <div style={{ fontSize: "18px", fontWeight: "700", color: "var(--wa-text-primary)", marginTop: 2 }}>
                      {selectedUser.storageUsedFormatted}
                    </div>
                  </div>
                  <div style={{ padding: "12px", borderRadius: 8, backgroundColor: "var(--wa-card-bg)", border: "1px solid var(--wa-border)" }}>
                    <div style={{ fontSize: "11px", color: "var(--wa-text-muted)" }}>Total Messages</div>
                    <div style={{ fontSize: "18px", fontWeight: "700", color: "var(--wa-text-primary)", marginTop: 2 }}>
                      {selectedUser.totalMessages}
                    </div>
                  </div>
                  <div style={{ padding: "12px", borderRadius: 8, backgroundColor: "var(--wa-card-bg)", border: "1px solid var(--wa-border)" }}>
                    <div style={{ fontSize: "11px", color: "var(--wa-text-muted)" }}>AI Takeover Replies</div>
                    <div style={{ fontSize: "18px", fontWeight: "700", color: "var(--wa-teal)", marginTop: 2 }}>
                      {selectedUser.aiMessagesSent}
                    </div>
                  </div>
                  <div style={{ padding: "12px", borderRadius: 8, backgroundColor: "var(--wa-card-bg)", border: "1px solid var(--wa-border)" }}>
                    <div style={{ fontSize: "11px", color: "var(--wa-text-muted)" }}>Automated Contacts</div>
                    <div style={{ fontSize: "18px", fontWeight: "700", color: "var(--wa-teal)", marginTop: 2 }}>
                      {selectedUser.chatsAutomated}
                    </div>
                  </div>
                </div>
              </div>

              {/* Configuration Section */}
              <div style={{ marginBottom: 24 }}>
                <h3 style={{ fontSize: "12px", fontWeight: "700", textTransform: "uppercase", color: "var(--wa-text-muted)", marginBottom: 12 }}>
                  Configuration & Credentials
                </h3>
                <div style={{ backgroundColor: "var(--wa-card-bg)", border: "1px solid var(--wa-border)", borderRadius: 8, padding: 14 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", paddingBottom: 8, borderBottom: "1px solid var(--wa-border)" }}>
                    <span style={{ fontSize: "12px", color: "var(--wa-text-secondary)" }}>Owner Phone:</span>
                    <span style={{ fontSize: "12px", fontWeight: "600" }}>{selectedUser.ownerPhone || "Unassigned"}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid var(--wa-border)" }}>
                    <span style={{ fontSize: "12px", color: "var(--wa-text-secondary)" }}>AI Model:</span>
                    <span style={{ fontSize: "12px", fontWeight: "600", fontFamily: "monospace" }}>{selectedUser.aiModel}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid var(--wa-border)" }}>
                    <span style={{ fontSize: "12px", color: "var(--wa-text-secondary)" }}>AI API Key:</span>
                    <span style={{ fontSize: "12px", fontWeight: "600", color: selectedUser.aiApiKeySet ? "#10b981" : "#ef4444" }}>
                      {selectedUser.aiApiKeySet ? "Configured" : "Missing"}
                    </span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", paddingTop: 8 }}>
                    <span style={{ fontSize: "12px", color: "var(--wa-text-secondary)" }}>Created At:</span>
                    <span style={{ fontSize: "12px" }}>{new Date(selectedUser.createdAt).toLocaleDateString()}</span>
                  </div>
                </div>
              </div>

              {/* Whitelisted Contacts */}
              <div style={{ marginBottom: 24 }}>
                <h3 style={{ fontSize: "12px", fontWeight: "700", textTransform: "uppercase", color: "var(--wa-text-muted)", marginBottom: 12 }}>
                  Whitelisted Recipients ({selectedUser.allowedRecipients?.length || 0})
                </h3>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {selectedUser.allowedRecipients && selectedUser.allowedRecipients.length > 0 ? (
                    selectedUser.allowedRecipients.map((r, i) => {
                      const clean = String(r).replace(/\D/g, "");
                      const isNumber = clean.length >= 7;
                      return (
                        <span
                          key={i}
                          style={{
                            padding: "4px 8px",
                            borderRadius: 6,
                            backgroundColor: isNumber ? "var(--wa-search-input)" : "rgba(0, 168, 132, 0.12)",
                            border: isNumber ? "1px solid var(--wa-border)" : "1px solid rgba(0, 168, 132, 0.3)",
                            fontSize: "12px",
                            fontFamily: isNumber ? "monospace" : "inherit",
                            color: isNumber ? "var(--wa-text-primary)" : "var(--wa-teal)",
                            fontWeight: isNumber ? 500 : 600,
                          }}
                        >
                          {isNumber ? `+${clean}` : String(r)}
                        </span>
                      );
                    })
                  ) : (
                    <span style={{ fontSize: "12px", color: "var(--wa-text-muted)" }}>No contacts whitelisted yet.</span>
                  )}
                </div>
              </div>

              {/* Health & Reconnect State */}
              {selectedUser.lastError && (
                <div style={{ marginBottom: 24, padding: 12, borderRadius: 8, backgroundColor: "rgba(239, 68, 68, 0.1)", border: "1px solid rgba(239, 68, 68, 0.2)" }}>
                  <div style={{ fontSize: "11px", fontWeight: "700", color: "#ef4444", textTransform: "uppercase", marginBottom: 4 }}>
                    Last Connection Error
                  </div>
                  <div style={{ fontSize: "12px", color: "#ef4444", fontFamily: "monospace" }}>
                    {selectedUser.lastError}
                  </div>
                </div>
              )}
            </div>

            {/* Drawer Footer Actions */}
            <div
              style={{
                padding: "16px 20px",
                backgroundColor: "var(--wa-header-bg)",
                borderTop: "1px solid var(--wa-border)",
                display: "flex",
                gap: 10,
              }}
            >
              {selectedUser.isConnected ? (
                <button
                  onClick={() => handleUserAction(selectedUser.hash, "disconnect")}
                  disabled={actionLoading[`${selectedUser.hash}_disconnect`]}
                  style={{
                    flex: 1,
                    padding: "10px",
                    backgroundColor: "rgba(234, 179, 8, 0.15)",
                    border: "1px solid rgba(234, 179, 8, 0.3)",
                    borderRadius: 6,
                    color: "#eab308",
                    fontSize: "13px",
                    fontWeight: "600",
                    cursor: "pointer",
                  }}
                >
                  Disconnect Session
                </button>
              ) : (
                <button
                  onClick={() => handleUserAction(selectedUser.hash, "reconnect")}
                  disabled={actionLoading[`${selectedUser.hash}_reconnect`]}
                  style={{
                    flex: 1,
                    padding: "10px",
                    backgroundColor: "var(--wa-teal)",
                    border: "none",
                    borderRadius: 6,
                    color: "#ffffff",
                    fontSize: "13px",
                    fontWeight: "600",
                    cursor: "pointer",
                  }}
                >
                  Auto-Reconnect
                </button>
              )}

              <button
                onClick={() => handleDeleteUser(selectedUser.hash)}
                disabled={actionLoading[`${selectedUser.hash}_delete`]}
                style={{
                  padding: "10px 14px",
                  backgroundColor: "rgba(239, 68, 68, 0.15)",
                  border: "1px solid rgba(239, 68, 68, 0.3)",
                  borderRadius: 6,
                  color: "#ef4444",
                  fontSize: "13px",
                  fontWeight: "600",
                  cursor: "pointer",
                }}
              >
                Delete Tenant
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
