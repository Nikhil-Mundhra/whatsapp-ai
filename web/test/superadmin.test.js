import test from "node:test";
import assert from "node:assert/strict";
import {
  getSuperadminSecret,
  isSuperadmin2FARequired,
  secureCompare,
  checkRateLimit,
  recordFailedAttempt,
  resetRateLimit,
  verifySuperadminSecret,
  verifySuperadminOtp,
  createSuperadminSessionToken,
  verifySuperadminSession,
  setSuperadminCookies,
  clearSuperadminCookies,
  formatBytes,
  getAllUsersOverview,
  maskApiKey,
  getGlobalAiConfig,
  setGlobalAiConfig,
  getAiUsageStats,
  recordAiAudioUsage,
  SUPERADMIN_COOKIE_NAME,
} from "../lib/superadmin.js";
import { createConnection } from "../lib/connections.js";
import { NextResponse } from "next/server.js";

function mockFetch(handler) {
  const original = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    return handler(url, options);
  };
  return () => {
    globalThis.fetch = original;
  };
}

test("Superadmin Security and Telemetry Unit Tests", async (t) => {
  const origSecret = process.env.SUPERADMIN_SECRET;
  const origPhone = process.env.SUPERADMIN_PHONE;
  let restoreFetch;

  t.beforeEach(() => {
    delete process.env.BRIDGE_URL;
    restoreFetch = mockFetch(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ status: "ok", tenants: [] }),
    }));
  });

  t.afterEach(() => {
    if (restoreFetch) restoreFetch();
    if (origSecret !== undefined) process.env.SUPERADMIN_SECRET = origSecret;
    else delete process.env.SUPERADMIN_SECRET;

    if (origPhone !== undefined) process.env.SUPERADMIN_PHONE = origPhone;
    else delete process.env.SUPERADMIN_PHONE;

    resetRateLimit("test_ip");
    resetRateLimit("global");
  });

  await t.test("secureCompare validates strings in constant time", () => {
    assert.equal(secureCompare("correct-pass", "correct-pass"), true);
    assert.equal(secureCompare("wrong-pass", "correct-pass"), false);
    assert.equal(secureCompare("short", "longer-string"), false);
    assert.equal(secureCompare(null, "test"), false);
    assert.equal(secureCompare(123, "123"), false);
  });

  await t.test("verifySuperadminSecret verifies master password and enforces rate limiting", () => {
    process.env.SUPERADMIN_SECRET = "super-secret-key-999";

    // Valid attempt
    const validRes = verifySuperadminSecret("super-secret-key-999", "test_ip");
    assert.equal(validRes.valid, true);

    // Invalid attempt decreases remaining attempts
    const fail1 = verifySuperadminSecret("wrong", "test_ip");
    assert.equal(fail1.valid, false);
    assert.equal(fail1.remainingAttempts, 4);

    // Multiple failures trigger lockout
    verifySuperadminSecret("wrong", "test_ip");
    verifySuperadminSecret("wrong", "test_ip");
    verifySuperadminSecret("wrong", "test_ip");
    const fail5 = verifySuperadminSecret("wrong", "test_ip");
    assert.equal(fail5.valid, false);
    assert.equal(fail5.locked, true);

    // Subsequent calls blocked by rate limit
    const lockedCheck = verifySuperadminSecret("super-secret-key-999", "test_ip");
    assert.equal(lockedCheck.valid, false);
    assert.equal(lockedCheck.locked, true);
  });

  await t.test("createSuperadminSessionToken and verifySuperadminSession validate role", async () => {
    const token = createSuperadminSessionToken();
    assert.ok(token);

    // Direct token validation
    const isValid = await verifySuperadminSession(token);
    assert.equal(isValid, true);

    // Request mock with cookie
    const mockReq = {
      cookies: {
        get: (name) => (name === SUPERADMIN_COOKIE_NAME ? { value: token } : null),
      },
    };
    assert.equal(await verifySuperadminSession(mockReq), true);

    // Request mock with Bearer header
    const mockBearerReq = {
      headers: {
        get: (name) => (name === "authorization" ? `Bearer ${token}` : null),
      },
    };
    assert.equal(await verifySuperadminSession(mockBearerReq), true);

    // Invalid / empty token
    assert.equal(await verifySuperadminSession("invalid.token.here"), false);
    assert.equal(await verifySuperadminSession(null), false);
  });

  await t.test("setSuperadminCookies and clearSuperadminCookies manage HttpOnly SameSite=Strict cookies", () => {
    const res = NextResponse.json({ ok: true });
    setSuperadminCookies(res, "mock-superadmin-jwt");

    const cookie = res.cookies.get(SUPERADMIN_COOKIE_NAME);
    assert.ok(cookie);
    assert.equal(cookie.value, "mock-superadmin-jwt");
    assert.equal(cookie.httpOnly, true);
    assert.equal(cookie.sameSite, "strict");

    clearSuperadminCookies(res);
    const cleared = res.cookies.get(SUPERADMIN_COOKIE_NAME);
    assert.equal(cleared.maxAge, 0);
  });

  await t.test("formatBytes formats bytes into human readable units", () => {
    assert.equal(formatBytes(0), "0 B");
    assert.equal(formatBytes(500), "500.0 B");
    assert.equal(formatBytes(1024), "1.0 KB");
    assert.equal(formatBytes(1024 * 1024 * 2.5), "2.5 MB");
    assert.equal(formatBytes(1024 * 1024 * 1024 * 1.2), "1.2 GB");
  });

  await t.test("getAllUsersOverview aggregates users and calculates metrics without crashing", async () => {
    // Seed a test connection
    const testHash = "ADMINTEST1";
    await createConnection({
      hash: testHash,
      ownerPhone: "919999999999",
      allowedRecipients: ["918888888888", "917777777777"],
      aiModel: "qwen/qwen3.8-27b",
      status: "linked",
    });

    const overview = await getAllUsersOverview();
    assert.ok(overview);
    assert.ok(overview.summary);
    assert.ok(Array.isArray(overview.users));
    assert.ok(overview.summary.totalUsers >= 1);

    const user = overview.users.find((u) => u.hash === testHash);
    assert.ok(user);
    assert.equal(user.hash, testHash);
    assert.equal(user.ownerPhone, "919999999999");
    assert.ok(user.chatsAutomated >= 2);
    assert.ok(user.storageUsedBytes > 0);
    assert.ok(user.storageUsedFormatted);
  });

  await t.test("maskApiKey masks keys with provider prefix and suffix", () => {
    assert.equal(maskApiKey(""), "");
    assert.equal(maskApiKey(null), "");
    assert.equal(maskApiKey("gsk_1234567890abcdef1234"), "gsk_••••••••••••1234");
    assert.equal(maskApiKey("sk-or-v1-abcdef0123456789"), "sk-or-••••••••••••6789");
    assert.equal(maskApiKey("sk-regular-openai-key-9999"), "sk-••••••••••••9999");
    assert.equal(maskApiKey("short"), "••••••••");
  });

  await t.test("getGlobalAiConfig and setGlobalAiConfig manage global keys and default models", async () => {
    // 1. Initial config
    const initial = await getGlobalAiConfig();
    assert.ok(initial);
    assert.ok(initial.aiModel);

    // 2. Set Groq and OpenRouter keys
    const updated = await setGlobalAiConfig({
      groqApiKey: "gsk_testgroqkey1234567890",
      openrouterApiKey: "sk-or-v1-testkey9876543210",
      aiModel: "groq/llama-3.3-70b-versatile",
      whisperProvider: "groq",
    });

    assert.equal(updated.groqApiKeySet, true);
    assert.ok(updated.groqApiKeyMasked.startsWith("gsk_"));
    assert.equal(updated.openrouterApiKeySet, true);
    assert.ok(updated.openrouterApiKeyMasked.startsWith("sk-or-"));
    assert.equal(updated.aiModel, "groq/llama-3.3-70b-versatile");
    assert.equal(updated.whisperProvider, "groq");

    // 3. Telemetry and usage metrics
    await recordAiAudioUsage(30, 2); // 2 audio voice notes, 30s
    const stats = await getAiUsageStats();
    assert.ok(stats.config);
    assert.ok(stats.usage);
    assert.ok(stats.usage.totalVoiceNotesTranscribed >= 2);
    assert.ok(stats.usage.totalAudioDurationSeconds >= 30);
    assert.ok(Array.isArray(stats.usage.providers));
    assert.ok(Array.isArray(stats.tenants));
  });
});

