"use client";

import React, { useState } from "react";
import {
  MoreVertIcon,
  NewChatIcon,
  RefreshIcon,
  SettingsIcon,
  ServerIcon,
} from "../Icons/WhatsAppIcons";

export function SidebarHeader({
  hash,
  connInfo,
  onOpenSettings,
  onOpenSwitcher,
  onRefresh,
  refreshing,
  onNewChat,
}) {
  const isLinked = connInfo?.connection?.status === "linked";
  const ownerPhone = connInfo?.connection?.ownerPhone || "";
  const [showMenu, setShowMenu] = useState(false);

  return (
    <div
      className="wa-sidebar-header"
      style={{
        height: 60,
        backgroundColor: "var(--wa-panel-bg)",
        padding: "10px 16px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        borderBottom: "1px solid var(--wa-border-light)",
        flexShrink: 0,
        position: "relative",
      }}
    >
      {/* Title & More Actions */}
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0, color: "var(--wa-text-primary)", letterSpacing: "-0.3px" }}>
          Chats
        </h1>
        <button
          onClick={() => setShowMenu((prev) => !prev)}
          title="Menu"
          style={{
            background: "none",
            border: "none",
            color: "var(--wa-icon-color)",
            cursor: "pointer",
            padding: 4,
            borderRadius: "50%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <MoreVertIcon size={18} color="var(--wa-icon-color)" />
        </button>
      </div>

      {/* Action Tools */}
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        {/* Status Pill */}
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
          title={isLinked ? `Connected: ${ownerPhone || hash}` : "Waiting for pairing"}
        >
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              backgroundColor: isLinked ? "#10b981" : "#f59e0b",
            }}
          />
          <span>{isLinked ? "Linked" : "Pairing"}</span>
        </div>

        {/* Refresh button */}
        <button
          className="wa-icon-btn"
          onClick={onRefresh}
          title="Refresh Chats & Messages"
          style={{
            transform: refreshing ? "rotate(180deg)" : "none",
            transition: "transform 0.4s ease",
            width: 32,
            height: 32,
          }}
        >
          <RefreshIcon size={16} color="var(--wa-icon-color)" />
        </button>

        {/* New Chat icon */}
        <button
          className="wa-icon-btn"
          onClick={onOpenSettings}
          title="Manage Whitelist & New Chats"
          style={{ width: 32, height: 32 }}
        >
          <NewChatIcon size={17} color="var(--wa-icon-color)" />
        </button>
      </div>

      {/* Dropdown Menu Modal / Popover */}
      {showMenu && (
        <>
          <div
            style={{ position: "fixed", inset: 0, zIndex: 50 }}
            onClick={() => setShowMenu(false)}
          />
          <div
            style={{
              position: "absolute",
              top: 52,
              left: 16,
              backgroundColor: "var(--wa-popover-bg)",
              border: "1px solid var(--wa-popover-border)",
              borderRadius: 8,
              boxShadow: "0 4px 16px rgba(0,0,0,0.2)",
              padding: "6px 0",
              zIndex: 51,
              minWidth: 180,
            }}
          >
            <button
              onClick={() => {
                setShowMenu(false);
                onOpenSwitcher();
              }}
              style={{
                width: "100%",
                padding: "8px 16px",
                background: "none",
                border: "none",
                textAlign: "left",
                fontSize: 13,
                color: "var(--wa-text-primary)",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <span>Switch Session (#{hash})</span>
            </button>
            <button
              onClick={() => {
                setShowMenu(false);
                onOpenSettings();
              }}
              style={{
                width: "100%",
                padding: "8px 16px",
                background: "none",
                border: "none",
                textAlign: "left",
                fontSize: 13,
                color: "var(--wa-text-primary)",
                cursor: "pointer",
              }}
            >
              Take-Over Settings
            </button>
            <button
              onClick={() => {
                setShowMenu(false);
                onRefresh();
              }}
              style={{
                width: "100%",
                padding: "8px 16px",
                background: "none",
                border: "none",
                textAlign: "left",
                fontSize: 13,
                color: "var(--wa-text-primary)",
                cursor: "pointer",
              }}
            >
              Sync Messages Now
            </button>
          </div>
        </>
      )}
    </div>
  );
}
