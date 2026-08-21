import test from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server.js";

import { POST as superadminLoginPOST } from "../app/api/superadmin/auth/login/route.js";
import { POST as superadminOtpPOST } from "../app/api/superadmin/auth/otp/route.js";
import { GET as superadminVerifyGET, POST as superadminVerifyPOST } from "../app/api/superadmin/auth/verify/route.js";
import { POST as superadminLogoutPOST } from "../app/api/superadmin/auth/logout/route.js";
import { GET as superadminUsersGET } from "../app/api/superadmin/users/route.js";
import {
  GET as superadminUserDetailGET,
  POST as superadminUserActionPOST,
  DELETE as superadminUserDELETE,
} from "../app/api/superadmin/users/[hash]/route.js";

import {
  createSuperadminSessionToken,
  SUPERADMIN_COOKIE_NAME,
  resetRateLimit,
} from "../lib/superadmin.js";
import { createConnection } from "../lib/connections.js";

function mockFetch(handler) {
  const original = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    return handler(url, options);
  };
  return () => {
    globalThis.fetch = original;
  };
}

test("Superadmin API Routes Unit Tests", async (t) => {
  const origSecret = process.env.SUPERADMIN_SECRET;
  const origPhone = process.env.SUPERADMIN_PHONE;
  let restoreFetch;

  t.beforeEach(() => {
    process.env.SUPERADMIN_SECRET = "masterpass123";
    delete process.env.SUPERADMIN_PHONE;
    delete process.env.BRIDGE_URL;
    resetRateLimit("test_ip");
    resetRateLimit("admin_client");
    resetRateLimit("global");

    restoreFetch = mockFetch(async (url, opts) => {
      if (url.includes("/api/health")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ status: "ok", tenants: [] }),
        };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({ success: true }),
      };
    });
  });

  t.afterEach(() => {
    if (restoreFetch) restoreFetch();
    if (origSecret !== undefined) process.env.SUPERADMIN_SECRET = origSecret;
    else delete process.env.SUPERADMIN_SECRET;

    if (origPhone !== undefined) process.env.SUPERADMIN_PHONE = origPhone;
    else delete process.env.SUPERADMIN_PHONE;
  });

  await t.test("POST /api/superadmin/auth/login handles invalid body and wrong password", async () => {
    // 1. Invalid body
    const emptyReq = new NextRequest("http://localhost/api/superadmin/auth/login", {
      method: "POST",
      body: JSON.stringify({}),
    });
    const emptyRes = await superadminLoginPOST(emptyReq);
    assert.equal(emptyRes.status, 400);

    // 2. Incorrect password
    const wrongReq = new NextRequest("http://localhost/api/superadmin/auth/login", {
      method: "POST",
      body: JSON.stringify({ password: "wrong-password" }),
    });
    const wrongRes = await superadminLoginPOST(wrongReq);
    assert.equal(wrongRes.status, 401);
  });

  await t.test("POST /api/superadmin/auth/login succeeds with single-factor when SUPERADMIN_PHONE is unset", async () => {
    const req = new NextRequest("http://localhost/api/superadmin/auth/login", {
      method: "POST",
      body: JSON.stringify({ password: "masterpass123" }),
    });
    const res = await superadminLoginPOST(req);
    assert.equal(res.status, 200);

    const json = await res.json();
    assert.equal(json.success, true);
    assert.ok(json.token);

    const cookie = res.cookies.get(SUPERADMIN_COOKIE_NAME);
    assert.ok(cookie);
    assert.equal(cookie.value, json.token);
  });

  await t.test("POST /api/superadmin/auth/login triggers 2FA when SUPERADMIN_PHONE is set", async () => {
    process.env.SUPERADMIN_PHONE = "917060410033";
    const req = new NextRequest("http://localhost/api/superadmin/auth/login", {
      method: "POST",
      body: JSON.stringify({ password: "masterpass123" }),
    });
    const res = await superadminLoginPOST(req);
    assert.equal(res.status, 200);

    const json = await res.json();
    assert.equal(json.require2fa, true);
    assert.ok(json.maskedPhone);
    assert.ok(json.devOtp); // present in non-production

    // Test OTP Verification with dev OTP
    const otpReq = new NextRequest("http://localhost/api/superadmin/auth/otp", {
      method: "POST",
      body: JSON.stringify({ otp: json.devOtp }),
    });
    const otpRes = await superadminOtpPOST(otpReq);
    assert.equal(otpRes.status, 200);
    const otpJson = await otpRes.json();
    assert.equal(otpJson.success, true);
    assert.ok(otpJson.token);
  });

  await t.test("GET /api/superadmin/auth/verify checks session state", async () => {
    // Unauthenticated
    const unauthReq = new NextRequest("http://localhost/api/superadmin/auth/verify");
    const unauthRes = await superadminVerifyGET(unauthReq);
    assert.equal(unauthRes.status, 401);

    // Authenticated
    const token = createSuperadminSessionToken();
    const authReq = new NextRequest("http://localhost/api/superadmin/auth/verify", {
      headers: { cookie: `${SUPERADMIN_COOKIE_NAME}=${token}` },
    });
    const authRes = await superadminVerifyGET(authReq);
    assert.equal(authRes.status, 200);
    const json = await authRes.json();
    assert.equal(json.authenticated, true);
    assert.equal(json.role, "superadmin");
  });

  await t.test("POST /api/superadmin/auth/logout clears cookie", async () => {
    const res = await superadminLogoutPOST();
    assert.equal(res.status, 200);
    const cookie = res.cookies.get(SUPERADMIN_COOKIE_NAME);
    assert.equal(cookie.maxAge, 0);
  });

  await t.test("GET /api/superadmin/users enforces authentication and returns users overview", async () => {
    // Unauthenticated -> 401
    const unauthReq = new NextRequest("http://localhost/api/superadmin/users");
    const unauthRes = await superadminUsersGET(unauthReq);
    assert.equal(unauthRes.status, 401);

    // Seed test connection
    await createConnection({
      hash: "USERAPI1",
      ownerPhone: "917060410033",
      allowedRecipients: ["911234567890"],
      aiModel: "qwen/qwen3.8-27b",
      status: "linked",
    });

    // Authenticated -> 200
    const token = createSuperadminSessionToken();
    const authReq = new NextRequest("http://localhost/api/superadmin/users", {
      headers: { cookie: `${SUPERADMIN_COOKIE_NAME}=${token}` },
    });
    const authRes = await superadminUsersGET(authReq);
    assert.equal(authRes.status, 200);

    const json = await authRes.json();
    assert.ok(json.summary);
    assert.ok(Array.isArray(json.users));
    assert.ok(json.users.some((u) => u.hash === "USERAPI1"));
  });

  await t.test("GET, POST, DELETE /api/superadmin/users/[hash] manages individual tenants", async () => {
    const token = createSuperadminSessionToken();
    const authHeader = { cookie: `${SUPERADMIN_COOKIE_NAME}=${token}` };

    await createConnection({
      hash: "MANAGE1",
      ownerPhone: "917060410033",
      status: "linked",
    });

    // 1. GET details
    const getReq = new NextRequest("http://localhost/api/superadmin/users/MANAGE1", {
      headers: authHeader,
    });
    const getRes = await superadminUserDetailGET(getReq, {
      params: Promise.resolve({ hash: "MANAGE1" }),
    });
    assert.equal(getRes.status, 200);
    const getJson = await getRes.json();
    assert.equal(getJson.hash, "MANAGE1");

    // 2. POST action (disconnect)
    const postReq = new NextRequest("http://localhost/api/superadmin/users/MANAGE1", {
      method: "POST",
      headers: authHeader,
      body: JSON.stringify({ action: "disconnect" }),
    });
    const postRes = await superadminUserActionPOST(postReq, {
      params: Promise.resolve({ hash: "MANAGE1" }),
    });
    assert.equal(postRes.status, 200);

    // 3. DELETE tenant
    const delReq = new NextRequest("http://localhost/api/superadmin/users/MANAGE1", {
      method: "DELETE",
      headers: authHeader,
    });
    const delRes = await superadminUserDELETE(delReq, {
      params: Promise.resolve({ hash: "MANAGE1" }),
    });
    assert.equal(delRes.status, 200);
    const delJson = await delRes.json();
    assert.equal(delJson.success, true);
  });

  await t.test("GET and POST /api/superadmin/coupon manages active registration coupon", async () => {
    const { GET: couponGET, POST: couponPOST } = await import("../app/api/superadmin/coupon/route.js");
    const token = createSuperadminSessionToken();
    const authHeader = { cookie: `${SUPERADMIN_COOKIE_NAME}=${token}` };

    // 1. Unauthenticated -> 401
    const unauthReq = new NextRequest("http://localhost/api/superadmin/coupon");
    const unauthRes = await couponGET(unauthReq);
    assert.equal(unauthRes.status, 401);

    // 2. Authenticated GET
    const getReq = new NextRequest("http://localhost/api/superadmin/coupon", { headers: authHeader });
    const getRes = await couponGET(getReq);
    assert.equal(getRes.status, 200);
    const getJson = await getRes.json();
    assert.ok(getJson.coupon);

    // 3. Authenticated POST to auto-generate
    const genReq = new NextRequest("http://localhost/api/superadmin/coupon", {
      method: "POST",
      headers: authHeader,
      body: JSON.stringify({}),
    });
    const genRes = await couponPOST(genReq);
    assert.equal(genRes.status, 200);
    const genJson = await genRes.json();
    assert.ok(genJson.coupon.startsWith("VIP-"));

    // 4. Authenticated POST with custom coupon
    const customReq = new NextRequest("http://localhost/api/superadmin/coupon", {
      method: "POST",
      headers: authHeader,
      body: JSON.stringify({ coupon: "CUSTOM-TEST-99" }),
    });
    const customRes = await couponPOST(customReq);
    assert.equal(customRes.status, 200);
    const customJson = await customRes.json();
    assert.equal(customJson.coupon, "CUSTOM-TEST-99");
  });
});
