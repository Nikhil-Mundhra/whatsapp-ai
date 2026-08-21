"use client";

import React from "react";
import {
  SearchIcon,
  CloseIcon,
  CopyIcon,
  RobotIcon,
} from "../../components/Icons/WhatsAppIcons";
import { formatTimeAgo } from "./utils";

export default function FleetTab({
  summary,
  searchQuery,
  setSearchQuery,
  statusFilter,
  setStatusFilter,
  sortBy,
  setSortBy,
  filteredUsers,
  selectedUser,
  setSelectedUser,
  handleUserAction,
  actionLoading,
}) {
  return (
    <>
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
            Storage Used (Disk &amp; Memory)
          </div>
          <div style={{ fontSize: "28px", fontWeight: "700", color: "var(--wa-text-primary)" }}>
            {summary.totalStorageFormatted}
          </div>
          <div style={{ fontSize: "12px", color: "var(--wa-text-secondary)", marginTop: 4 }}>
            SQLite DBs &amp; JSON payloads
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
            Total Messages &amp; AI Replies
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
            <div style={{ display: "flex", justifyContent: "center", marginBottom: 12 }}>
              <SearchIcon size={36} color="var(--wa-text-muted)" />
            </div>
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
    </>
  );
}
