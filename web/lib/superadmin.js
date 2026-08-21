import { createHmac, timingSafeEqual, randomBytes } from "crypto";
import { kv } from "./polls.js";
import { createJwt, verifyJwt } from "./jwt.js";
import { getConnection, getBridgeHeaders, getBridgeUrl } from "./connections.js";
import { getLocalMessages } from "./sqlite.js";
import fs from "fs";
import path from "path";

export const SUPERADMIN_COOKIE_NAME = "wa_superadmin_token";
export const SUPERADMIN_SESSION_TTL_SECONDS = 7 * 24 * 3600; // 7 days
const SUPERADMIN_OTP_PREFIX = "superadmin:otp:";
const SUPERADMIN_REVOKED_PREFIX = "superadmin:revoked:";

// In-memory rate limiting and lockout state
globalThis.__superadminRateLimit = globalThis.__superadminRateLimit || new Map();
globalThis.__superadminOtpFallback = globalThis.__superadminOtpFallback || new Map();
globalThis.__superadminRevokedFallback = globalThis.__superadminRevokedFallback || new Set();

const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes

/**
 * Returns the configured superadmin secret / master key.
 */
export function getSuperadminSecret() {
  return (
    process.env.SUPERADMIN_SECRET ||
    process.env.SUPERADMIN_KEY ||
    process.env.SUPERADMIN_PASSWORD ||
    "admin"
  );
}

/**
 * Checks whether superadmin 2FA (WhatsApp OTP) is required.
 */
export function isSuperadmin2FARequired() {
  return Boolean(process.env.SUPERADMIN_PHONE && String(process.env.SUPERADMIN_PHONE).trim());
}

export function getSuperadminPhone() {
  return String(process.env.SUPERADMIN_PHONE || "").trim();
}

/**
 * Secure constant-time string comparison.
 */
export function secureCompare(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) {
    timingSafeEqual(bufA, bufA);
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}

/**
 * Checks if an IP or identifier is currently locked out from brute-force attempts.
 */
export function checkRateLimit(identifier = "global") {
  const record = globalThis.__superadminRateLimit.get(identifier);
  if (!record) return { allowed: true, remainingAttempts: MAX_LOGIN_ATTEMPTS };

  const now = Date.now();
  if (record.lockedUntil && record.lockedUntil > now) {
    const remainingSeconds = Math.ceil((record.lockedUntil - now) / 1000);
    return {
      allowed: false,
      locked: true,
      remainingSeconds,
      error: `Too many failed attempts. Account locked for ${remainingSeconds}s.`,
    };
  }

  if (record.lockedUntil && record.lockedUntil <= now) {
    globalThis.__superadminRateLimit.delete(identifier);
    return { allowed: true, remainingAttempts: MAX_LOGIN_ATTEMPTS };
  }

  const remaining = Math.max(0, MAX_LOGIN_ATTEMPTS - (record.attempts || 0));
  return { allowed: remaining > 0, remainingAttempts: remaining };
}

/**
 * Records a failed login attempt for rate limiting.
 */
export function recordFailedAttempt(identifier = "global") {
  const now = Date.now();
  const record = globalThis.__superadminRateLimit.get(identifier) || { attempts: 0 };
  record.attempts = (record.attempts || 0) + 1;
  record.lastAttempt = now;

  if (record.attempts >= MAX_LOGIN_ATTEMPTS) {
    record.lockedUntil = now + LOCKOUT_DURATION_MS;
  }

  globalThis.__superadminRateLimit.set(identifier, record);
  const remaining = Math.max(0, MAX_LOGIN_ATTEMPTS - record.attempts);
  return {
    locked: Boolean(record.lockedUntil),
    remainingAttempts: remaining,
  };
}

/**
 * Resets rate limit on successful authentication.
 */
export function resetRateLimit(identifier = "global") {
  globalThis.__superadminRateLimit.delete(identifier);
}

/**
 * Validates the superadmin password/secret in constant time.
 */
