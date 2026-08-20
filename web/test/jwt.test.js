import test from "node:test";
import assert from "node:assert/strict";
import {
  createJwt,
  verifyJwt,
  decodeJwt,
  base64UrlEncode,
  base64UrlDecode,
  getJwtSecret,
  _setJwtSecretFallback,
  setAuthCookies,
  clearAuthCookies,
  extractAuthToken,
  extractHash,
  AUTH_COOKIE_NAME,
  HASH_COOKIE_NAME,
} from "../lib/jwt.js";
import { NextResponse } from "next/server.js";

test("JWT Utility Unit Tests", async (t) => {
  const originalSecret = process.env.JWT_SECRET;

  t.afterEach(() => {
    if (originalSecret !== undefined) {
      process.env.JWT_SECRET = originalSecret;
    } else {
      delete process.env.JWT_SECRET;
    }
  });

  await t.test("base64UrlEncode and base64UrlDecode handle roundtrips correctly", () => {
    const samples = ["hello world", "foo:bar@baz/123+456", JSON.stringify({ a: 1, b: "test" })];
    for (const sample of samples) {
      const encoded = base64UrlEncode(sample);
      assert.ok(!encoded.includes("="));
      assert.ok(!encoded.includes("+"));
      assert.ok(!encoded.includes("/"));
      const decoded = base64UrlDecode(encoded);
      assert.equal(decoded, sample);
    }
  });

  await t.test("createJwt generates valid 3-part JWT tokens with correct headers and payload", () => {
    const token = createJwt({ hash: "TEST01", role: "owner" }, 3600);
    assert.equal(typeof token, "string");
    const parts = token.split(".");
    assert.equal(parts.length, 3);

    const header = JSON.parse(base64UrlDecode(parts[0]));
    assert.equal(header.alg, "HS256");
    assert.equal(header.typ, "JWT");

    const payload = JSON.parse(base64UrlDecode(parts[1]));
    assert.equal(payload.hash, "TEST01");
    assert.equal(payload.role, "owner");
    assert.ok(payload.iat);
    assert.ok(payload.exp);
    assert.equal(payload.exp - payload.iat, 3600);
  });

  await t.test("verifyJwt successfully verifies authentic tokens", () => {
    const token = createJwt({ hash: "VERIFY1", data: "xyz" }, 300);
    const decoded = verifyJwt(token);
    assert.ok(decoded);
    assert.equal(decoded.hash, "VERIFY1");
    assert.equal(decoded.data, "xyz");
  });

  await t.test("verifyJwt returns null for tampered payload", () => {
    const token = createJwt({ hash: "ORIGINAL" }, 300);
    const parts = token.split(".");
    const tamperedPayload = base64UrlEncode(JSON.stringify({ hash: "TAMPERED", exp: Date.now() + 1000 }));
    const tamperedToken = `${parts[0]}.${tamperedPayload}.${parts[2]}`;

    assert.equal(verifyJwt(tamperedToken), null);
  });

  await t.test("verifyJwt returns null for wrong signing secret", () => {
    process.env.JWT_SECRET = "secret-1";
    _setJwtSecretFallback("secret-1");
    const token = createJwt({ hash: "SECRET_TEST" }, 300);

    process.env.JWT_SECRET = "different-secret-2";
    _setJwtSecretFallback("different-secret-2");
    assert.equal(verifyJwt(token), null);
  });

  await t.test("verifyJwt returns null for expired tokens", () => {
    // expired 10 seconds ago
    const token = createJwt({ hash: "EXPIRED", exp: Math.floor(Date.now() / 1000) - 10 });
    assert.equal(verifyJwt(token), null);
  });

  await t.test("verifyJwt returns null for malformed or null inputs", () => {
    assert.equal(verifyJwt(""), null);
    assert.equal(verifyJwt(null), null);
    assert.equal(verifyJwt("singlepart"), null);
    assert.equal(verifyJwt("two.parts"), null);
    assert.equal(verifyJwt("four.parts.here.extra"), null);
    assert.equal(verifyJwt("invalid.base64!.signature"), null);
  });

  await t.test("decodeJwt extracts payload without verifying signature", () => {
    const token = createJwt({ hash: "DECODE_ME" }, 100);
    const decoded = decodeJwt(token);
    assert.equal(decoded.hash, "DECODE_ME");
    assert.equal(decodeJwt("invalid"), null);
    assert.equal(decodeJwt(null), null);
  });

  await t.test("setAuthCookies and clearAuthCookies manipulate NextResponse cookies correctly", () => {
    const res = NextResponse.json({ ok: true });
    setAuthCookies(res, "mock-jwt-token", "K9X2P4");

    const authCookie = res.cookies.get(AUTH_COOKIE_NAME);
    const hashCookie = res.cookies.get(HASH_COOKIE_NAME);

    assert.ok(authCookie);
    assert.equal(authCookie.value, "mock-jwt-token");
    assert.equal(authCookie.httpOnly, true);
    assert.equal(authCookie.sameSite, "lax");

    assert.ok(hashCookie);
    assert.equal(hashCookie.value, "K9X2P4");
    assert.equal(hashCookie.httpOnly, false);

    clearAuthCookies(res);
    const clearedAuth = res.cookies.get(AUTH_COOKIE_NAME);
    const clearedHash = res.cookies.get(HASH_COOKIE_NAME);
    assert.equal(clearedAuth.maxAge, 0);
    assert.equal(clearedHash.maxAge, 0);
  });

  await t.test("extractAuthToken and extractHash parse from cookies and headers", () => {
    // 1. From NextRequest-like cookie object
    const reqWithCookies = {
      cookies: {
        get: (name) => {
          if (name === AUTH_COOKIE_NAME) return { value: "cookie-jwt-val" };
          if (name === HASH_COOKIE_NAME) return { value: "hsh123" };
          return null;
        },
      },
    };
    assert.equal(extractAuthToken(reqWithCookies), "cookie-jwt-val");
    assert.equal(extractHash(reqWithCookies), "HSH123");

    // 2. From Cookie header string
    const reqWithCookieHeader = {
      headers: {
        get: (name) => {
          if (name === "cookie") return `wa_auth_token=header-jwt-val; wa_hash=HSH999`;
          return null;
        },
      },
    };
    assert.equal(extractAuthToken(reqWithCookieHeader), "header-jwt-val");
    assert.equal(extractHash(reqWithCookieHeader), "HSH999");

    // 3. From Authorization: Bearer
    const reqWithBearer = {
      headers: {
        get: (name) => {
          if (name === "authorization") return `Bearer bearer-jwt-val`;
          return null;
        },
      },
    };
    assert.equal(extractAuthToken(reqWithBearer), "bearer-jwt-val");

    // 4. Null cases
    assert.equal(extractAuthToken(null), null);
    assert.equal(extractAuthToken({}), null);
    assert.equal(extractHash(null), null);
    assert.equal(extractHash({}), null);
  });
});
