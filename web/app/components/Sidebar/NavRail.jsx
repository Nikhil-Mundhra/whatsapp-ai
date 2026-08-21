"use client";

import React from "react";
import Link from "next/link";
import {
  ChatBubbleIcon,
  PhoneCallIcon,
  StatusRingIcon,
  ArchiveBoxIcon,
  StarIcon,
  MetaAiIcon,
  SettingsIcon,
  ServerIcon,
} from "../Icons/WhatsAppIcons";

export function NavRail({
  activeNav = "chats",
  onSelectNav,
  unreadCount = 0,
  archivedCount = 0,
  starredCount = 0,
  hasStatusUpdate = true,
  hasMissedCall = false,
  onOpenSettings,
  ownerPhone = "",
  hash = "",
  theme = "dark",
  onThemeChange,
}) {
  const initial = ownerPhone ? ownerPhone.slice(-2) : (hash ? hash.slice(0, 2) : "WA");

  return (
    <div
      className="wa-nav-rail"
      style={{
        width: 60,
        height: "100%",
        backgroundColor: "var(--wa-header-bg)",
        borderRight: "1px solid var(--wa-border)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "12px 0 16px 0",
        flexShrink: 0,
        zIndex: 5,
        userSelect: "none",
      }}
    >
      {/* Top Navigation Group */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, width: "100%" }}>
        {/* 1. Chats */}
        <button
          className={`wa-nav-item ${activeNav === "chats" ? "active" : ""}`}
          onClick={() => onSelectNav("chats")}
          title="Chats"
          style={{
            width: 44,
            height: 44,
            borderRadius: 12,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: activeNav === "chats" ? "rgba(0, 168, 132, 0.15)" : "transparent",
            color: activeNav === "chats" ? "var(--wa-teal)" : "var(--wa-icon-color)",
            border: "none",
            cursor: "pointer",
            position: "relative",
            transition: "all 0.15s ease",
          }}
        >
          <ChatBubbleIcon size={22} color="currentColor" />
          {unreadCount > 0 && (
            <span
              style={{
                position: "absolute",
                top: 4,
                right: 4,
                backgroundColor: "#25d366",
                color: "#ffffff",
                fontSize: 10,
                fontWeight: 700,
                height: 16,
                minWidth: 16,
                padding: "0 4px",
                borderRadius: 8,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
              }}
            >
              {unreadCount}
            </span>
          )}
        </button>

        {/* 2. Calls & Voice Notes */}
        <button
          className={`wa-nav-item ${activeNav === "calls" ? "active" : ""}`}
          onClick={() => onSelectNav("calls")}
          title="Calls & Voice Notes"
          style={{
            width: 44,
            height: 44,
            borderRadius: 12,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: activeNav === "calls" ? "rgba(0, 168, 132, 0.15)" : "transparent",
            color: activeNav === "calls" ? "var(--wa-teal)" : "var(--wa-icon-color)",
            border: "none",
            cursor: "pointer",
            position: "relative",
            transition: "all 0.15s ease",
          }}
        >
          <PhoneCallIcon size={22} color="currentColor" hasMissed={hasMissedCall} />
        </button>

        {/* 3. Status Stories */}
        <button
          className={`wa-nav-item ${activeNav === "status" ? "active" : ""}`}
          onClick={() => onSelectNav("status")}
          title="Status & Stories"
          style={{
            width: 44,
            height: 44,
            borderRadius: 12,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: activeNav === "status" ? "rgba(0, 168, 132, 0.15)" : "transparent",
            color: activeNav === "status" ? "var(--wa-teal)" : "var(--wa-icon-color)",
            border: "none",
            cursor: "pointer",
            position: "relative",
            transition: "all 0.15s ease",
          }}
        >
          <StatusRingIcon size={22} color="currentColor" hasUpdate={hasStatusUpdate} />
        </button>

        {/* 4. Archived Chats */}
        <button
          className={`wa-nav-item ${activeNav === "archived" ? "active" : ""}`}
          onClick={() => onSelectNav("archived")}
          title="Archived Chats"
          style={{
            width: 44,
            height: 44,
            borderRadius: 12,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: activeNav === "archived" ? "rgba(0, 168, 132, 0.15)" : "transparent",
            color: activeNav === "archived" ? "var(--wa-teal)" : "var(--wa-icon-color)",
            border: "none",
            cursor: "pointer",
            position: "relative",
            transition: "all 0.15s ease",
          }}
        >
          <ArchiveBoxIcon size={22} color="currentColor" />
          {archivedCount > 0 && (
            <span
              style={{
                position: "absolute",
                top: 4,
                right: 4,
                backgroundColor: "var(--wa-text-muted)",
                color: "#ffffff",
                fontSize: 10,
                fontWeight: 700,
                height: 16,
                minWidth: 16,
                padding: "0 4px",
                borderRadius: 8,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
              }}
            >
              {archivedCount}
            </span>
          )}
        </button>

        {/* 5. Starred Messages */}
        <button
          className={`wa-nav-item ${activeNav === "starred" ? "active" : ""}`}
          onClick={() => onSelectNav("starred")}
          title="Starred Messages & History"
          style={{
            width: 44,
            height: 44,
            borderRadius: 12,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: activeNav === "starred" ? "rgba(0, 168, 132, 0.15)" : "transparent",
            color: activeNav === "starred" ? "var(--wa-teal)" : "var(--wa-icon-color)",
            border: "none",
            cursor: "pointer",
            position: "relative",
            transition: "all 0.15s ease",
          }}
        >
          <StarIcon size={22} color="currentColor" />
          {starredCount > 0 && (
            <span
              style={{
                position: "absolute",
                top: 4,
                right: 4,
                backgroundColor: "var(--wa-teal)",
                color: "#ffffff",
                fontSize: 10,
                fontWeight: 700,
                height: 16,
                minWidth: 16,
                padding: "0 4px",
                borderRadius: 8,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {starredCount}
            </span>
          )}
        </button>

        {/* 6. AI Agent Take-Over (Meta AI ring) */}
        <button
          className={`wa-nav-item ${activeNav === "ai" ? "active" : ""}`}
          onClick={() => onSelectNav("ai")}
          title="Autonomous AI Agent & Take-Over Controls"
          style={{
            width: 44,
            height: 44,
            borderRadius: 12,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: activeNav === "ai" ? "rgba(0, 168, 132, 0.15)" : "transparent",
            border: "none",
            cursor: "pointer",
            position: "relative",
            transition: "all 0.15s ease",
          }}
        >
          <MetaAiIcon size={24} />
        </button>
      </div>

      {/* Bottom Navigation Group */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, width: "100%" }}>
        {/* Superadmin Link */}
        <Link
          href="/superadmin"
          title="Superadmin Fleet & AI Manager"
          style={{
            width: 42,
            height: 42,
            borderRadius: 12,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "var(--wa-icon-color)",
            textDecoration: "none",
            transition: "all 0.15s ease",
          }}
        >
          <ServerIcon size={20} color="currentColor" />
        </Link>

        {/* Settings Button */}
        <button
          onClick={onOpenSettings}
          title="Settings & Credentials"
          style={{
            width: 42,
            height: 42,
            borderRadius: 12,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "transparent",
            color: "var(--wa-icon-color)",
            border: "none",
            cursor: "pointer",
            transition: "all 0.15s ease",
          }}
        >
          <SettingsIcon size={21} color="currentColor" />
        </button>

        {/* User Profile Avatar with Online Status */}
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: "50%",
            background: "linear-gradient(135deg, #128c7e, #075e54)",
            color: "#ffffff",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 13,
            fontWeight: 700,
            cursor: "pointer",
            position: "relative",
            boxShadow: "0 1px 4px rgba(0,0,0,0.2)",
          }}
          onClick={onOpenSettings}
          title={`Owner: ${ownerPhone || "Connected"} (#${hash})`}
        >
          {initial}
          <span
            style={{
              position: "absolute",
              bottom: -1,
              right: -1,
              width: 10,
              height: 10,
              borderRadius: "50%",
              backgroundColor: "#25d366",
              border: "2px solid var(--wa-header-bg)",
            }}
          />
        </div>
      </div>
    </div>
  );
}
