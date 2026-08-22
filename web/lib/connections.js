import { randomBytes } from "crypto";
import { kv } from "./polls.js";
import { createJwt, verifyJwt, decodeJwt, SESSION_TTL_SECONDS } from "./jwt.js";

const PREFIX = "conn:";
const INDEX = "connections";
const OTP_PREFIX = "otp:";
const SESSION_PREFIX = "session:";
const REVOKED_PREFIX = "revoked:";
const OTP_TTL_SECONDS = 600; // 10 minutes

const HASH_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const HASH_LEN = 6;

// In-memory fallback in case KV is unconfigured
globalThis.__connectionsFallback = globalThis.__connectionsFallback || new Map();
globalThis.__otpFallback = globalThis.__otpFallback || new Map();
globalThis.__sessionFallback = globalThis.__sessionFallback || new Map();
globalThis.__revokedTokensFallback = globalThis.__revokedTokensFallback || new Set();

export function getBridgeUrl() {
  return (process.env.BRIDGE_URL || "http://35.255.130.255:8080").replace(/\/$/, "");
}

export function generateHash() {
  const bytes = randomBytes(HASH_LEN);
  let hash = "";
  for (let i = 0; i < HASH_LEN; i++) {
    hash += HASH_ALPHABET[bytes[i] % HASH_ALPHABET.length];
  }
  return hash;
}

export function generateOtp() {
  const digits = "0123456789";
  const bytes = randomBytes(6);
  let otp = "";
  for (let i = 0; i < 6; i++) {
    otp += digits[bytes[i] % 10];
  }
  return otp;
}

export function maskPhone(phone) {
  if (!phone) return "";
  const clean = String(phone).replace(/\D/g, "");
  if (clean.length <= 4) return String(phone);
  const start = clean.slice(0, 2);
  const end = clean.slice(-3);
  const maskedMiddle = "•".repeat(Math.max(clean.length - 5, 4));
  return `+${start} ${maskedMiddle} ${end}`;
}

export function maskApiKey(key) {
  if (!key) return "";
  const clean = String(key).trim();
  if (clean.length === 0) return "";
  if (clean.length <= 6) return clean.slice(0, 2) + "••••••";
  if (clean.length <= 12) return clean.slice(0, 3) + "••••••" + clean.slice(-2);
  const start = clean.slice(0, Math.min(6, Math.max(3, Math.floor(clean.length / 4))));
  const end = clean.slice(-4);
  return `${start}••••••••${end}`;
}

export function maskCalendarUrl(url) {
  if (!url) return "";
  const clean = String(url).trim();
  if (clean.length === 0) return "";
  try {
    const parsed = new URL(clean);
    const host = parsed.hostname;
    return `https://${host}/••••••••/basic.ics`;
  } catch {
    if (clean.length <= 15) return clean.slice(0, 4) + "••••••";
    return clean.slice(0, 10) + "••••••••" + clean.slice(-8);
  }
}

export async function createConnection(config = {}) {
  let hash = config.hash ? String(config.hash).trim().toUpperCase() : generateHash();
  if (kv && !config.hash) {
    try {
      while (await kv.exists(PREFIX + hash)) {
        hash = generateHash();
      }
    } catch {
      /* fallback */
    }
  }
  const conn = {
    status: "configuring",
    createdAt: Date.now(),
    ...config,
    hash,
  };
  
  globalThis.__connectionsFallback.set(hash, conn);

  if (kv) {
    try {
      await kv.hset(PREFIX + hash, { data: JSON.stringify(conn) });
      await kv.zadd(INDEX, { score: conn.createdAt, member: hash });
    } catch (err) {
      console.error("[kv createConnection error]", err);
    }
  }
  return conn;
}

export async function getConnection(hash) {
  if (!hash) return null;
  if (kv) {
    try {
      const raw = await kv.hget(PREFIX + hash, "data");
      if (raw) {
        return typeof raw === "string" ? JSON.parse(raw) : raw;
      }
    } catch (err) {
      console.error("[kv getConnection error]", err);
    }
  }
  return globalThis.__connectionsFallback.get(hash) || null;
}