export function verifySuperadminSecret(inputPassword, identifier = "global") {
  const limitCheck = checkRateLimit(identifier);
  if (!limitCheck.allowed) {
    return { valid: false, error: limitCheck.error, locked: true };
  }

  const expectedSecret = getSuperadminSecret();
  const isValid = secureCompare(inputPassword, expectedSecret);

  if (!isValid) {
    const failInfo = recordFailedAttempt(identifier);
    if (failInfo.locked) {
      return {
        valid: false,
        error: "Too many failed attempts. Locked out for 15 minutes.",
        locked: true,
      };
    }
    return {
      valid: false,
      error: `Invalid master credentials. ${failInfo.remainingAttempts} attempt(s) remaining.`,
      remainingAttempts: failInfo.remainingAttempts,
    };
  }

  resetRateLimit(identifier);
  return { valid: true };
}

/**
 * Generates and sends a 6-digit WhatsApp OTP for Superadmin 2FA.
 */
export async function sendSuperadminOtp() {
  const phone = getSuperadminPhone();
  if (!phone) {
    throw new Error("SUPERADMIN_PHONE is not configured in environment");
  }

  const cleanPhone = phone.replace(/\D/g, "");
  const digits = "0123456789";
  const bytes = randomBytes(6);
  let otp = "";
  for (let i = 0; i < 6; i++) {
    otp += digits[bytes[i] % 10];
  }

  const expiresAt = Date.now() + 600 * 1000; // 10 minutes
  const otpRecord = {
    code: otp,
    phone: cleanPhone,
    attempts: 0,
    expiresAt,
  };

  globalThis.__superadminOtpFallback.set("superadmin", otpRecord);

  if (kv) {
    try {
      await kv.set(SUPERADMIN_OTP_PREFIX + "master", JSON.stringify(otpRecord), { ex: 600 });
    } catch (e) {
      console.error("[kv sendSuperadminOtp error]", e);
    }
  }

  const bridgeUrl = getBridgeUrl();
  const otpMessage = `*WhatsApp AI Superadmin 2FA Code*\n\nYour Master Admin access verification code is: *${otp}*\n\nValid for 10 minutes. NEVER share this code.`;

  let bridgeSent = false;
  let bridgeError = null;

  if (bridgeUrl) {
    // 1. Discover active tenants from the bridge
    let targetHashes = [];
    try {
      const healthRes = await fetch(`${bridgeUrl}/api/health`, {
        headers: getBridgeHeaders(),
        signal: AbortSignal.timeout(4000),
      });
      if (healthRes.ok) {
        const healthData = await healthRes.json();
        if (Array.isArray(healthData.tenants)) {
          // Prioritize tenant matching the superadmin phone
          const matchingTenant = healthData.tenants.find(
            (t) => t.ownerPhone && t.ownerPhone.replace(/\D/g, "") === cleanPhone
          );
          if (matchingTenant && matchingTenant.hash) {
            targetHashes.push(matchingTenant.hash);
          }
          // Add other connected tenants as candidates
          healthData.tenants.forEach((t) => {
            if (t.connected && t.hash && !targetHashes.includes(t.hash)) {
              targetHashes.push(t.hash);
            }
          });
        }
      }
    } catch (e) {
      // Fallback
    }

    // Also check KV / in-memory connections if no tenants found in health
    if (targetHashes.length === 0 && globalThis.__connectionsFallback) {
      for (const k of globalThis.__connectionsFallback.keys()) {
        if (k) targetHashes.push(String(k).trim().toUpperCase());
      }
    }

    // 2. Try sending through the discovered active tenants
    for (const h of targetHashes) {
      try {
        const res = await fetch(`${bridgeUrl}/api/connections/${h}/send`, {
          method: "POST",
          headers: getBridgeHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({ recipient: cleanPhone, message: otpMessage }),
          signal: AbortSignal.timeout(8000),
        });
        if (res.ok) {
          bridgeSent = true;
          bridgeError = null;
          break;
        } else {
          const errData = await res.json().catch(() => ({}));
          bridgeError = errData.error || `Bridge status ${res.status}`;
        }
      } catch (err) {
        bridgeError = err.message;
      }
    }

    // 3. Fallback to /api/send if no tenant send succeeded
    if (!bridgeSent) {
      try {
        const res = await fetch(`${bridgeUrl}/api/send`, {
          method: "POST",
          headers: getBridgeHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({ recipient: cleanPhone, message: otpMessage }),
          signal: AbortSignal.timeout(6000),
        });
        if (res.ok) {
          bridgeSent = true;
          bridgeError = null;
        } else {
          const errData = await res.json().catch(() => ({}));
          bridgeError = errData.error || bridgeError || `Bridge status ${res.status}`;
        }
      } catch (err) {
        if (!bridgeError) bridgeError = err.message;
      }
    }
  }

  return {
    success: true,
    maskedPhone: cleanPhone.slice(0, 2) + "••••••" + cleanPhone.slice(-3),
    expiresAt,
    bridgeSent,
    bridgeError,
    devOtp: process.env.NODE_ENV !== "production" ? otp : undefined,
  };
}

