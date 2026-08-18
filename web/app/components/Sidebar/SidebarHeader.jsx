"use client";

import { SettingsIcon, RefreshIcon } from "../Icons/WhatsAppIcons";

export function SidebarHeader({
  hash,
  connInfo,
  onOpenSettings,
  onOpenSwitcher,
  onRefresh,
  refreshing,
}) {
  const isLinked = connInfo?.connection?.status === "linked";
  const ownerPhone = connInfo?.connection?.ownerPhone || "";
  const initial = ownerPhone ? ownerPhone.slice(-2) : "AI";

  return (
    <div className="wa-sidebar-header">
      {/* Owner Profile Avatar & Hash */}
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div className="wa-avatar" title={`Owner: ${ownerPhone || "Unknown"}`}>
          {initial}
        </div>
        <div>
          <button
            onClick={onOpenSwitcher}
            style={{
              background: "var(--wa-card-bg)",
              border: "1px solid var(--wa-border-strong)",
              borderRadius: 6,
              padding: "2px 8px",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 4,
              fontSize: 12,
              fontWeight: 700,
              color: "var(--wa-text-primary)",
              letterSpacing: 0.5,
            }}
            title="Click to switch connection code"
          >
            <span>{hash || "NO CODE"}</span>
            <span style={{ fontSize: 10, color: "var(--wa-text-secondary)" }}>▼</span>
          </button>
        </div>
      </div>

      {/* Tools & Status */}
      <div className="wa-header-tools">
        {/* Connection status pill */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 5,
            padding: "3px 8px",
            borderRadius: 12,
            background: isLinked ? "rgba(16, 185, 129, 0.15)" : "rgba(245, 158, 11, 0.15)",
            border: `1px solid ${isLinked ? "rgba(16, 185, 129, 0.35)" : "rgba(245, 158, 11, 0.35)"}`,
            fontSize: 11,
            fontWeight: 600,
            color: isLinked ? "#10b981" : "#f59e0b",
          }}
          title={isLinked ? "WhatsApp Bridge Connected" : "Waiting for WhatsApp pairing"}
        >
          <span
            style={{
              width: 7,
              height: 7,
              borderRadius: "50%",
              backgroundColor: isLinked ? "#10b981" : "#f59e0b",
            }}
          />
          <span>{isLinked ? "Linked" : "Pairing"}</span>
        </div>

        {/* Refresh Button */}
        <button
          className="wa-icon-btn"
          onClick={onRefresh}
          title="Refresh Data"
          style={{
            transform: refreshing ? "rotate(180deg)" : "none",
            transition: "transform 0.4s ease",
          }}
        >
          <RefreshIcon size={18} color="var(--wa-icon-color)" />
        </button>

        {/* Settings Drawer Button */}
        <button
          className="wa-icon-btn"
          onClick={onOpenSettings}
          title="Take-Over Settings"
        >
          <SettingsIcon size={19} color="var(--wa-icon-color)" />
        </button>
      </div>
    </div>
  );
}
