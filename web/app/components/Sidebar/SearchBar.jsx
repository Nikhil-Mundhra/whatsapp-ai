"use client";

import React from "react";
import { SearchIcon } from "../Icons/WhatsAppIcons";

export function SearchBar({
  searchQuery,
  setSearchQuery,
  filterType,
  setFilterType,
  unreadCount = 0,
  groupsCount = 0,
  favouritesCount = 0,
}) {
  return (
    <div
      className="wa-search-container"
      style={{
        padding: "8px 12px 10px 12px",
        borderBottom: "1px solid var(--wa-border-light)",
        backgroundColor: "var(--wa-panel-bg)",
        display: "flex",
        flexDirection: "column",
        gap: 8,
        flexShrink: 0,
      }}
    >
      {/* Search Input Bar */}
      <div
        className="wa-search-wrapper"
        style={{
          backgroundColor: "var(--wa-search-input)",
          borderRadius: 8,
          display: "flex",
          alignItems: "center",
          padding: "0 12px",
          height: 36,
          gap: 10,
          border: "1px solid var(--wa-border-light)",
        }}
      >
        <SearchIcon size={16} color="var(--wa-icon-color)" />
        <input
          type="text"
          className="wa-search-input"
          placeholder="Search or start new chat"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{
            border: "none",
            background: "transparent",
            width: "100%",
            fontSize: 14,
            color: "var(--wa-text-primary)",
            outline: "none",
          }}
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery("")}
            style={{
              background: "none",
              border: "none",
              color: "var(--wa-text-muted)",
              cursor: "pointer",
              fontSize: 16,
              fontWeight: 700,
              display: "flex",
              alignItems: "center",
            }}
          >
            ×
          </button>
        )}
      </div>

      {/* Filter Tabs matching WhatsApp Desktop/Web exactly */}
      <div
        className="wa-filter-tabs"
        style={{
          display: "flex",
          gap: 6,
          overflowX: "auto",
          paddingBottom: 2,
          scrollbarWidth: "none",
        }}
      >
        <button
          className={`wa-filter-chip ${filterType === "all" ? "active" : ""}`}
          onClick={() => setFilterType("all")}
          style={{
            padding: "4px 12px",
            borderRadius: 16,
            fontSize: 12,
            fontWeight: filterType === "all" ? 700 : 500,
            border: "none",
            backgroundColor: filterType === "all" ? "var(--wa-teal)" : "var(--wa-search-input)",
            color: filterType === "all" ? "#ffffff" : "var(--wa-text-secondary)",
            cursor: "pointer",
            whiteSpace: "nowrap",
            display: "flex",
            alignItems: "center",
            gap: 4,
            transition: "all 0.15s ease",
          }}
        >
          All
        </button>

        <button
          className={`wa-filter-chip ${filterType === "unread" ? "active" : ""}`}
          onClick={() => setFilterType("unread")}
          style={{
            padding: "4px 12px",
            borderRadius: 16,
            fontSize: 12,
            fontWeight: filterType === "unread" ? 700 : 500,
            border: "none",
            backgroundColor: filterType === "unread" ? "var(--wa-teal)" : "var(--wa-search-input)",
            color: filterType === "unread" ? "#ffffff" : "var(--wa-text-secondary)",
            cursor: "pointer",
            whiteSpace: "nowrap",
            display: "flex",
            alignItems: "center",
            gap: 5,
            transition: "all 0.15s ease",
          }}
        >
          <span>Unread</span>
          {unreadCount > 0 && (
            <span
              style={{
                backgroundColor: filterType === "unread" ? "rgba(255,255,255,0.25)" : "#25d366",
                color: "#ffffff",
                fontSize: 10,
                padding: "1px 5px",
                borderRadius: 8,
                fontWeight: 700,
              }}
            >
              {unreadCount}
            </span>
          )}
        </button>

        <button
          className={`wa-filter-chip ${filterType === "favourites" ? "active" : ""}`}
          onClick={() => setFilterType("favourites")}
          style={{
            padding: "4px 12px",
            borderRadius: 16,
            fontSize: 12,
            fontWeight: filterType === "favourites" ? 700 : 500,
            border: "none",
            backgroundColor: filterType === "favourites" ? "var(--wa-teal)" : "var(--wa-search-input)",
            color: filterType === "favourites" ? "#ffffff" : "var(--wa-text-secondary)",
            cursor: "pointer",
            whiteSpace: "nowrap",
            display: "flex",
            alignItems: "center",
            gap: 4,
            transition: "all 0.15s ease",
          }}
        >
          <span>Favourites</span>
          {favouritesCount > 0 && (
            <span
              style={{
                backgroundColor: filterType === "favourites" ? "rgba(255,255,255,0.25)" : "var(--wa-border-strong)",
                color: filterType === "favourites" ? "#ffffff" : "var(--wa-text-primary)",
                fontSize: 10,
                padding: "1px 5px",
                borderRadius: 8,
                fontWeight: 700,
              }}
            >
              {favouritesCount}
            </span>
          )}
        </button>

        <button
          className={`wa-filter-chip ${filterType === "groups" ? "active" : ""}`}
          onClick={() => setFilterType("groups")}
          style={{
            padding: "4px 12px",
            borderRadius: 16,
            fontSize: 12,
            fontWeight: filterType === "groups" ? 700 : 500,
            border: "none",
            backgroundColor: filterType === "groups" ? "var(--wa-teal)" : "var(--wa-search-input)",
            color: filterType === "groups" ? "#ffffff" : "var(--wa-text-secondary)",
            cursor: "pointer",
            whiteSpace: "nowrap",
            display: "flex",
            alignItems: "center",
            gap: 4,
            transition: "all 0.15s ease",
          }}
        >
          <span>Groups</span>
          {groupsCount > 0 && (
            <span
              style={{
                backgroundColor: filterType === "groups" ? "rgba(255,255,255,0.25)" : "var(--wa-border-strong)",
                color: filterType === "groups" ? "#ffffff" : "var(--wa-text-primary)",
                fontSize: 10,
                padding: "1px 5px",
                borderRadius: 8,
                fontWeight: 700,
              }}
            >
              {groupsCount}
            </span>
          )}
        </button>
      </div>
    </div>
  );
}