export async function updateConnection(hash, patch) {
  const conn = (await getConnection(hash)) || { hash, createdAt: Date.now() };
  const next = { ...conn, ...patch };
  globalThis.__connectionsFallback.set(hash, next);

  if (kv) {
    try {
      await kv.hset(PREFIX + hash, { data: JSON.stringify(next) });
      await kv.zadd(INDEX, { score: next.createdAt || Date.now(), member: hash });
    } catch (err) {
      console.error("[kv updateConnection error]", err);
    }
  }
  return next;
}

export async function deleteConnection(hash) {
  globalThis.__connectionsFallback.delete(hash);
  if (!kv) return;
  try {
    await kv.del(PREFIX + hash);
    await kv.zrem(INDEX, hash);
  } catch (err) {
    console.error("[kv deleteConnection error]", err);
  }
}

export function getBridgeHeaders(extra = {}) {
  const headers = { ...extra };
  if (process.env.BRIDGE_AUTH_TOKEN) {
    headers["Authorization"] = `Bearer ${process.env.BRIDGE_AUTH_TOKEN}`;
  }
  return headers;
}

export async function sendConnectionOtp(hash, options = {}) {
  const cleanHash = String(hash || "").trim().toUpperCase();
  if (!cleanHash) {
    throw new Error("Connection code is required");
  }

  const conn = await getConnection(cleanHash);
  if (!conn) {
    throw new Error(`Connection not found for code ${cleanHash}`);
  }

  const ownerPhone = options.recipientOverride || conn.ownerPhone;
  if (!ownerPhone) {
    throw new Error("Owner phone number is not configured for this connection");
  }

  const cleanPhone = String(ownerPhone).replace(/\D/g, "");
  if (!cleanPhone) {
    throw new Error("Invalid owner phone number");
  }

  // Check if there is already an active, unexpired OTP issued less than 60 seconds ago with < 2 attempts
  let existingRecord = null;
  if (kv) {
    try {
      const raw = await kv.get(OTP_PREFIX + cleanHash);
      if (raw) {
        existingRecord = typeof raw === "string" ? JSON.parse(raw) : raw;
      }
    } catch {}
  }
  if (!existingRecord) {
    existingRecord = globalThis.__otpFallback.get(cleanHash);
  }

  const canReuse =
    existingRecord &&
    existingRecord.code &&
    !existingRecord.used &&
    Date.now() < existingRecord.expiresAt &&
    existingRecord.attempts < 2 &&
    Date.now() - (existingRecord.createdAt || 0) < 60000;

  const otp = canReuse ? existingRecord.code : generateOtp();
  const expiresAt = canReuse ? existingRecord.expiresAt : Date.now() + OTP_TTL_SECONDS * 1000;
  const otpRecord = canReuse
    ? existingRecord
    : {
        hash: cleanHash,
        code: otp,
        ownerPhone,
        attempts: 0,
        expiresAt,
        createdAt: Date.now(),
      };

  globalThis.__otpFallback.set(cleanHash, otpRecord);

  if (kv) {
    try {
      const remainingTtl = Math.max(1, Math.floor((expiresAt - Date.now()) / 1000));
      await kv.set(OTP_PREFIX + cleanHash, JSON.stringify(otpRecord), { ex: remainingTtl });
    } catch (err) {
      console.error("[kv sendConnectionOtp error]", err);
    }
  }

  const bridgeUrl = getBridgeUrl();
  const otpMessage =
    options.messageOverride ||
    `*WhatsApp AI Take-Over Verification Code*\n\nYour login verification code is: *${otp}*\n\nThis code is valid for 10 minutes.\nDo not share this code with anyone.`;

  let bridgeSent = false;
  let bridgeError = null;

  if (bridgeUrl) {
    try {
      let res = await fetch(`${bridgeUrl}/api/connections/${cleanHash}/send`, {
        method: "POST",
        headers: getBridgeHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ recipient: cleanPhone, message: otpMessage }),
        signal: AbortSignal.timeout(4000),
      });

      if (res.ok) {
        bridgeSent = true;
      } else {
        const tenantErrData = await res.json().catch(() => ({}));
        let tenantErrMsg = tenantErrData.error || `Bridge status ${res.status}`;

        // If tenant is temporarily disconnected, try a quick reconnect and retry
        if (tenantErrMsg.includes("not connected")) {
          try {
            await fetch(`${bridgeUrl}/api/connections/${cleanHash}/reconnect`, {
              method: "POST",
              headers: getBridgeHeaders({ "Content-Type": "application/json" }),
              signal: AbortSignal.timeout(2000),
            });
            await new Promise((resolve) => setTimeout(resolve, 400));
            const retryRes = await fetch(`${bridgeUrl}/api/connections/${cleanHash}/send`, {
              method: "POST",
              headers: getBridgeHeaders({ "Content-Type": "application/json" }),
              body: JSON.stringify({ recipient: cleanPhone, message: otpMessage }),
              signal: AbortSignal.timeout(3000),
            });
            if (retryRes.ok) {
              bridgeSent = true;
            }
          } catch {
            /* proceed to fallback */
          }
        }

        if (!bridgeSent) {
          try {
            const fallbackRes = await fetch(`${bridgeUrl}/api/send`, {
              method: "POST",
              headers: getBridgeHeaders({ "Content-Type": "application/json" }),
              body: JSON.stringify({ recipient: cleanPhone, message: otpMessage }),
              signal: AbortSignal.timeout(3000),
            });
            if (fallbackRes.ok) {
              bridgeSent = true;
            } else {
              const fallbackErr = await fallbackRes.json().catch(() => ({}));
              bridgeError = fallbackErr.error || tenantErrMsg;
            }
          } catch (fbErr) {
            bridgeError = fbErr.message || tenantErrMsg;
          }
        }
      }
    } catch (err) {
      bridgeError = err.message || "Failed to reach WhatsApp bridge";
    }
  }

  return {
    success: true,
    hash: cleanHash,
    maskedPhone: maskPhone(ownerPhone),
    expiresAt,
    bridgeSent,
    bridgeError,
    devOtp: process.env.NODE_ENV !== "production" ? otp : undefined,
  };
}