/**
 * Validates the 6-digit Superadmin 2FA OTP.
 */
export async function verifySuperadminOtp(inputOtp) {
  const cleanOtp = String(inputOtp || "").trim();
  if (!cleanOtp) return { valid: false, error: "Verification code is required" };

  let otpRecord = null;
  if (kv) {
    try {
      const raw = await kv.get(SUPERADMIN_OTP_PREFIX + "master");
      if (raw) otpRecord = typeof raw === "string" ? JSON.parse(raw) : raw;
    } catch {}
  }
  if (!otpRecord) {
    otpRecord = globalThis.__superadminOtpFallback.get("superadmin");
  }

  if (!otpRecord) {
    return { valid: false, error: "No active verification code found. Please request a new one." };
  }

  if (Date.now() > otpRecord.expiresAt) {
    globalThis.__superadminOtpFallback.delete("superadmin");
    return { valid: false, error: "Verification code has expired. Please request a new one." };
  }

  if (otpRecord.attempts >= 5) {
    globalThis.__superadminOtpFallback.delete("superadmin");
    return { valid: false, error: "Too many incorrect attempts. Please request a new code." };
  }

  if (otpRecord.code !== cleanOtp) {
    otpRecord.attempts = (otpRecord.attempts || 0) + 1;
    globalThis.__superadminOtpFallback.set("superadmin", otpRecord);
    return {
      valid: false,
      error: `Invalid code. ${5 - otpRecord.attempts} attempt(s) remaining.`,
    };
  }

  // OTP is correct! Clear it
  globalThis.__superadminOtpFallback.delete("superadmin");
  if (kv) {
    try {
      await kv.del(SUPERADMIN_OTP_PREFIX + "master");
    } catch {}
  }

  return { valid: true };
}

/**
 * Creates a signed JWT session for Superadmin.
 */
export function createSuperadminSessionToken() {
  return createJwt(
    {
      role: "superadmin",
      type: "superadmin_session",
      authenticatedAt: Date.now(),
    },
    SUPERADMIN_SESSION_TTL_SECONDS
  );
}

/**
 * Verifies if a request or raw token carries a valid Superadmin JWT session.
 */
