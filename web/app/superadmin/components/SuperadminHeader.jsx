"use client";

import React from "react";
import Link from "next/link";
import {
  LockIcon,
  RefreshIcon,
  SunIcon,
  MoonIcon,
  UsersIcon,
  RobotIcon,
  PasskeyIcon,
} from "../../components/Icons/WhatsAppIcons";

export default function SuperadminHeader({
  summary,
  fetchUsers,
  fetchAiStats,
  fetchPasskeys,
  fetchCoupon,
  loading,
  aiLoading,
  handleThemeChange,
  theme,
  handleLogout,
  activeTab,
  setActiveTab,
  aiData,
  passkeys,
}) {
  return (
    <>
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
              Multi-Tenant Fleet Telemetry &amp; AI Provider Infrastructure
            </p>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button
            onClick={() => {
              fetchUsers();
              fetchAiStats();
            }}
            disabled={loading || aiLoading}
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
              cursor: loading || aiLoading ? "not-allowed" : "pointer",
            }}
          >
            <RefreshIcon size={14} color="var(--wa-icon-color)" />
            <span>{loading || aiLoading ? "Refreshing..." : "Refresh"}</span>
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

      {/* Navigation Tabs Bar */}
      <div
        style={{
          backgroundColor: "var(--wa-header-bg)",
          borderBottom: "1px solid var(--wa-border)",
          padding: "0 24px",
          display: "flex",
          gap: 12,
        }}
      >
        <button
          onClick={() => setActiveTab("fleet")}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "12px 16px",
            border: "none",
            borderBottom: activeTab === "fleet" ? "3px solid var(--wa-teal)" : "3px solid transparent",
            backgroundColor: "transparent",
            color: activeTab === "fleet" ? "var(--wa-teal)" : "var(--wa-text-secondary)",
            fontWeight: activeTab === "fleet" ? "700" : "500",
            fontSize: "14px",
            cursor: "pointer",
            transition: "all 0.15s ease",
          }}
        >
          <UsersIcon size={16} color="currentColor" />
          <span>Tenants &amp; Fleet</span>
          <span
            style={{
              fontSize: "11px",
              padding: "1px 6px",
              borderRadius: 10,
              backgroundColor: activeTab === "fleet" ? "rgba(0, 168, 132, 0.15)" : "var(--wa-search-input)",
              color: activeTab === "fleet" ? "var(--wa-teal)" : "var(--wa-text-muted)",
              fontWeight: "600",
            }}
          >
            {summary.totalUsers}
          </span>
        </button>

        <button
          onClick={() => {
            setActiveTab("ai_providers");
            fetchAiStats();
          }}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "12px 16px",
            border: "none",
            borderBottom: activeTab === "ai_providers" ? "3px solid var(--wa-teal)" : "3px solid transparent",
            backgroundColor: "transparent",
            color: activeTab === "ai_providers" ? "var(--wa-teal)" : "var(--wa-text-secondary)",
            fontWeight: activeTab === "ai_providers" ? "700" : "500",
            fontSize: "14px",
            cursor: "pointer",
            transition: "all 0.15s ease",
          }}
        >
          <RobotIcon size={16} color="currentColor" />
          <span>AI &amp; Whisper Providers</span>
          <span
            style={{
              fontSize: "11px",
              padding: "1px 6px",
              borderRadius: 10,
              backgroundColor: aiData?.config?.groqApiKeySet ? "rgba(16, 185, 129, 0.15)" : "rgba(234, 179, 8, 0.15)",
              color: aiData?.config?.groqApiKeySet ? "#10b981" : "#eab308",
              fontWeight: "600",
            }}
          >
            {aiData?.config?.groqApiKeySet ? "Groq Configured" : "Groq Key Missing"}
          </span>
        </button>

        <button
          onClick={() => {
            setActiveTab("settings");
            fetchPasskeys();
            fetchCoupon();
          }}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "12px 16px",
            border: "none",
            borderBottom: activeTab === "settings" ? "3px solid var(--wa-teal)" : "3px solid transparent",
            backgroundColor: "transparent",
            color: activeTab === "settings" ? "var(--wa-teal)" : "var(--wa-text-secondary)",
            fontWeight: activeTab === "settings" ? "700" : "500",
            fontSize: "14px",
            cursor: "pointer",
            transition: "all 0.15s ease",
          }}
        >
          <PasskeyIcon size={16} color="currentColor" />
          <span>Security &amp; Passkeys</span>
          <span
            style={{
              fontSize: "11px",
              padding: "1px 6px",
              borderRadius: 10,
              backgroundColor: passkeys.length > 0 ? "rgba(16, 185, 129, 0.15)" : "var(--wa-search-input)",
              color: passkeys.length > 0 ? "#10b981" : "var(--wa-text-muted)",
              fontWeight: "600",
            }}
          >
            {passkeys.length > 0 ? `${passkeys.length} Enrolled` : "Setup Biometrics"}
          </span>
        </button>
      </div>
    </>
  );
}