export async function verifyConnectionOtp(hash, inputOtp) {
  const cleanHash = String(hash || "").trim().toUpperCase();
  const cleanOtp = String(inputOtp || "").trim();

  if (!cleanHash || !cleanOtp) {
    return { valid: false, error: "Connection code and OTP are required" };
  }

  let otpRecord = null;
  if (kv) {
    try {
      const raw = await kv.get(OTP_PREFIX + cleanHash);
      if (raw) {
        otpRecord = typeof raw === "string" ? JSON.parse(raw) : raw;
      }
    } catch (err) {
      console.error("[kv verifyConnectionOtp get error]", err);
    }
  }
  if (!otpRecord) {
    otpRecord = globalThis.__otpFallback.get(cleanHash);
  }

  if (!otpRecord) {
    return { valid: false, error: "No active verification code found. Please request a new code." };
  }

  // Grace-period handling: If already successfully used within last 5 seconds and token is present, return the token gracefully
  if (otpRecord.used && otpRecord.usedAt && Date.now() - otpRecord.usedAt < 5000 && otpRecord.token) {
    return {
      valid: true,
      token: otpRecord.token,
      hash: cleanHash,
      expiresAt: otpRecord.sessionExpiresAt || Date.now() + SESSION_TTL_SECONDS * 1000,
    };
  }

  if (otpRecord.used) {
    return { valid: false, error: "Verification code has already been used. Please request a new code." };
  }

  if (Date.now() > otpRecord.expiresAt) {
    globalThis.__otpFallback.delete(cleanHash);
    if (kv) {
      try {
        await kv.del(OTP_PREFIX + cleanHash);
      } catch {}
    }
    return { valid: false, error: "Verification code has expired. Please request a new code." };
  }

  if (otpRecord.attempts >= 5) {
    globalThis.__otpFallback.delete(cleanHash);
    if (kv) {
      try {
        await kv.del(OTP_PREFIX + cleanHash);
      } catch {}
    }
    return { valid: false, error: "Too many incorrect attempts. Please request a new code." };
  }

  if (otpRecord.code !== cleanOtp) {
    otpRecord.attempts = (otpRecord.attempts || 0) + 1;
    globalThis.__otpFallback.set(cleanHash, otpRecord);
    if (kv) {
      try {
        const remainingTtl = Math.max(1, Math.floor((otpRecord.expiresAt - Date.now()) / 1000));
        await kv.set(OTP_PREFIX + cleanHash, JSON.stringify(otpRecord), { ex: remainingTtl });
      } catch {}
    }
    const remainingAttempts = 5 - otpRecord.attempts;
    return {
      valid: false,
      error: `Invalid verification code. ${remainingAttempts} attempt${remainingAttempts === 1 ? "" : "s"} remaining.`,
      remainingAttempts,
    };
  }

  // OTP matches! Issue session token
  const sessionToken = createJwt({ hash: cleanHash, type: "session" }, SESSION_TTL_SECONDS);
  const sessionExpiresAt = Date.now() + SESSION_TTL_SECONDS * 1000;
  const sessionRecord = {
    token: sessionToken,
    hash: cleanHash,
    createdAt: Date.now(),
    expiresAt: sessionExpiresAt,
  };

  // Mark OTP record as used with 5s grace period to tolerate immediate duplicate/parallel verification calls
  const graceOtpRecord = {
    ...otpRecord,
    used: true,
    usedAt: Date.now(),
    token: sessionToken,
    sessionExpiresAt,
  };

  globalThis.__otpFallback.set(cleanHash, graceOtpRecord);
  setTimeout(() => {
    const cur = globalThis.__otpFallback.get(cleanHash);
    if (cur && cur.used) {
      globalThis.__otpFallback.delete(cleanHash);
    }
  }, 5000);

  if (kv) {
    try {
      await kv.set(OTP_PREFIX + cleanHash, JSON.stringify(graceOtpRecord), { ex: 5 });
    } catch {}
  }

  globalThis.__sessionFallback.set(sessionToken, sessionRecord);
  if (kv) {
    try {
      await kv.set(SESSION_PREFIX + sessionToken, JSON.stringify(sessionRecord), { ex: SESSION_TTL_SECONDS });
    } catch (err) {
      console.error("[kv verifyConnectionOtp session set error]", err);
    }
  }

  return {
    valid: true,
    token: sessionToken,
    hash: cleanHash,
    expiresAt: sessionRecord.expiresAt,
  };
}

