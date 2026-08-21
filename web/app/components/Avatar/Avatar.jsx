"use client";

import React, { useState } from "react";
import { UsersIcon } from "../Icons/WhatsAppIcons";

const AVATAR_COLORS = [
  "linear-gradient(135deg, #3b82f6, #1d4ed8)",
  "linear-gradient(135deg, #10b981, #047857)",
  "linear-gradient(135deg, #8b5cf6, #6d28d9)",
  "linear-gradient(135deg, #f59e0b, #b45309)",
  "linear-gradient(135deg, #ec4899, #be185d)",
  "linear-gradient(135deg, #06b6d4, #0e7490)",
];

function getAvatarColor(str = "") {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

export function Avatar({
  src,
  name = "",
  initial = "",
  size = 44,
  isGroup = false,
  style = {},
  className = "",
  title = "",
}) {
  const [imgError, setImgError] = useState(false);
  const [imgLoaded, setImgLoaded] = useState(false);

  const fallbackInitial = initial || (name ? name.slice(0, 2).toUpperCase() : "");
  const backgroundColor = isGroup
    ? "linear-gradient(135deg, #059669, #047857)"
    : getAvatarColor(name || fallbackInitial);

  return (
    <div
      className={`wa-avatar ${className}`}
      title={title || name}
      style={{
        width: size,
        height: size,
        minWidth: size,
        minHeight: size,
        borderRadius: "50%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "#ffffff",
        fontWeight: 600,
        fontSize: size <= 36 ? 13 : 15,
        position: "relative",
        overflow: "hidden",
        background: backgroundColor,
        userSelect: "none",
        flexShrink: 0,
        boxShadow: "0 1px 3px rgba(0, 0, 0, 0.1)",
        ...style,
      }}
    >
      {/* Fallback Icon / Initials */}
      {(!src || imgError) ? (
        isGroup ? (
          <UsersIcon size={Math.round(size * 0.45)} color="#ffffff" />
        ) : (
          <span>{fallbackInitial}</span>
        )
      ) : null}

      {/* Profile Photo Image (from Vercel Blob / WhatsApp CDN) */}
      {src && !imgError && (
        <img
          src={src}
          alt={name || "Avatar"}
          loading="lazy"
          onLoad={() => setImgLoaded(true)}
          onError={() => setImgError(true)}
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
            borderRadius: "50%",
            opacity: imgLoaded ? 1 : 0,
            transition: "opacity 0.2s ease-in-out",
          }}
        />
      )}
    </div>
  );
}
