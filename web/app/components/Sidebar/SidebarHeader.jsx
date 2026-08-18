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
              background: "#ffffff",
              border: "1px solid #cbd5e1",
              borderRadius: 6,
              padding: "2px 8px",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 4,
              fontSize: 12,
              fontWeight: 700,
              color: "#0f172a",
              letterSpacing: 0.5,
            }}
            title="Click to switch connection code"
          >
            <span>{hash || "NO CODE"}</span>
            <span style={{ fontSize: 10, color: "#64748b" }}>▼</span>
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
            background: isLinked ? "#ecfdf5" : "#fffbeb",
            border: `1px solid ${isLinked ? "#a7f3d0" : "#fde68a"}`,
            fontSize: 11,
            fontWeight: 600,
            color: isLinked ? "#065f46" : "#b45309",
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
          <RefreshIcon size={18} />
        </button>

        {/* Settings Drawer Button */}
        <button
          className="wa-icon-btn"
          onClick={onOpenSettings}
          title="Take-Over Settings"
        >
          <SettingsIcon size={19} />
        </button>
      </div>
    </div>
  );
}