export async function verifySession(hash, token) {
  const cleanHash = String(hash || "").trim().toUpperCase();
  const cleanToken = String(token || "").trim();

  if (!cleanHash || !cleanToken) return false;

  // Check if token was explicitly revoked
  if (globalThis.__revokedTokensFallback.has(cleanToken)) {
    return false;
  }
  if (kv) {
    try {
      const isRevoked = await kv.get(REVOKED_PREFIX + cleanToken);
      if (isRevoked) return false;
    } catch {}
  }

  // 1. Try JWT verification first
  const jwtPayload = verifyJwt(cleanToken);
  if (jwtPayload) {
    const tokenHash = String(jwtPayload.hash || "").trim().toUpperCase();
    if (tokenHash === cleanHash) {
      return true;
    }
    return false;
  }

  // 2. Fallback to opaque KV / in-memory session (legacy tokens)
  let sessionRecord = null;
  if (kv) {
    try {
      const raw = await kv.get(SESSION_PREFIX + cleanToken);
      if (raw) {
        sessionRecord = typeof raw === "string" ? JSON.parse(raw) : raw;
      }
    } catch (err) {
      console.error("[kv verifySession error]", err);
    }
  }
  if (!sessionRecord) {
    sessionRecord = globalThis.__sessionFallback.get(cleanToken);
  }

  if (!sessionRecord) return false;
  if (String(sessionRecord.hash || "").trim().toUpperCase() !== cleanHash) return false;
  if (Date.now() > sessionRecord.expiresAt) {
    globalThis.__sessionFallback.delete(cleanToken);
    if (kv) {
      try {
        await kv.del(SESSION_PREFIX + cleanToken);
      } catch {}
    }
    return false;
  }

  return true;
}

