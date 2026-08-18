"use client";

import { SearchIcon } from "../Icons/WhatsAppIcons";

export function SearchBar({
  searchQuery,
  setSearchQuery,
  filterType,
  setFilterType,
  pendingCount = 0,
  activeAutonomyCount = 0,
}) {
  return (
    <div className="wa-search-container">
      <div className="wa-search-wrapper">
        <SearchIcon size={16} color="#8696a0" />
        <input
          type="text"
          className="wa-search-input"
          placeholder="Search or start new chat"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery("")}
            style={{
              background: "none",
              border: "none",
              color: "#8696a0",
              cursor: "pointer",
              fontSize: 14,
              fontWeight: 700,
            }}
          >
            ×
          </button>
        )}
      </div>

      {/* Filter Chips */}
      <div className="wa-filter-tabs">
        <button
          className={`wa-filter-chip ${filterType === "all" ? "active" : ""}`}
          onClick={() => setFilterType("all")}
        >
          All
        </button>
        <button
          className={`wa-filter-chip ${filterType === "pending" ? "active" : ""}`}
          onClick={() => setFilterType("pending")}
        >
          <span>Pending Polls</span>
          {pendingCount > 0 && (
            <span
              style={{
                backgroundColor: "#ef4444",
                color: "#ffffff",
                fontSize: 10,
                padding: "1px 5px",
                borderRadius: 8,
                fontWeight: 700,
              }}
            >
              {pendingCount}
            </span>
          )}
        </button>
        <button
          className={`wa-filter-chip ${filterType === "autonomy" ? "active" : ""}`}
          onClick={() => setFilterType("autonomy")}
        >
          <span>AI Active</span>
          {activeAutonomyCount > 0 && (
            <span
              style={{
                backgroundColor: "#22c55e",
                color: "#ffffff",
                fontSize: 10,
                padding: "1px 5px",
                borderRadius: 8,
                fontWeight: 700,
              }}
            >
              {activeAutonomyCount}
            </span>
          )}
        </button>
      </div>
    </div>
  );
}
