"use client";

import { useState } from "react";
import { DoubleCheckIcon, RobotIcon, ImageIcon } from "../Icons/WhatsAppIcons";
import { FormattedMessage } from "./FormattedMessage";

function formatTime(timestamp) {
  if (!timestamp) return "";
  const d = new Date(timestamp);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function MessageBubble({ message }) {
  const [failedImages, setFailedImages] = useState(new Set());

  const isOutgoing = Boolean(
    message.isFromMe ||
    message.is_from_me ||
    message.fromMe ||
    message.direction === "outbound"
  );
  const isAi = Boolean(
    message.isAi ||
    message.aiGenerated ||
    message.sender === "ai" ||
    message.origin === "ai" ||
    message.origin === "takeover"
  );
  const rawText = message.content || message.body || message.text || message.message || "";
  const time = formatTime(message.timestamp || message.createdAt || message.time);
  const mediaType = (message.mediaType || message.media_type || "").toLowerCase();
  const filename = message.filename || "";

  // 1. Gather all explicit and embedded image URLs
  const allImageUrls = [];
  if (Array.isArray(message.imageUrls)) {
    allImageUrls.push(...message.imageUrls.filter(Boolean));
  } else if (typeof message.imageUrls === "string" && message.imageUrls.trim()) {
    allImageUrls.push(message.imageUrls.trim());
  }
  if (typeof message.imageUrl === "string" && message.imageUrl.trim()) {
    allImageUrls.push(message.imageUrl.trim());
  }
  if (typeof message.mediaUrl === "string" && message.mediaUrl.trim().startsWith("http")) {
    allImageUrls.push(message.mediaUrl.trim());
  }
  if (typeof message.url === "string" && message.url.trim().startsWith("http")) {
    allImageUrls.push(message.url.trim());
  }

  // Detect Vercel Blob URLs or direct image URLs embedded in rawText
  const blobUrlRegex = /(https?:\/\/[^\s]+\.(?:public\.blob\.vercel-storage\.com|blob\.vercel-storage\.com)[^\s]*)/gi;
  const directImgRegex = /(https?:\/\/[^\s]+\.(?:png|jpg|jpeg|webp|gif)(?:\?[^\s]*)?)/gi;

  let match;
  while ((match = blobUrlRegex.exec(rawText)) !== null) {
    if (!allImageUrls.includes(match[1])) allImageUrls.push(match[1]);
  }
  while ((match = directImgRegex.exec(rawText)) !== null) {
    if (!allImageUrls.includes(match[1])) allImageUrls.push(match[1]);
  }

  const imageUrls = Array.from(new Set(allImageUrls));

  // Determine if this is an image message
  const isImageMedia =
    mediaType === "image" ||
    imageUrls.length > 0 ||
    Boolean(filename && filename.match(/\.(jpg|jpeg|png|webp|gif)$/i)) ||
    /^\[image(?::\s*[^\]]+)?\]$/i.test(rawText.trim());

  // Clean display text (strip standalone blob URLs and technical markers)
  let displayText = rawText;
  imageUrls.forEach((u) => {
    displayText = displayText.replace(u, "").trim();
  });
  // Strip [image: filename.jpg] markers
  displayText = displayText.replace(/\[image(?::\s*[^\]]+)?\]/gi, "").trim();

  return (
    <div className={`wa-bubble-wrapper ${isOutgoing ? "outgoing" : "incoming"}`}>
      <div
        className={`wa-bubble ${isOutgoing ? "outgoing" : "incoming"} ${
          isAi ? "ai-generated" : ""
        }`}
      >
        {/* SVG Bubble Tail Notch */}
        {isOutgoing ? (
          <svg className="wa-bubble-tail-out" viewBox="0 0 8 13">
            <path d="M0 0 C3 2, 6 6, 8 13 L0 13 Z" />
          </svg>
        ) : (
          <svg className="wa-bubble-tail-in" viewBox="0 0 8 13">
            <path d="M8 0 C5 2, 2 6, 0 13 L8 13 Z" />
          </svg>
        )}

        {/* AI Generator Tag */}
        {isAi && (
          <div className="wa-ai-tag">
            <RobotIcon size={11} color="#075e54" />
            <span>AI Persona Reply</span>
          </div>
        )}

        {/* Render Attached / Vercel Blob Images */}
        {imageUrls.length > 0 && (
          <div className="wa-bubble-images">
            {imageUrls.map((url, i) => {
              if (failedImages.has(url)) {
                return (
                  <div key={i} className="wa-photo-card">
                    <div className="wa-photo-icon-box">
                      <ImageIcon size={18} color="#ffffff" />
                    </div>
                    <span className="wa-photo-label">Photo</span>
                  </div>
                );
              }
              return (
                <a
                  key={i}
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="wa-bubble-image-link"
                >
                  <img
                    src={url}
                    alt={`attachment-${i + 1}`}
                    className="wa-bubble-image"
                    loading="lazy"
                    onError={() => {
                      setFailedImages((prev) => new Set([...prev, url]));
                    }}
                  />
                </a>
              );
            })}
            <div className="wa-bubble-image-note">
              <ImageIcon size={12} color="currentColor" />
              <span>Not visible to AI</span>
            </div>
          </div>
        )}

        {/* Native WhatsApp Image without direct URL: Display Photo Attachment Card */}
        {isImageMedia && imageUrls.length === 0 && (
          <div className="wa-photo-card">
            <div className="wa-photo-icon-box">
              <ImageIcon size={18} color="#ffffff" />
            </div>
            <span className="wa-photo-label">{filename ? filename : "Photo"}</span>
          </div>
        )}

        {/* Message Text with WhatsApp Formatting */}
        {displayText ? <FormattedMessage text={displayText} /> : null}

        {/* Timestamp & Status Metadata */}
        <div className="wa-bubble-meta">
          <span>{time}</span>
          {isOutgoing && <DoubleCheckIcon isRead={true} size={15} />}
        </div>
      </div>
    </div>
  );
}