export async function createSessionForConnection(hash) {
  const cleanHash = String(hash || "").trim().toUpperCase();
  if (!cleanHash) throw new Error("Hash is required");

  const sessionToken = createJwt({ hash: cleanHash, type: "session" }, SESSION_TTL_SECONDS);
  const sessionRecord = {
    token: sessionToken,
    hash: cleanHash,
    createdAt: Date.now(),
    expiresAt: Date.now() + SESSION_TTL_SECONDS * 1000,
  };

  globalThis.__sessionFallback.set(sessionToken, sessionRecord);
  if (kv) {
    try {
      await kv.set(SESSION_PREFIX + sessionToken, JSON.stringify(sessionRecord), { ex: SESSION_TTL_SECONDS });
    } catch (err) {
      console.error("[kv createSessionForConnection error]", err);
    }
  }

  return {
    valid: true,
    token: sessionToken,
    hash: cleanHash,
    expiresAt: sessionRecord.expiresAt,
  };
}

export async function revokeSession(token) {
  const cleanToken = String(token || "").trim();
  if (!cleanToken) return;

  globalThis.__revokedTokensFallback.add(cleanToken);
  globalThis.__sessionFallback.delete(cleanToken);

  if (kv) {
    try {
      await kv.set(REVOKED_PREFIX + cleanToken, "1", { ex: SESSION_TTL_SECONDS });
      await kv.del(SESSION_PREFIX + cleanToken);
    } catch (err) {
      console.error("[kv revokeSession error]", err);
    }
  }
}

export async function reconnectBridgeTenant(hash) {
  const cleanHash = String(hash || "").trim().toUpperCase();
  const bridgeUrl = getBridgeUrl();
  if (!bridgeUrl || !cleanHash) return { success: false, error: "invalid hash or bridge url" };

  try {
    const res = await fetch(`${bridgeUrl}/api/connections/${cleanHash}/reconnect`, {
      method: "POST",
      headers: getBridgeHeaders({ "Content-Type": "application/json" }),
      signal: AbortSignal.timeout(6000),
    });
    return await res.json();
  } catch (err) {
    return { success: false, error: err.message };
  }
}

export async function disconnectBridgeTenant(hash) {
  const cleanHash = String(hash || "").trim().toUpperCase();
  const bridgeUrl = getBridgeUrl();
  if (!bridgeUrl || !cleanHash) return { success: false, error: "invalid hash or bridge url" };

  try {
    const res = await fetch(`${bridgeUrl}/api/connections/${cleanHash}/disconnect`, {
      method: "POST",
      headers: getBridgeHeaders({ "Content-Type": "application/json" }),
      signal: AbortSignal.timeout(6000),
    });
    return await res.json();
  } catch (err) {
    return { success: false, error: err.message };
  }
}

export async function deleteBridgeTenant(hash) {
  const cleanHash = String(hash || "").trim().toUpperCase();
  const bridgeUrl = getBridgeUrl();
  if (!bridgeUrl || !cleanHash) return { success: false, error: "invalid hash or bridge url" };

  try {
    const res = await fetch(`${bridgeUrl}/api/connections/${cleanHash}`, {
      method: "DELETE",
      headers: getBridgeHeaders({ "Content-Type": "application/json" }),
      signal: AbortSignal.timeout(6000),
    });
    return await res.json();
  } catch (err) {
    return { success: false, error: err.message };
  }
}

export async function fetchBridgeHealth() {
  const bridgeUrl = getBridgeUrl();
  if (!bridgeUrl) return { status: "offline", error: "Bridge URL unconfigured" };

  try {
    const res = await fetch(`${bridgeUrl}/api/health`, {
      method: "GET",
      headers: getBridgeHeaders(),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return { status: "unhealthy", httpStatus: res.status };
    return await res.json();
  } catch (err) {
    return { status: "unreachable", error: err.message };
  }
}

