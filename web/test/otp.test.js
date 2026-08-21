import test from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server.js";

import {
  generateOtp,
  maskPhone,
  createConnection,
  getConnection,
  sendConnectionOtp,
  verifyConnectionOtp,
  verifySession,
  createSessionForConnection,
  revokeSession,
} from "../lib/connections.js";
import { _setKv } from "../lib/polls.js";

// Import API routes
import { POST as hashOtpSendPOST } from "../app/api/connections/[hash]/otp/send/route.js";
import { POST as hashOtpVerifyPOST } from "../app/api/connections/[hash]/otp/verify/route.js";
import { POST as authOtpSendPOST } from "../app/api/auth/otp/send/route.js";
import { POST as authOtpVerifyPOST } from "../app/api/auth/otp/verify/route.js";
import { POST as sessionVerifyPOST, GET as sessionVerifyGET } from "../app/api/auth/session/verify/route.js";
import { POST as logoutPOST } from "../app/api/auth/logout/route.js";
import { AUTH_COOKIE_NAME, HASH_COOKIE_NAME } from "../lib/jwt.js";

function mockFetch(handler) {
  const original = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    return handler(url, options);
  };
  return () => {
    globalThis.fetch = original;
  };
}

test("OTP & Session Authentication Unit Tests", async (t) => {
  t.afterEach(() => {
    _setKv(null);
    globalThis.__connectionsFallback.clear();
    globalThis.__otpFallback.clear();
    globalThis.__sessionFallback.clear();
    delete process.env.BRIDGE_URL;
    delete process.env.BRIDGE_AUTH_TOKEN;
  });

  // ==========================================
  // 1. generateOtp & maskPhone
  // ==========================================
  await t.test("generateOtp produces 6-digit numeric string", () => {
    for (let i = 0; i < 20; i++) {
      const otp = generateOtp();
      assert.equal(typeof otp, "string");
      assert.equal(otp.length, 6);
      assert.match(otp, /^\d{6}$/);
    }
  });

  await t.test("maskPhone formats phone numbers correctly", () => {
    assert.equal(maskPhone(""), "");
    assert.equal(maskPhone("123"), "123");
    assert.equal(maskPhone("+917060410033"), "+91 ••••••• 033");
    assert.equal(maskPhone("14155550199"), "+14 •••••• 199");
    assert.equal(maskPhone("12345"), "+12 •••• 345");
  });

  // ==========================================
  // 2. sendConnectionOtp
  // ==========================================
  await t.test("sendConnectionOtp input validations", async (st) => {
    await st.test("throws error when hash is empty", async () => {
      await assert.rejects(async () => sendConnectionOtp(""), {
        message: "Connection code is required",
      });
    });

    await st.test("throws error when connection not found", async () => {
      await assert.rejects(async () => sendConnectionOtp("NOTFND"), {
        message: "Connection not found for code NOTFND",
      });
    });

    await st.test("throws error when ownerPhone is missing", async () => {
      await createConnection({ hash: "NOPHNE", ownerPhone: "" });
      await assert.rejects(async () => sendConnectionOtp("NOPHNE"), {
        message: "Owner phone number is not configured for this connection",
      });
    });
  });

  await t.test("sendConnectionOtp generates OTP and dispatches WhatsApp bridge message", async () => {
    process.env.BRIDGE_URL = "http://mockbridge:8080";
    await createConnection({ hash: "TEST01", ownerPhone: "+917060410033" });

    let sentRecipient = null;
    let sentMessage = null;

    const restore = mockFetch(async (url, opts) => {
      if (url.includes("/api/connections/TEST01/send")) {
        const body = JSON.parse(opts.body);
        sentRecipient = body.recipient;
        sentMessage = body.message;
        return { ok: true, json: async () => ({ success: true }) };
      }
      return { ok: false };
    });

    const result = await sendConnectionOtp("TEST01");
    restore();

    assert.equal(result.success, true);
    assert.equal(result.hash, "TEST01");
    assert.equal(result.maskedPhone, "+91 ••••••• 033");
    assert.ok(result.expiresAt > Date.now());
    assert.equal(result.bridgeSent, true);
    assert.equal(sentRecipient, "917060410033");
    assert.match(sentMessage, /verification code is/);
  });

  await t.test("sendConnectionOtp falls back to /api/send when /api/connections/:hash/send fails", async () => {
    process.env.BRIDGE_URL = "http://mockbridge:8080";
    await createConnection({ hash: "TEST02", ownerPhone: "+14155550199" });

    let fallbackCalled = false;
    const restore = mockFetch(async (url) => {
      if (url.includes("/api/connections/TEST02/send")) {
        return { ok: false, status: 404, json: async () => ({}) };
      }
      if (url.includes("/api/send")) {
        fallbackCalled = true;
        return { ok: true, json: async () => ({ success: true }) };
      }
      return { ok: false, json: async () => ({}) };
    });

    const result = await sendConnectionOtp("TEST02");
    restore();

    assert.equal(result.success, true);
    assert.equal(fallbackCalled, true);
    assert.equal(result.bridgeSent, true);
  });

  await t.test("sendConnectionOtp handles bridge failure gracefully and persists in KV", async () => {
    process.env.BRIDGE_URL = "http://mockbridge:8080";
    const kvStore = new Map();

    _setKv({
      hget: async () => null,
      set: async (key, val) => {
        kvStore.set(key, val);
      },
    });

    await createConnection({ hash: "TEST03", ownerPhone: "+1234567890" });

    const restore = mockFetch(async () => {
      throw new Error("Bridge connection refused");
    });

    const result = await sendConnectionOtp("TEST03");
    restore();

    assert.equal(result.success, true);
    assert.equal(result.bridgeSent, false);
    assert.equal(result.bridgeError, "Bridge connection refused");
    assert.ok(kvStore.has("otp:TEST03"));
  });

  await t.test("sendConnectionOtp reuses active OTP code when called within 60 seconds", async () => {
    process.env.BRIDGE_URL = "http://mockbridge:8080";
    await createConnection({ hash: "REUSE1", ownerPhone: "+917060410033" });

    let sentCount = 0;
    const restore = mockFetch(async () => {
      sentCount++;
      return { ok: true, json: async () => ({ success: true }) };
    });

    const res1 = await sendConnectionOtp("REUSE1");
    const firstOtp = res1.devOtp;

    // Resend immediately (within 60 seconds)
    const res2 = await sendConnectionOtp("REUSE1");
    const secondOtp = res2.devOtp;
    restore();

    assert.equal(firstOtp, secondOtp);
    assert.equal(sentCount, 2);
  });

  // ==========================================
  // 3. verifyConnectionOtp
  // ==========================================
  await t.test("verifyConnectionOtp validations and scenarios", async (st) => {
    await st.test("returns error for empty hash or otp", async () => {
      const res1 = await verifyConnectionOtp("", "123456");
      assert.equal(res1.valid, false);

      const res2 = await verifyConnectionOtp("TEST", "");
      assert.equal(res2.valid, false);
    });

    await st.test("returns error when no active OTP exists", async () => {
      const res = await verifyConnectionOtp("NOOTP", "123456");
      assert.equal(res.valid, false);
      assert.match(res.error, /No active verification code/);
    });

    await st.test("returns error and removes record when OTP is expired", async () => {
      globalThis.__otpFallback.set("EXP01", {
        hash: "EXP01",
        code: "123456",
        expiresAt: Date.now() - 1000, // expired
        attempts: 0,
      });

      const res = await verifyConnectionOtp("EXP01", "123456");
      assert.equal(res.valid, false);
      assert.match(res.error, /expired/);
      assert.equal(globalThis.__otpFallback.has("EXP01"), false);
    });

    await st.test("returns error and locks out after 5 failed attempts", async () => {
      globalThis.__otpFallback.set("MAXATT", {
        hash: "MAXATT",
        code: "654321",
        expiresAt: Date.now() + 60000,
        attempts: 5,
      });

      const res = await verifyConnectionOtp("MAXATT", "654321");
      assert.equal(res.valid, false);
      assert.match(res.error, /Too many incorrect attempts/);
      assert.equal(globalThis.__otpFallback.has("MAXATT"), false);
    });

    await st.test("increments attempt count on wrong OTP", async () => {
      globalThis.__otpFallback.set("WRONG1", {
        hash: "WRONG1",
        code: "999999",
        expiresAt: Date.now() + 60000,
        attempts: 0,
      });

      const res = await verifyConnectionOtp("WRONG1", "111111");
      assert.equal(res.valid, false);
      assert.equal(res.remainingAttempts, 4);
      assert.match(res.error, /4 attempts remaining/);

      const record = globalThis.__otpFallback.get("WRONG1");
      assert.equal(record.attempts, 1);
    });

    await st.test("verifies valid OTP from KV, creates session, and cleans up OTP", async () => {
      const kvStore = new Map();
      _setKv({
        get: async (key) => kvStore.get(key) || null,
        set: async (key, val) => {
          kvStore.set(key, val);
        },
        del: async (key) => {
          kvStore.delete(key);
        },
      });

      const otpRecord = {
        hash: "VALID1",
        code: "482019",
        expiresAt: Date.now() + 60000,
        attempts: 0,
      };
      kvStore.set("otp:VALID1", JSON.stringify(otpRecord));

      const res = await verifyConnectionOtp("VALID1", "482019");
      assert.equal(res.valid, true);
      assert.ok(res.token);
      assert.equal(res.hash, "VALID1");

      // Verify OTP is marked used in KV for grace period
      const storedOtp = JSON.parse(kvStore.get("otp:VALID1"));
      assert.equal(storedOtp.used, true);

      // Verify duplicate verify call within grace period succeeds gracefully
      const dupRes = await verifyConnectionOtp("VALID1", "482019");
      assert.equal(dupRes.valid, true);
      assert.equal(dupRes.token, res.token);

      // Verify session is stored in KV
      assert.ok(kvStore.has(`session:${res.token}`));

      // Verify session can be verified
      const isSessionValid = await verifySession("VALID1", res.token);
      assert.equal(isSessionValid, true);
    });
  });

  // ==========================================
  // 4. verifySession, createSession, revokeSession
  // ==========================================
  await t.test("session management tests", async (st) => {
    await st.test("verifySession returns false for missing or invalid parameters", async () => {
      assert.equal(await verifySession("", "token"), false);
      assert.equal(await verifySession("HASH", ""), false);
      assert.equal(await verifySession("HASH", "non-existent-token"), false);
    });

    await st.test("verifySession returns false for mismatched hash", async () => {
      const session = await createSessionForConnection("HASH_A");
      assert.equal(await verifySession("HASH_B", session.token), false);
    });

    await st.test("verifySession returns false for expired session", async () => {
      globalThis.__sessionFallback.set("exp-token", {
        token: "exp-token",
        hash: "HASH_EXP",
        expiresAt: Date.now() - 1000,
      });

      assert.equal(await verifySession("HASH_EXP", "exp-token"), false);
      assert.equal(globalThis.__sessionFallback.has("exp-token"), false);
    });

    await st.test("revokeSession removes session", async () => {
      const session = await createSessionForConnection("REVOKE_ME");
      assert.equal(await verifySession("REVOKE_ME", session.token), true);

      await revokeSession(session.token);
      assert.equal(await verifySession("REVOKE_ME", session.token), false);
    });
  });

  // ==========================================
  // 5. API Route Endpoints
  // ==========================================
  await t.test("API route endpoints for OTP & Auth", async (st) => {
    // 1. POST /api/connections/[hash]/otp/send
    await st.test("POST /api/connections/[hash]/otp/send sends OTP", async () => {
      await createConnection({ hash: "API001", ownerPhone: "+917060410033" });
      const res = await hashOtpSendPOST(new NextRequest("http://localhost"), {
        params: Promise.resolve({ hash: "API001" }),
      });
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.success, true);
      assert.equal(data.hash, "API001");
      assert.ok(data.maskedPhone);
    });

    await st.test("POST /api/connections/[hash]/otp/send handles missing or invalid hash", async () => {
      const res1 = await hashOtpSendPOST(new NextRequest("http://localhost"), {
        params: Promise.resolve({ hash: "" }),
      });
      assert.equal(res1.status, 400);

      const res2 = await hashOtpSendPOST(new NextRequest("http://localhost"), {
        params: Promise.resolve({ hash: "UNKNOWN" }),
      });
      assert.equal(res2.status, 404);
    });

    // 2. POST /api/connections/[hash]/otp/verify
    await st.test("POST /api/connections/[hash]/otp/verify verifies OTP", async () => {
      await createConnection({ hash: "API001", ownerPhone: "+917060410033" });
      // Seed OTP
      globalThis.__otpFallback.set("API001", {
        hash: "API001",
        code: "778899",
        expiresAt: Date.now() + 60000,
        attempts: 0,
      });

      // Missing OTP in body
      const reqEmpty = new NextRequest("http://localhost", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      });
      const resEmpty = await hashOtpVerifyPOST(reqEmpty, { params: Promise.resolve({ hash: "API001" }) });
      assert.equal(resEmpty.status, 400);

      // Wrong OTP
      const reqWrong = new NextRequest("http://localhost", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ otp: "000000" }),
      });
      const resWrong = await hashOtpVerifyPOST(reqWrong, { params: Promise.resolve({ hash: "API001" }) });
      assert.equal(resWrong.status, 401);

      // Correct OTP
      const reqValid = new NextRequest("http://localhost", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ otp: "778899" }),
      });
      const resValid = await hashOtpVerifyPOST(reqValid, { params: Promise.resolve({ hash: "API001" }) });
      assert.equal(resValid.status, 200);
      const dataValid = await resValid.json();
      assert.equal(dataValid.valid, true);
      assert.ok(dataValid.token);
    });

    // 3. POST /api/auth/otp/send and /api/auth/otp/verify
    await st.test("POST /api/auth/otp/send and /api/auth/otp/verify", async () => {
      await createConnection({ hash: "API001", ownerPhone: "+917060410033" });

      // Auth send missing hash or invalid body
      const resSendErr1 = await authOtpSendPOST(
        new NextRequest("http://localhost", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({}),
        })
      );
      assert.equal(resSendErr1.status, 400);

      const resSendErr2 = await authOtpSendPOST(
        new NextRequest("http://localhost", {
          method: "POST",
          body: "invalid-json",
        })
      );
      assert.equal(resSendErr2.status, 400);

      // Auth send valid
      const resSend = await authOtpSendPOST(
        new NextRequest("http://localhost", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ hash: "API001" }),
        })
      );
      assert.equal(resSend.status, 200);
      const sendData = await resSend.json();
      assert.equal(sendData.success, true);

      // Auth verify missing body / missing fields
      const resVerifyErr1 = await authOtpVerifyPOST(
        new NextRequest("http://localhost", {
          method: "POST",
          body: "invalid-json",
        })
      );
      assert.equal(resVerifyErr1.status, 400);

      const resVerifyErr2 = await authOtpVerifyPOST(
        new NextRequest("http://localhost", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ hash: "API001" }), // missing otp
        })
      );
      assert.equal(resVerifyErr2.status, 400);

      // Auth verify wrong OTP
      const resVerifyWrong = await authOtpVerifyPOST(
        new NextRequest("http://localhost", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ hash: "API001", otp: "000000" }),
        })
      );
      assert.equal(resVerifyWrong.status, 401);

      // Auth verify valid OTP
      const otpRecord = globalThis.__otpFallback.get("API001");
      assert.ok(otpRecord);

      const resVerify = await authOtpVerifyPOST(
        new NextRequest("http://localhost", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ hash: "API001", otp: otpRecord.code }),
        })
      );
      assert.equal(resVerify.status, 200);
      const verifyData = await resVerify.json();
      assert.equal(verifyData.valid, true);
      assert.ok(verifyData.token);
      assert.ok(resVerify.cookies.get(AUTH_COOKIE_NAME));
      assert.equal(resVerify.cookies.get(AUTH_COOKIE_NAME).value, verifyData.token);
      assert.equal(resVerify.cookies.get(HASH_COOKIE_NAME).value, "API001");
    });

    // 4. POST & GET /api/auth/session/verify and /api/auth/logout
    await st.test("POST & GET /api/auth/session/verify and /api/auth/logout with cookies & tokens", async () => {
      await createConnection({ hash: "API001", ownerPhone: "+917060410033" });
      const session = await createSessionForConnection("API001");

      // Verify session error with missing body and no cookies
      const resVerifyErr = await sessionVerifyPOST(
        new NextRequest("http://localhost", {
          method: "POST",
          body: "invalid-json",
        })
      );
      assert.equal(resVerifyErr.status, 400);

      // Verify session route via POST body
      const resVerify = await sessionVerifyPOST(
        new NextRequest("http://localhost", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ hash: "API001", token: session.token }),
        })
      );
      assert.equal(resVerify.status, 200);
      const verifyData = await resVerify.json();
      assert.equal(verifyData.valid, true);
      assert.equal(verifyData.hash, "API001");

      // Verify session route via Cookie (GET request without body)
      const resVerifyCookie = await sessionVerifyGET(
        new NextRequest("http://localhost", {
          method: "GET",
          headers: {
            cookie: `${AUTH_COOKIE_NAME}=${session.token}`,
          },
        })
      );
      assert.equal(resVerifyCookie.status, 200);
      const verifyCookieData = await resVerifyCookie.json();
      assert.equal(verifyCookieData.valid, true);
      assert.equal(verifyCookieData.hash, "API001");

      // Verify session route via Authorization: Bearer header
      const resVerifyBearer = await sessionVerifyGET(
        new NextRequest("http://localhost", {
          method: "GET",
          headers: {
            authorization: `Bearer ${session.token}`,
          },
        })
      );
      assert.equal(resVerifyBearer.status, 200);
      const verifyBearerData = await resVerifyBearer.json();
      assert.equal(verifyBearerData.valid, true);
      assert.equal(verifyBearerData.hash, "API001");

      // Logout route with empty / no token
      const resLogoutEmpty = await logoutPOST(
        new NextRequest("http://localhost", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({}),
        })
      );
      assert.equal(resLogoutEmpty.status, 200);
      assert.equal(resLogoutEmpty.cookies.get(AUTH_COOKIE_NAME).maxAge, 0);

      // Logout route with token from cookie
      const resLogoutCookie = await logoutPOST(
        new NextRequest("http://localhost", {
          method: "POST",
          headers: {
            cookie: `${AUTH_COOKIE_NAME}=${session.token}`,
          },
        })
      );
      assert.equal(resLogoutCookie.status, 200);
      assert.equal(resLogoutCookie.cookies.get(AUTH_COOKIE_NAME).maxAge, 0);

      // Verify session after logout is now rejected (revoked)
      const resVerifyAfter = await sessionVerifyPOST(
        new NextRequest("http://localhost", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ hash: "API001", token: session.token }),
        })
      );
      assert.equal(resVerifyAfter.status, 401);
    });

    // 5. POST /api/connections/[hash]/otp/verify with missing hash
    await st.test("POST /api/connections/[hash]/otp/verify with missing hash", async () => {
      const res = await hashOtpVerifyPOST(
        new NextRequest("http://localhost", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ otp: "123456" }),
        }),
        { params: Promise.resolve({ hash: "" }) }
      );
      assert.equal(res.status, 400);
    });
  });
});