export async function verifySuperadminSession(tokenOrReq) {
  let token = null;

  if (typeof tokenOrReq === "string") {
    token = tokenOrReq;
  } else if (tokenOrReq) {
    // Extract from NextRequest / Request cookies
    if (tokenOrReq.cookies && typeof tokenOrReq.cookies.get === "function") {
      const cookie = tokenOrReq.cookies.get(SUPERADMIN_COOKIE_NAME);
      if (cookie?.value) token = cookie.value;
    }
    if (!token && tokenOrReq.headers) {
      const cookieHeader = tokenOrReq.headers.get?.("cookie") || "";
      const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${SUPERADMIN_COOKIE_NAME}=([^;]+)`));
      if (match && match[1]) token = decodeURIComponent(match[1]);

      if (!token) {
        const authHeader = tokenOrReq.headers.get?.("authorization") || "";
        if (authHeader.toLowerCase().startsWith("bearer ")) {
          token = authHeader.slice(7).trim();
        }
      }
    }
  }

  if (!token) return false;

  // Check revocation
  if (globalThis.__superadminRevokedFallback.has(token)) return false;
  if (kv) {
    try {
      const isRevoked = await kv.get(SUPERADMIN_REVOKED_PREFIX + token);
      if (isRevoked) return false;
    } catch {}
  }

  const payload = verifyJwt(token);
  if (!payload) return false;

  return payload.role === "superadmin";
}

/**
 * Sets the Superadmin authentication cookie on a NextResponse.
 */
export function setSuperadminCookies(response, token) {
  if (!response || !response.cookies) return response;
  response.cookies.set(SUPERADMIN_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: SUPERADMIN_SESSION_TTL_SECONDS,
  });
  return response;
}

/**
 * Clears the Superadmin authentication cookie.
 */
export function clearSuperadminCookies(response) {
  if (!response || !response.cookies) return response;
  response.cookies.set(SUPERADMIN_COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 0,
  });
  return response;
}

/**
 * Calculates storage size helper (formats bytes into readable string).
 */
export function formatBytes(bytes) {
  if (!bytes || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

/**
 * Aggregates all users, their metrics, storage used, chats automated, and message counts.
 */
export async function getAllUsersOverview() {
  const BRIDGE_URL = getBridgeUrl();
  const allHashes = new Set();

  // 1. Fetch hashes from KV sorted set
  if (kv) {
    try {
      const kvHashes = await kv.zrange("connections", 0, -1);
      if (Array.isArray(kvHashes)) {
        kvHashes.forEach((h) => {
          if (h && typeof h === "string") allHashes.add(h.trim().toUpperCase());
        });
      }
    } catch (e) {
      console.warn("Failed to fetch hashes from KV", e);
    }
  }

  // 2. Fetch hashes from in-memory fallback
  if (globalThis.__connectionsFallback) {
    for (const k of globalThis.__connectionsFallback.keys()) {
      if (k) allHashes.add(String(k).trim().toUpperCase());
    }
  }

  // 3. Fetch live tenants from Bridge
  let bridgeHealth = null;
  let bridgeTenantsMap = new Map();
  if (BRIDGE_URL) {
    try {
      const res = await fetch(`${BRIDGE_URL}/api/health`, {
        headers: getBridgeHeaders(),
        signal: AbortSignal.timeout(5000),
      });
      if (res.ok) {
        bridgeHealth = await res.json();
        if (Array.isArray(bridgeHealth.tenants)) {
          bridgeHealth.tenants.forEach((t) => {
            if (t?.hash) {
              const h = String(t.hash).trim().toUpperCase();
              allHashes.add(h);
              bridgeTenantsMap.set(h, t);
            }
          });
        }
      }
    } catch (e) {
      // Bridge health lookup fallback
    }
  }

  // Also check local SQLite store directory for tenant databases if running in unified environment
  const possibleTenantDirs = [
    path.resolve(process.cwd(), "..", "whatsapp-bridge", "store", "tenants"),
    path.resolve(process.cwd(), "whatsapp-bridge", "store", "tenants"),
    path.resolve(process.cwd(), "store", "tenants"),
  ];

  for (const tDir of possibleTenantDirs) {
    if (fs.existsSync(tDir)) {
      try {
        const dirs = fs.readdirSync(tDir);
        dirs.forEach((d) => {
          if (d && !d.startsWith(".")) {
            allHashes.add(d.trim().toUpperCase());
          }
        });
      } catch {}
    }
  }

  const users = [];
  let totalStorageBytes = 0;
  let totalMessagesAllUsers = 0;
  let totalAiMessagesAllUsers = 0;
  let totalAutomatedChatsAllUsers = 0;
  let totalConnectedUsers = 0;

  for (const hash of Array.from(allHashes)) {
    let conn = await getConnection(hash);
    const bridgeTenant = bridgeTenantsMap.get(hash);

    // If connection not found in KV/memory, reconstruct from bridge tenant metadata
    if (!conn) {
      conn = {
        hash,
        ownerPhone: bridgeTenant?.ownerPhone || "",
        allowedRecipients: bridgeTenant?.allowedRecipients || [],
        aiModel: bridgeTenant?.aiModel || "qwen/qwen3.8-27b",
        status: bridgeTenant?.linked ? "linked" : "configuring",
        createdAt: bridgeTenant?.connectedAt ? new Date(bridgeTenant.connectedAt).getTime() : Date.now(),
      };
    }

    // Merge latest live state from bridge
    const isConnected = Boolean(bridgeTenant?.connected);
    const isLinked = Boolean(bridgeTenant?.linked || conn.status === "linked");
    if (isConnected) totalConnectedUsers++;

    // Fetch messages for metrics calculation
    let messages = [];
    if (BRIDGE_URL) {
      try {
        const msgRes = await fetch(`${BRIDGE_URL}/api/connections/${hash}/messages?limit=500`, {
          headers: getBridgeHeaders(),
          signal: AbortSignal.timeout(4000),
        });
        if (msgRes.ok) {
          const msgData = await msgRes.json();
          if (Array.isArray(msgData.messages)) {
            messages = msgData.messages;
          }
        }
      } catch {}
    }

    // Local fallback for messages if bridge query returned empty
    if (messages.length === 0) {
      const localMsgs = getLocalMessages("", 500);
      if (localMsgs && localMsgs.length > 0) {
        messages = localMsgs;
      }
    }

    // Compute metrics
    let messagesSent = 0;
    let messagesReceived = 0;
    let aiMessagesCount = 0;
    let messagesPayloadBytes = 0;
    let lastActiveTimestamp = conn.createdAt || Date.now();
    const activeChatJids = new Set();

    messages.forEach((m) => {
      const content = m.content || "";
      messagesPayloadBytes += content.length + 128; // payload + metadata overhead
      if (m.chatJid) activeChatJids.add(m.chatJid);

      if (m.timestamp) {
        const ts = typeof m.timestamp === "number" ? m.timestamp : new Date(m.timestamp).getTime();
        if (ts > lastActiveTimestamp) lastActiveTimestamp = ts;
      }

      if (m.isFromMe || m.origin === "phone" || m.origin === "ai" || m.isAi) {
        messagesSent++;
      } else {
        messagesReceived++;
      }

      if (m.isAi || m.origin === "ai" || m.origin === "takeover") {
        aiMessagesCount++;
      }
    });

    // Check file-based storage footprint if store/tenants/<hash> exists
    let diskBytes = 0;
    for (const tDir of possibleTenantDirs) {
      const tenantPath = path.resolve(tDir, hash);
      if (fs.existsSync(tenantPath)) {
        try {
          const files = fs.readdirSync(tenantPath);
          for (const f of files) {
            const stat = fs.statSync(path.resolve(tenantPath, f));
            diskBytes += stat.size;
          }
        } catch {}
      }
    }

    // If diskBytes is 0 (e.g. cloud KV deployment), estimate storage from KV record & message buffer
    const finalStorageBytes = diskBytes > 0 ? diskBytes : Math.max(messagesPayloadBytes + 4096, 8192);
    totalStorageBytes += finalStorageBytes;
    totalMessagesAllUsers += messages.length;
    totalAiMessagesAllUsers += aiMessagesCount;

    const allowedRecipients = Array.isArray(conn.allowedRecipients)
      ? conn.allowedRecipients
      : String(conn.allowedRecipients || "").split(",").map((s) => s.trim()).filter(Boolean);

    const chatsAutomatedCount = Math.max(allowedRecipients.length, activeChatJids.size);
    totalAutomatedChatsAllUsers += chatsAutomatedCount;

    // Status classification
    let displayStatus = "configuring";
    if (isConnected) {
      displayStatus = "connected";
    } else if (isLinked) {
      displayStatus = "disconnected";
    } else if (bridgeTenant?.pairing) {
      displayStatus = "pairing";
    }

    users.push({
      hash,
      ownerPhone: conn.ownerPhone || bridgeTenant?.ownerPhone || "",
      status: displayStatus,
      isLinked,
      isConnected,
      aiModel: conn.aiModel || bridgeTenant?.aiModel || "qwen/qwen3.8-27b",
      aiApiKeySet: Boolean(conn.aiApiKey || bridgeTenant?.aiApiKeySet),
      allowedRecipients,
      chatsAutomated: chatsAutomatedCount,
      messagesSent,
      messagesReceived,
      aiMessagesSent: aiMessagesCount,
      totalMessages: messages.length,
      storageUsedBytes: finalStorageBytes,
      storageUsedFormatted: formatBytes(finalStorageBytes),
      createdAt: conn.createdAt || Date.now(),
      lastActive: lastActiveTimestamp,
      lastError: bridgeTenant?.lastError || "",
      reconnectAttempts: bridgeTenant?.reconnectAttempts || 0,
    });
  }

  // Sort by most recently active
  users.sort((a, b) => (b.lastActive || 0) - (a.lastActive || 0));

  return {
    summary: {
      totalUsers: users.length,
      connectedUsers: totalConnectedUsers,
      totalStorageBytes,
      totalStorageFormatted: formatBytes(totalStorageBytes),
      totalMessages: totalMessagesAllUsers,
      totalAiMessages: totalAiMessagesAllUsers,
      totalAutomatedChats: totalAutomatedChatsAllUsers,
      bridgeStatus: bridgeHealth ? "online" : "standalone",
      uptimeSeconds: bridgeHealth?.uptimeSeconds || 0,
    },
    users,
  };
}
