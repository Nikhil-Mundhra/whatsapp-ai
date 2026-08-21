import { createHmac, timingSafeEqual, randomBytes } from "crypto";

export const AUTH_COOKIE_NAME = "wa_auth_token";
export const HASH_COOKIE_NAME = "wa_hash";
export const SESSION_TTL_SECONDS = 30 * 24 * 3600; // 30 days

// Base64URL encoding / decoding helpers
export function base64UrlEncode(str) {
  return Buffer.from(str)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

export function base64UrlDecode(str) {
  let base64 = str.replace(/-/g, "+").replace(/_/g, "/");
  while (base64.length % 4 !== 0) {
    base64 += "=";
  }
  return Buffer.from(base64, "base64").toString("utf8");
}

// Deterministic secret fallback across serverless requests and cold starts
function getDeterministicFallbackSecret() {
  const seed =
    process.env.SUPERADMIN_SECRET ||
    process.env.SUPERADMIN_KEY ||
    process.env.SUPERADMIN_PASSWORD ||
    process.env.BRIDGE_AUTH_TOKEN ||
    "wa-ai-superadmin-jwt-fallback-salt-2026";
  return createHmac("sha256", "wa-jwt-secret-salt-2026").update(seed).digest("hex");
}

export function getJwtSecret() {
  return process.env.JWT_SECRET || globalThis.__jwtSecretFallback || getDeterministicFallbackSecret();
}

export function _setJwtSecretFallback(secret) {
  globalThis.__jwtSecretFallback = secret;
}

/**
 * Creates a signed JWT with HS256 algorithm.
 * @param {Object} payload - Custom claims to include in the payload
 * @param {number} expiresInSeconds - Expiration time in seconds from now (defaults to 30 days)
 * @returns {string} - Signed JWT token (header.payload.signature)
 */
export function createJwt(payload = {}, expiresInSeconds = SESSION_TTL_SECONDS) {
  const header = {
    alg: "HS256",
    typ: "JWT",
  };

  const nowSeconds = Math.floor(Date.now() / 1000);
  const fullPayload = {
    ...payload,
    iat: payload.iat !== undefined ? payload.iat : nowSeconds,
    exp: payload.exp !== undefined ? payload.exp : nowSeconds + expiresInSeconds,
  };

  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(fullPayload));
  const data = `${encodedHeader}.${encodedPayload}`;

  const secret = getJwtSecret();
  const signature = createHmac("sha256", secret).update(data).digest("base64url");

  return `${data}.${signature}`;
}

/**
 * Verifies a JWT token.
 * @param {string} token - The signed JWT token string
 * @returns {Object|null} - Decoded payload if valid and non-expired, otherwise null
 */
export function verifyJwt(token) {
  if (!token || typeof token !== "string") return null;

  const parts = token.split(".");
  if (parts.length !== 3) return null;

  const [encodedHeader, encodedPayload, signature] = parts;
  if (!encodedHeader || !encodedPayload || !signature) return null;

  try {
    const data = `${encodedHeader}.${encodedPayload}`;
    const secret = getJwtSecret();
    const expectedSignature = createHmac("sha256", secret).update(data).digest("base64url");

    const sigBuf = Buffer.from(signature);
    const expBuf = Buffer.from(expectedSignature);

    if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
      return null;
    }

    const payload = JSON.parse(base64UrlDecode(encodedPayload));
    const nowSeconds = Math.floor(Date.now() / 1000);

    if (payload.exp && payload.exp < nowSeconds) {
      return null; // Expired
    }

    return payload;
  } catch {
    return null;
  }
}

/**
 * Decodes payload from JWT without verifying signature (useful for inspection).
 * @param {string} token - The JWT token string
 * @returns {Object|null} - Decoded payload or null
 */
export function decodeJwt(token) {
  if (!token || typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    return JSON.parse(base64UrlDecode(parts[1]));
  } catch {
    return null;
  }
}

/**
 * Helper to get cookie options for auth tokens.
 */
export function getAuthCookieOptions(expiresInSeconds = SESSION_TTL_SECONDS) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: expiresInSeconds,
  };
}

/**
 * Sets auth and hash cookies on a NextResponse.
 */
export function setAuthCookies(response, token, hash, expiresInSeconds = SESSION_TTL_SECONDS) {
  if (!response || !response.cookies) return response;

  if (token) {
    response.cookies.set(AUTH_COOKIE_NAME, token, getAuthCookieOptions(expiresInSeconds));
  }

  if (hash) {
    response.cookies.set(HASH_COOKIE_NAME, hash.toUpperCase(), {
      httpOnly: false, // accessible to client script if needed
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: expiresInSeconds,
    });
  }

  return response;
}

/**
 * Clears auth and hash cookies on a NextResponse.
 */
export function clearAuthCookies(response) {
  if (!response || !response.cookies) return response;
  response.cookies.set(AUTH_COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  response.cookies.set(HASH_COOKIE_NAME, "", {
    httpOnly: false,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return response;
}

/**
 * Extracts auth token from a Request object (cookie, Authorization header, or search params).
 */
export function extractAuthToken(req) {
  if (!req) return null;

  // 1. From NextRequest.cookies (if available)
  if (req.cookies && typeof req.cookies.get === "function") {
    const cookie = req.cookies.get(AUTH_COOKIE_NAME);
    if (cookie?.value) return cookie.value;
  }

  // 2. From standard Cookie header
  const cookieHeader = req.headers?.get?.("cookie") || "";
  if (cookieHeader) {
    const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${AUTH_COOKIE_NAME}=([^;]+)`));
    if (match && match[1]) {
      return decodeURIComponent(match[1]);
    }
  }

  // 3. From Authorization: Bearer <token>
  const authHeader = req.headers?.get?.("authorization") || "";
  if (authHeader.toLowerCase().startsWith("bearer ")) {
    return authHeader.slice(7).trim();
  }

  return null;
}

/**
 * Extracts hash from a Request object (cookie or search params).
 */
export function extractHash(req) {
  if (!req) return null;

  if (req.cookies && typeof req.cookies.get === "function") {
    const cookie = req.cookies.get(HASH_COOKIE_NAME);
    if (cookie?.value) return cookie.value.toUpperCase();
  }

  const cookieHeader = req.headers?.get?.("cookie") || "";
  if (cookieHeader) {
    const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${HASH_COOKIE_NAME}=([^;]+)`));
    if (match && match[1]) {
      return decodeURIComponent(match[1]).toUpperCase();
    }
  }

  return null;
}
