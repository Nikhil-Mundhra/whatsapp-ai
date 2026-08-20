import { randomBytes } from "crypto";
import { kv } from "./polls.js";

const PREFIX = "conn:";
const INDEX = "connections";
const OTP_PREFIX = "otp:";
const SESSION_PREFIX = "session:";
const OTP_TTL_SECONDS = 600; // 10 minutes
const SESSION_TTL_SECONDS = 30 * 24 * 3600; // 30 days

const HASH_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const HASH_LEN = 6;

// In-memory fallback in case KV is unconfigured
globalThis.__connectionsFallback = globalThis.__connectionsFallback || new Map();
globalThis.__otpFallback = globalThis.__otpFallback || new Map();
globalThis.__sessionFallback = globalThis.__sessionFallback || new Map();

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

  const otp = generateOtp();
  const expiresAt = Date.now() + OTP_TTL_SECONDS * 1000;
  const otpRecord = {
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
      await kv.set(OTP_PREFIX + cleanHash, JSON.stringify(otpRecord), { ex: OTP_TTL_SECONDS });
    } catch (err) {
      console.error("[kv sendConnectionOtp error]", err);
    }
  }

  const bridgeUrl = (process.env.BRIDGE_URL || "http://35.255.130.255:8080").replace(/\/$/, "");
  const otpMessage =
    options.messageOverride ||
    `🔐 *WhatsApp AI Take-Over Verification Code*\n\nYour login verification code is: *${otp}*\n\n⏱ This code is valid for 10 minutes.\nDo not share this code with anyone.`;

  let bridgeSent = false;
  let bridgeError = null;

  if (bridgeUrl) {
    try {
      const res = await fetch(`${bridgeUrl}/api/connections/${cleanHash}/send`, {
        method: "POST",
        headers: getBridgeHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ recipient: cleanPhone, message: otpMessage }),
        signal: AbortSignal.timeout(8000),
      });
      if (res.ok) {
        bridgeSent = true;
      } else {
        const tenantErrData = await res.json().catch(() => ({}));
        const tenantErrMsg = tenantErrData.error || `Bridge status ${res.status}`;

        try {
          const fallbackRes = await fetch(`${bridgeUrl}/api/send`, {
            method: "POST",
            headers: getBridgeHeaders({ "Content-Type": "application/json" }),
            body: JSON.stringify({ recipient: cleanPhone, message: otpMessage }),
            signal: AbortSignal.timeout(8000),
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

  // OTP matches! Clear the OTP record
  globalThis.__otpFallback.delete(cleanHash);
  if (kv) {
    try {
      await kv.del(OTP_PREFIX + cleanHash);
    } catch {}
  }

  const sessionToken = randomBytes(32).toString("hex");
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
  if (sessionRecord.hash !== cleanHash) return false;
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

  const sessionToken = randomBytes(32).toString("hex");
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
    token: sessionToken,
    hash: cleanHash,
    expiresAt: sessionRecord.expiresAt,
  };
}

export async function revokeSession(token) {
  const cleanToken = String(token || "").trim();
  if (!cleanToken) return;
  globalThis.__sessionFallback.delete(cleanToken);
  if (kv) {
    try {
      await kv.del(SESSION_PREFIX + cleanToken);
    } catch (err) {
      console.error("[kv revokeSession error]", err);
    }
  }
}
