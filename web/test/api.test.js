import test from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server.js";

// Import API routes
import { POST as validateKeyPOST } from "../app/api/validate-key/route.js";
import { GET as configGET, POST as configPOST } from "../app/api/config/route.js";
import { POST as connectionsPOST } from "../app/api/connections/route.js";
import {
  GET as connectionHashGET,
  PUT as connectionHashPUT,
  POST as connectionHashPOST,
} from "../app/api/connections/[hash]/route.js";
import {
  GET as messagesGET,
  POST as messagesPOST,
} from "../app/api/connections/[hash]/messages/route.js";
import {
  GET as qrGET,
  POST as qrPOST,
} from "../app/api/connections/[hash]/qr/route.js";
import { GET as statusGET } from "../app/api/connections/[hash]/status/route.js";
import { GET as chatsGET } from "../app/api/chats/route.js";
import { GET as contactsGET } from "../app/api/contacts/route.js";
import { GET as pollsGET, POST as pollsPOST } from "../app/api/polls/route.js";
import {
  GET as pollIdGET,
  POST as pollIdPOST,
} from "../app/api/polls/[id]/route.js";
import { POST as pollExpirePOST } from "../app/api/polls/[id]/expire/route.js";
import { GET as pollPendingGET } from "../app/api/polls/pending/route.js";

// Helper imports
import { _setKv } from "../lib/polls.js";
import { _setDatabaseSync, _setStoreDir } from "../lib/sqlite.js";
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

test("API Routes Unit Tests", async (t) => {
  t.afterEach(() => {
    _setKv(null);
    _setDatabaseSync(null);
    globalThis.__connectionsFallback.clear();
    globalThis.__couponFallback = null;
    delete process.env.BRIDGE_URL;
    delete process.env.COUPON;
    delete process.env.BRIDGE_AUTH_TOKEN;
  });

  // ==========================================
  // 1. /api/validate-key
  // ==========================================
  await t.test("POST /api/validate-key validation tests", async (st) => {
    await st.test("returns 400 when apiKey is missing or empty", async () => {
      const req = new NextRequest("http://localhost/api/validate-key", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      });
      const res = await validateKeyPOST(req);
      assert.equal(res.status, 400);
      const data = await res.json();
      assert.equal(data.valid, false);
    });

    await st.test("handles malformed JSON body", async () => {
      const req = new NextRequest("http://localhost/api/validate-key", {
        method: "POST",
        body: "invalid-json",
      });
      const res = await validateKeyPOST(req);
      assert.equal(res.status, 400);
    });

    await st.test("validates Google Gemini API key with models", async () => {
      const restore = mockFetch(async () => ({
        ok: true,
        json: async () => ({
          models: [
            { name: "models/gemini-2.0-flash", displayName: "Gemini 2.0 Flash", supportedGenerationMethods: ["generateContent"] },
            { name: "models/text-embedding", supportedGenerationMethods: ["embedContent"] },
          ],
        }),
      }));

      const req = new NextRequest("http://localhost/api/validate-key", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ apiKey: "AIzaSyDummyGeminiKey" }),
      });
      const res = await validateKeyPOST(req);
      restore();

      const data = await res.json();
      assert.equal(data.valid, true);
      assert.equal(data.provider, "Google Gemini");
      assert.equal(data.models.length, 1);
      assert.equal(data.models[0].id, "gemini-2.0-flash");
    });

    await st.test("validates Google Gemini API key with fallback models when models list empty", async () => {
      const restore = mockFetch(async () => ({
        ok: true,
        json: async () => ({ models: [] }),
      }));

      const req = new NextRequest("http://localhost/api/validate-key", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ apiKey: "AIzaSyDummyEmptyModels" }),
      });
      const res = await validateKeyPOST(req);
      restore();

      const data = await res.json();
      assert.equal(data.valid, true);
      assert.ok(data.models.length > 0);
    });

    await st.test("handles Gemini API rejection and fetch error", async () => {
      const restore1 = mockFetch(async () => ({ ok: false }));
      const req1 = new NextRequest("http://localhost/api/validate-key", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ apiKey: "AIzaSyInvalidKey" }),
      });
      const res1 = await validateKeyPOST(req1);
      restore1();
      const data1 = await res1.json();
      assert.equal(data1.valid, false);

      const restore2 = mockFetch(async () => {
        throw new Error("Network timeout");
      });
      const req2 = new NextRequest("http://localhost/api/validate-key", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ apiKey: "AIzaSyNetworkError" }),
      });
      const res2 = await validateKeyPOST(req2);
      restore2();
      const data2 = await res2.json();
      assert.equal(data2.valid, false);
      assert.equal(data2.error, "Unable to reach Gemini API");
    });

    await st.test("validates OpenRouter key directly with sk-or- prefix", async () => {
      const restore = mockFetch(async () => ({
        ok: true,
        json: async () => ({
          data: [
            { id: "custom/random-model", name: "Z Custom" },
            { id: "anthropic/claude-3.5-sonnet", name: "Claude 3.5 Sonnet" },
            { id: "meta-llama/llama-3.3-70b", name: "Llama 3.3" },
            { id: "qwen/qwen2.5-72b-instruct", name: "Qwen 2.5 72B" },
            { id: "deepseek/deepseek-chat", name: "DeepSeek V3" },
          ],
        }),
      }));

      const req = new NextRequest("http://localhost/api/validate-key", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ apiKey: "sk-or-v1-mytoken" }),
      });
      const res = await validateKeyPOST(req);
      restore();

      const data = await res.json();
      assert.equal(data.valid, true);
      assert.equal(data.provider, "OpenRouter");
      assert.ok(data.models.length > 0);
      assert.ok(data.defaultModel.includes("qwen"));
    });

    await st.test("handles invalid OpenRouter key with sk-or- prefix", async () => {
      const restore = mockFetch(async () => ({ ok: false }));
      const req = new NextRequest("http://localhost/api/validate-key", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ apiKey: "sk-or-invalid" }),
      });
      const res = await validateKeyPOST(req);
      restore();

      const data = await res.json();
      assert.equal(data.valid, false);
      assert.equal(data.error, "Invalid OpenRouter API Key");
    });

    await st.test("validates OpenAI key with matched models", async () => {
      const restore = mockFetch(async () => ({
        ok: true,
        json: async () => ({
          data: [{ id: "gpt-4o" }, { id: "gpt-4o-mini" }, { id: "whisper-1" }],
        }),
      }));

      const req = new NextRequest("http://localhost/api/validate-key", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ apiKey: "sk-proj-my-openai-key" }),
      });
      const res = await validateKeyPOST(req);
      restore();

      const data = await res.json();
      assert.equal(data.valid, true);
      assert.equal(data.provider, "OpenAI");
      assert.equal(data.models.length, 2);
    });

    await st.test("validates OpenAI key with fallback models when chat models not returned", async () => {
      const restore = mockFetch(async () => ({
        ok: true,
        json: async () => ({ data: [] }),
      }));

      const req = new NextRequest("http://localhost/api/validate-key", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ apiKey: "sk-my-openai-key" }),
      });
      const res = await validateKeyPOST(req);
      restore();

      const data = await res.json();
      assert.equal(data.valid, true);
      assert.equal(data.provider, "OpenAI");
      assert.ok(data.models.length > 0);
    });

    await st.test("handles OpenAI key failure with OpenRouter fallback and error", async () => {
      // 1. OpenAI fails, OpenRouter fallback succeeds
      let callCount = 0;
      const restore1 = mockFetch(async (url) => {
        callCount++;
        if (url.includes("api.openai.com")) return { ok: false };
        return {
          ok: true,
          json: async () => ({ data: [{ id: "custom-model" }] }),
        };
      });

      const req1 = new NextRequest("http://localhost/api/validate-key", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ apiKey: "sk-fallback-or-key" }),
      });
      const res1 = await validateKeyPOST(req1);
      restore1();
      const data1 = await res1.json();
      assert.equal(data1.valid, true);
      assert.equal(data1.provider, "OpenRouter");

      // 2. OpenAI and OpenRouter both fail
      const restore2 = mockFetch(async () => ({ ok: false }));
      const req2 = new NextRequest("http://localhost/api/validate-key", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ apiKey: "sk-all-fail" }),
      });
      const res2 = await validateKeyPOST(req2);
      restore2();
      const data2 = await res2.json();
      assert.equal(data2.valid, false);
      assert.equal(data2.error, "Invalid OpenAI API Key");

      // 3. OpenAI fetch throws
      const restore3 = mockFetch(async () => {
        throw new Error("OpenAI network error");
      });
      const req3 = new NextRequest("http://localhost/api/validate-key", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ apiKey: "sk-throw" }),
      });
      const res3 = await validateKeyPOST(req3);
      restore3();
      const data3 = await res3.json();
      assert.equal(data3.valid, false);
      assert.equal(data3.error, "Unable to reach OpenAI API");
    });

    await st.test("validates Anthropic key with models and error handling", async () => {
      // 1. Success with models
      const restore1 = mockFetch(async () => ({
        ok: true,
        json: async () => ({
          data: [{ id: "claude-3-5-sonnet", display_name: "Claude 3.5 Sonnet" }],
        }),
      }));
      const res1 = await validateKeyPOST(
        new NextRequest("http://localhost/api/validate-key", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ apiKey: "sk-ant-my-key" }),
        })
      );
      restore1();
      const data1 = await res1.json();
      assert.equal(data1.valid, true);
      assert.equal(data1.provider, "Anthropic Claude");

      // 2. Success with empty models list (fallback)
      const restore2 = mockFetch(async () => ({
        ok: true,
        json: async () => ({ data: [] }),
      }));
      const res2 = await validateKeyPOST(
        new NextRequest("http://localhost/api/validate-key", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ apiKey: "sk-ant-empty" }),
        })
      );
      restore2();
      const data2 = await res2.json();
      assert.equal(data2.valid, true);
      assert.ok(data2.models.length > 0);

      // 3. Rejection
      const restore3 = mockFetch(async () => ({ ok: false }));
      const res3 = await validateKeyPOST(
        new NextRequest("http://localhost/api/validate-key", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ apiKey: "sk-ant-rejected" }),
        })
      );
      restore3();
      const data3 = await res3.json();
      assert.equal(data3.valid, false);
      assert.equal(data3.error, "Invalid Anthropic API Key");

      // 4. Fetch throws
      const restore4 = mockFetch(async () => {
        throw new Error("Anthropic error");
      });
      const res4 = await validateKeyPOST(
        new NextRequest("http://localhost/api/validate-key", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ apiKey: "sk-ant-throw" }),
        })
      );
      restore4();
      const data4 = await res4.json();
      assert.equal(data4.valid, false);
      assert.equal(data4.error, "Unable to reach Anthropic API");
    });

    await st.test("validates Groq key with models and error handling", async () => {
      // 1. Success with models
      const restore1 = mockFetch(async () => ({
        ok: true,
        json: async () => ({
          data: [{ id: "llama-3.3-70b-versatile", active: true }, { id: "inactive-model", active: false }],
        }),
      }));
      const res1 = await validateKeyPOST(
        new NextRequest("http://localhost/api/validate-key", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ apiKey: "gsk_my_groq_key" }),
        })
      );
      restore1();
      const data1 = await res1.json();
      assert.equal(data1.valid, true);
      assert.equal(data1.provider, "Groq");
      assert.equal(data1.models.length, 1);

      // 2. Success with empty models list (fallback)
      const restore2 = mockFetch(async () => ({
        ok: true,
        json: async () => ({ data: [] }),
      }));
      const res2 = await validateKeyPOST(
        new NextRequest("http://localhost/api/validate-key", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ apiKey: "gsk_empty" }),
        })
      );
      restore2();
      const data2 = await res2.json();
      assert.equal(data2.valid, true);
      assert.ok(data2.models.length > 0);

      // 3. Rejection
      const restore3 = mockFetch(async () => ({ ok: false }));
      const res3 = await validateKeyPOST(
        new NextRequest("http://localhost/api/validate-key", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ apiKey: "gsk_invalid" }),
        })
      );
      restore3();
      const data3 = await res3.json();
      assert.equal(data3.valid, false);
      assert.equal(data3.error, "Invalid Groq API Key");

      // 4. Fetch throws
      const restore4 = mockFetch(async () => {
        throw new Error("Groq timeout");
      });
      const res4 = await validateKeyPOST(
        new NextRequest("http://localhost/api/validate-key", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ apiKey: "gsk_throw" }),
        })
      );
      restore4();
      const data4 = await res4.json();
      assert.equal(data4.valid, false);
      assert.equal(data4.error, "Unable to reach Groq API");
    });

    await st.test("falls back to Custom Provider for generic unrecognized keys", async () => {
      const restore = mockFetch(async () => ({ ok: false }));
      const req = new NextRequest("http://localhost/api/validate-key", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ apiKey: "custom-generic-api-key-12345" }),
      });
      const res = await validateKeyPOST(req);
      restore();

      const data = await res.json();
      assert.equal(data.valid, true);
      assert.equal(data.provider, "Custom Provider");
      assert.ok(data.warning);
    });
  });

  // ==========================================
  // 2. /api/config
  // ==========================================
  await t.test("GET and POST /api/config", async (st) => {
    await st.test("GET returns config: null when config is empty", async () => {
      _setKv(null);
      const res = await configGET();
      const data = await res.json();
      assert.equal(data.config, null);
    });

    await st.test("GET returns config with aiApiKeySet boolean and hidden key", async () => {
      _setKv({
        get: async () => ({ ownerPhone: "+1234567890", aiApiKey: "my-secret-key" }),
      });

      const res = await configGET();
      const data = await res.json();
      assert.equal(data.config.ownerPhone, "+1234567890");
      assert.equal(data.config.aiApiKeySet, true);
      assert.equal(data.config.aiApiKey, undefined);
    });

    await st.test("POST updates config with JSON body", async () => {
      let savedConfig = null;
      _setKv({
        get: async () => ({ ownerPhone: "+1000000000" }),
        set: async (key, val) => {
          savedConfig = JSON.parse(val);
        },
      });

      const req = new NextRequest("http://localhost/api/config", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ownerPhone: "+1999999999",
          allowedRecipients: ["+111", "+222"],
          aiApiKey: "new-api-key",
        }),
      });

      const res = await configPOST(req);
      const data = await res.json();
      assert.equal(data.config.ownerPhone, "+1999999999");
      assert.deepEqual(data.config.allowedRecipients, ["+111", "+222"]);
      assert.equal(data.config.aiApiKeySet, true);
      assert.equal(savedConfig.aiApiKey, "new-api-key");
    });

    await st.test("POST updates config with FormData body and comma-separated recipients", async () => {
      let savedConfig = null;
      _setKv({
        get: async () => null,
        set: async (key, val) => {
          savedConfig = JSON.parse(val);
        },
      });

      const formData = new FormData();
      formData.append("ownerPhone", "+1888888888");
      formData.append("allowedRecipients", "+111, +222, +333");
      formData.append("aiApiKey", "form-key");

      const req = new Request("http://localhost/api/config", {
        method: "POST",
        body: formData,
      });

      const res = await configPOST(req);
      const data = await res.json();
      assert.equal(data.config.ownerPhone, "+1888888888");
      assert.deepEqual(data.config.allowedRecipients, ["+111", "+222", "+333"]);
      assert.equal(data.config.aiApiKeySet, true);
    });

    await st.test("POST returns 400 when body is invalid", async () => {
      const req = new NextRequest("http://localhost/api/config", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "invalid-json",
      });

      const res = await configPOST(req);
      assert.equal(res.status, 400);
    });
  });

  // ==========================================
  // 3. /api/connections
  // ==========================================
  await t.test("POST /api/connections tests", async (st) => {
    await st.test("returns 400 for invalid body", async () => {
      const req = new NextRequest("http://localhost/api/connections", {
        method: "POST",
        body: "invalid-json",
      });
      const res = await connectionsPOST(req);
      assert.equal(res.status, 400);
    });

    await st.test("returns 403 for invalid coupon", async () => {
      process.env.COUPON = "secretcoupon";
      const req = new NextRequest("http://localhost/api/connections", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ coupon: "wrongcoupon" }),
      });
      const res = await connectionsPOST(req);
      assert.equal(res.status, 403);
    });

    await st.test("returns 400 if required fields are missing", async () => {
      process.env.COUPON = "testcoupon";
      const req = new NextRequest("http://localhost/api/connections", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          coupon: "testcoupon",
          ownerPhone: "+1234567890",
          // missing allowedRecipients & aiApiKey
        }),
      });
      const res = await connectionsPOST(req);
      assert.equal(res.status, 400);
    });

    await st.test("creates connection with array and string recipients", async () => {
      process.env.COUPON = "validcoupon";
      globalThis.__couponFallback = "validcoupon";

      // 1. Array recipients
      const req1 = new NextRequest("http://localhost/api/connections", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          coupon: "validcoupon",
          ownerPhone: "+1234567890",
          allowedRecipients: ["+1111111111", "+2222222222"],
          aiApiKey: "my-key",
          aiModel: "qwen-2.5-72b",
        }),
      });
      const res1 = await connectionsPOST(req1);
      assert.equal(res1.status, 201);
      const data1 = await res1.json();
      assert.ok(data1.hash);
      assert.equal(data1.connection.ownerPhone, "+1234567890");
      assert.deepEqual(data1.connection.allowedRecipients, ["+1111111111", "+2222222222"]);

      // 2. Comma separated string recipients using the newly auto-generated active coupon!
      const currentActiveCoupon = globalThis.__couponFallback;
      const req2 = new NextRequest("http://localhost/api/connections", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          coupon: currentActiveCoupon,
          ownerPhone: "+1987654321",
          allowedRecipients: "+3333333333, +4444444444",
          aiApiKey: "my-key-2",
        }),
      });
      const res2 = await connectionsPOST(req2);
      assert.equal(res2.status, 201);
      const data2 = await res2.json();
      assert.deepEqual(data2.connection.allowedRecipients, ["+3333333333", "+4444444444"]);
    });
  });

  // ==========================================
  // 4. /api/connections/[hash]
  // ==========================================
  await t.test("GET, PUT, POST /api/connections/[hash]", async (st) => {
    await st.test("GET returns 400 when hash is missing", async () => {
      const res = await connectionHashGET(new NextRequest("http://localhost"), {
        params: Promise.resolve({ hash: "" }),
      });
      assert.equal(res.status, 400);
    });

    await st.test("GET hydrats connection from bridge and returns status", async () => {
      process.env.BRIDGE_URL = "http://mockbridge:8080";
      await createConnection({
        hash: "CONN01",
        ownerPhone: "",
        allowedRecipients: [],
      });

      const restore = mockFetch(async (url) => {
        if (url.includes("/api/connections/CONN01/status")) {
          return {
            ok: true,
            json: async () => ({
              linked: true,
              ownerPhone: "+1555555555",
              allowedRecipients: ["+1666666666"],
              aiModel: "custom-model-x",
            }),
          };
        }
        return { ok: false };
      });

      const res = await connectionHashGET(new NextRequest("http://localhost"), {
        params: Promise.resolve({ hash: "CONN01" }),
      });
      restore();

      const data = await res.json();
      assert.equal(data.whatsapp, "linked");
      assert.equal(data.connection.ownerPhone, "+1555555555");
      assert.deepEqual(data.connection.allowedRecipients, ["+1666666666"]);
      assert.equal(data.connection.aiModel, "custom-model-x");
    });

    await st.test("GET handles bridge unreachable error", async () => {
      process.env.BRIDGE_URL = "http://mockbridge:8080";
      const restore = mockFetch(async () => {
        throw new Error("Bridge connection refused");
      });

      const res = await connectionHashGET(new NextRequest("http://localhost"), {
        params: Promise.resolve({ hash: "CONN_ERR" }),
      });
      restore();

      const data = await res.json();
      assert.equal(data.bridgeError, "bridge unreachable");
    });

    await st.test("PUT and POST handleUpdate updates connection and syncs with bridge", async () => {
      process.env.BRIDGE_URL = "http://mockbridge:8080";
      await createConnection({ hash: "CONN_UPD" });

      let bridgeNotified = false;
      const restore = mockFetch(async (url) => {
        if (url.includes("/api/connections/CONN_UPD")) {
          bridgeNotified = true;
          return { ok: true };
        }
        return { ok: false };
      });

      // PUT test
      const putReq = new NextRequest("http://localhost", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ownerPhone: "+1777777777",
          allowedRecipients: ["+1888888888"],
          aiApiKey: "updated-key",
          aiModel: "updated-model",
        }),
      });

      const putRes = await connectionHashPUT(putReq, { params: { hash: "CONN_UPD" } });
      const putData = await putRes.json();
      assert.equal(putData.success, true);
      assert.equal(putData.connection.ownerPhone, "+1777777777");
      assert.equal(putData.connection.aiApiKeySet, true);
      assert.equal(bridgeNotified, true);

      // POST test with comma-separated recipients
      const postReq = new NextRequest("http://localhost", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          allowedRecipients: "+111, +222",
        }),
      });
      const postRes = await connectionHashPOST(postReq, { params: { hash: "CONN_UPD" } });
      const postData = await postRes.json();
      assert.equal(postData.success, true);
      assert.deepEqual(postData.connection.allowedRecipients, ["+111", "+222"]);

      restore();
    });

    await st.test("handleUpdate handles bridge notification error gracefully", async () => {
      process.env.BRIDGE_URL = "http://mockbridge:8080";
      await createConnection({ hash: "CONN_ERR_SYNC" });

      const restore = mockFetch(async () => {
        throw new Error("Bridge connection failure");
      });

      const req = new NextRequest("http://localhost", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ownerPhone: "+1999999999" }),
      });

      const res = await connectionHashPUT(req, { params: { hash: "CONN_ERR_SYNC" } });
      restore();
      const data = await res.json();
      assert.equal(data.success, true);
      assert.equal(data.connection.ownerPhone, "+1999999999");
    });

    await st.test("handleUpdate returns 400 when hash is missing", async () => {
      const res = await connectionHashPUT(new NextRequest("http://localhost"), {
        params: Promise.resolve({ hash: "" }),
      });
      assert.equal(res.status, 400);
    });
  });

  // ==========================================
  // 5. /api/connections/[hash]/messages
  // ==========================================
  await t.test("GET and POST /api/connections/[hash]/messages", async (st) => {
    await st.test("GET returns messages from bridge when available", async () => {
      process.env.BRIDGE_URL = "http://mockbridge:8080";
      const restore = mockFetch(async (url) => {
        if (url.includes("/messages")) {
          return {
            ok: true,
            json: async () => ({
              messages: [{ id: "m1", content: "Hello from bridge" }],
            }),
          };
        }
        return { ok: false };
      });

      const req = new NextRequest("http://localhost/api/connections/H1/messages?limit=50&chatJid=123@s.whatsapp.net");
      const res = await messagesGET(req, { params: Promise.resolve({ hash: "H1" }) });
      restore();

      const data = await res.json();
      assert.equal(data.messages.length, 1);
      assert.equal(data.messages[0].content, "Hello from bridge");
    });

    await st.test("GET falls back to local SQLite when bridge fails", async () => {
      process.env.BRIDGE_URL = "http://mockbridge:8080";
      const restore = mockFetch(async () => {
        throw new Error("Bridge down");
      });

      const req = new NextRequest("http://localhost/api/connections/H1/messages");
      const res = await messagesGET(req, { params: Promise.resolve({ hash: "H1" }) });
      restore();

      const data = await res.json();
      assert.ok(Array.isArray(data.messages));
    });

    await st.test("GET returns 400 when hash is missing", async () => {
      const res = await messagesGET(new NextRequest("http://localhost"), {
        params: Promise.resolve({ hash: "" }),
      });
      assert.equal(res.status, 400);
    });

    await st.test("POST returns 400 when missing recipient or message", async () => {
      const req = new NextRequest("http://localhost", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ recipient: "+123" }),
      });
      const res = await messagesPOST(req, { params: Promise.resolve({ hash: "H1" }) });
      assert.equal(res.status, 400);
    });

    await st.test("POST sends message to bridge with success and failure handling", async () => {
      process.env.BRIDGE_URL = "http://mockbridge:8080";

      // 1. Success
      const restore1 = mockFetch(async () => ({
        ok: true,
        json: async () => ({ success: true, messageId: "msg-123" }),
      }));
      const req1 = new NextRequest("http://localhost", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ recipient: "+123", message: "Hello!" }),
      });
      const res1 = await messagesPOST(req1, { params: Promise.resolve({ hash: "H1" }) });
      restore1();
      const data1 = await res1.json();
      assert.equal(data1.success, true);

      // 2. Bridge non-ok response
      const restore2 = mockFetch(async () => ({
        ok: false,
        status: 400,
        json: async () => ({ error: "Recipient blocked" }),
      }));
      const req2 = new NextRequest("http://localhost", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ recipient: "+123", message: "Hello!" }),
      });
      const res2 = await messagesPOST(req2, { params: Promise.resolve({ hash: "H1" }) });
      restore2();
      assert.equal(res2.status, 400);

      // 3. Bridge fetch error
      const restore3 = mockFetch(async () => {
        throw new Error("Bridge connection timeout");
      });
      const req3 = new NextRequest("http://localhost", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ recipient: "+123", message: "Hello!" }),
      });
      const res3 = await messagesPOST(req3, { params: Promise.resolve({ hash: "H1" }) });
      restore3();
      assert.equal(res3.status, 502);
    });

    await st.test("POST returns 400 when hash is missing", async () => {
      const res = await messagesPOST(new NextRequest("http://localhost"), {
        params: Promise.resolve({ hash: "" }),
      });
      assert.equal(res.status, 400);
    });
  });

  // ==========================================
  // 6. /api/connections/[hash]/qr
  // ==========================================
  await t.test("GET and POST /api/connections/[hash]/qr", async (st) => {
    await st.test("returns 400 when hash is missing", async () => {
      assert.equal((await qrGET(new NextRequest("http://localhost"), { params: Promise.resolve({ hash: "" }) })).status, 400);
      assert.equal((await qrPOST(new NextRequest("http://localhost"), { params: Promise.resolve({ hash: "" }) })).status, 400);
    });

    await st.test("returns 503 when BRIDGE_URL is not configured", async () => {
      process.env.BRIDGE_URL = "";
      const resGet = await qrGET(new NextRequest("http://localhost"), { params: Promise.resolve({ hash: "H1" }) });
      assert.equal(resGet.status, 503);

      const resPost = await qrPOST(new NextRequest("http://localhost"), { params: Promise.resolve({ hash: "H1" }) });
      assert.equal(resPost.status, 503);
    });

    await st.test("POST provisions QR code and updates connection status", async () => {
      process.env.BRIDGE_URL = "http://mockbridge:8080";
      await createConnection({ hash: "H_QR", ownerPhone: "+100" });

      const restore = mockFetch(async () => ({
        ok: true,
        json: async () => ({
          qr: "2@dummyqrcodecontent",
          qrAge: 5,
          linked: false,
          whatsapp: "pairing",
        }),
      }));

      const req = new NextRequest("http://localhost", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ allowedRecipients: ["+111"] }),
      });

      const res = await qrPOST(req, { params: Promise.resolve({ hash: "H_QR" }) });
      restore();

      const data = await res.json();
      assert.ok(data.qr.startsWith("data:image/png;base64,"));
      assert.equal(data.rawQr, "2@dummyqrcodecontent");
      assert.equal(data.ttl, 15);
      assert.equal(data.linked, false);
    });

    await st.test("POST handles bridge provisioning failure and network error", async () => {
      process.env.BRIDGE_URL = "http://mockbridge:8080";

      // 1. Non-ok response
      const restore1 = mockFetch(async () => ({
        ok: false,
        text: async () => "VM port closed",
      }));
      const res1 = await qrPOST(new NextRequest("http://localhost"), { params: Promise.resolve({ hash: "H_FAIL" }) });
      restore1();
      assert.equal(res1.status, 502);

      // 2. Fetch throws
      const restore2 = mockFetch(async () => {
        throw new Error("Connection refused");
      });
      const res2 = await qrPOST(new NextRequest("http://localhost"), { params: Promise.resolve({ hash: "H_FAIL" }) });
      restore2();
      assert.equal(res2.status, 502);
    });

    await st.test("GET retrieves QR code from bridge", async () => {
      process.env.BRIDGE_URL = "http://mockbridge:8080";

      // 1. Success
      const restore1 = mockFetch(async () => ({
        ok: true,
        json: async () => ({ qr: "2@myqrdata", qrAge: 2 }),
      }));
      const res1 = await qrGET(new NextRequest("http://localhost"), { params: Promise.resolve({ hash: "H_QR" }) });
      restore1();
      const data1 = await res1.json();
      assert.ok(data1.qr.startsWith("data:image/png;base64,"));
      assert.equal(data1.ttl, 18);

      // 2. Bridge non-ok response
      const restore2 = mockFetch(async () => ({ ok: false }));
      const res2 = await qrGET(new NextRequest("http://localhost"), { params: Promise.resolve({ hash: "H_QR" }) });
      restore2();
      const data2 = await res2.json();
      assert.equal(data2.qr, null);

      // 3. Bridge fetch throws
      const restore3 = mockFetch(async () => {
        throw new Error("Bridge unreachable");
      });
      const res3 = await qrGET(new NextRequest("http://localhost"), { params: Promise.resolve({ hash: "H_QR" }) });
      restore3();
      const data3 = await res3.json();
      assert.equal(data3.qr, null);
    });
  });

  // ==========================================
  // 7. /api/connections/[hash]/status
  // ==========================================
  await t.test("GET /api/connections/[hash]/status tests", async (st) => {
    await st.test("returns 400 when hash is missing", async () => {
      const res = await statusGET(new NextRequest("http://localhost"), { params: Promise.resolve({ hash: "" }) });
      assert.equal(res.status, 400);
    });

    await st.test("updates connection status to linked when bridge reports linked: true", async () => {
      process.env.BRIDGE_URL = "http://mockbridge:8080";
      await createConnection({ hash: "H_STATUS", status: "configuring" });

      const restore = mockFetch(async () => ({
        ok: true,
        json: async () => ({ linked: true }),
      }));

      const res = await statusGET(new NextRequest("http://localhost"), { params: Promise.resolve({ hash: "H_STATUS" }) });
      restore();

      const data = await res.json();
      assert.equal(data.linked, true);
      assert.equal(data.bridgeError, null);
    });

    await st.test("handles bridge status error and network failure", async () => {
      process.env.BRIDGE_URL = "http://mockbridge:8080";

      // 1. Non-ok response
      const restore1 = mockFetch(async () => ({ ok: false, status: 500 }));
      const res1 = await statusGET(new NextRequest("http://localhost"), { params: Promise.resolve({ hash: "H_ERR" }) });
      restore1();
      const data1 = await res1.json();
      assert.equal(data1.bridgeError, "bridge status error: 500");

      // 2. Fetch throws
      const restore2 = mockFetch(async () => {
        throw new Error("Bridge connection lost");
      });
      const res2 = await statusGET(new NextRequest("http://localhost"), { params: Promise.resolve({ hash: "H_ERR" }) });
      restore2();
      const data2 = await res2.json();
      assert.equal(data2.bridgeError, "bridge unreachable");
    });

    await st.test("status does not update when already linked or conn is null", async () => {
      process.env.BRIDGE_URL = "http://mockbridge:8080";
      await createConnection({ hash: "H_ALREADY", status: "linked" });

      const restore = mockFetch(async () => ({
        ok: true,
        json: async () => ({ linked: true }),
      }));

      const res = await statusGET(new NextRequest("http://localhost"), { params: Promise.resolve({ hash: "H_ALREADY" }) });
      const data = await res.json();
      assert.equal(data.linked, true);

      // When conn does not exist
      const res2 = await statusGET(new NextRequest("http://localhost"), { params: Promise.resolve({ hash: "H_NONEXISTENT" }) });
      const data2 = await res2.json();
      assert.equal(data2.linked, true);

      restore();
    });
  });

  // ==========================================
  // 8. /api/chats
  // ==========================================
  await t.test("GET /api/chats tests", async (st) => {
    await st.test("aggregates chats from bridge when local SQLite is empty", async () => {
      process.env.BRIDGE_URL = "http://mockbridge:8080";
      _setDatabaseSync(null);

      const restore = mockFetch(async () => ({
        ok: true,
        json: async () => ({
          messages: [
            { chatJid: "1111111111@s.whatsapp.net", senderName: "Alice", content: "Hey", timestamp: 1000 },
            { chatJid: "2222222222@s.whatsapp.net", sender: "2222222222@s.whatsapp.net", body: "Hello", timestamp: 2000 },
            { chatJid: "status@broadcast", content: "Broadcast" },
          ],
        }),
      }));

      const req = new NextRequest("http://localhost/api/chats?hash=H_CHAT&limit=10");
      const res = await chatsGET(req);
      restore();

      const data = await res.json();
      assert.equal(data.chats.length, 2);
      assert.equal(data.chats[0].name, "Alice");
      assert.equal(data.chats[1].phone, "2222222222");
    });

    await st.test("handles bridge network error gracefully in chats GET", async () => {
      process.env.BRIDGE_URL = "http://mockbridge:8080";
      _setDatabaseSync(null);

      const restore = mockFetch(async () => {
        throw new Error("Bridge network failure");
      });

      const req = new NextRequest("http://localhost/api/chats?hash=H_ERR");
      const res = await chatsGET(req);
      restore();

      const data = await res.json();
      assert.deepEqual(data.chats, []);
    });

    await st.test("returns empty array when local SQLite and bridge have no chats", async () => {
      process.env.BRIDGE_URL = "";
      _setDatabaseSync(null);

      const req = new NextRequest("http://localhost/api/chats");
      const res = await chatsGET(req);
      const data = await res.json();
      assert.deepEqual(data.chats, []);
    });
  });

  // ==========================================
  // 9. /api/contacts
  // ==========================================
  await t.test("GET /api/contacts tests", async () => {
    _setDatabaseSync(null);
    const req = new NextRequest("http://localhost/api/contacts?q=test&limit=20");
    const res = await contactsGET(req);
    const data = await res.json();
    assert.deepEqual(data.contacts, []);
  });

  // ==========================================
  // 10. /api/polls
  // ==========================================
  await t.test("GET and POST /api/polls tests", async (st) => {
    await st.test("GET retrieves polls for tenant", async () => {
      const poll1 = { id: "p1", question: "Take over?", options: ["Yes", "No"] };
      _setKv({
        zrevrange: async () => ["poll:T_POLL:p1"],
        pipeline: () => ({
          hget: () => {},
          exec: async () => [JSON.stringify(poll1)],
        }),
      });

      const req = new NextRequest("http://localhost/api/polls?hash=T_POLL");
      const res = await pollsGET(req);
      const data = await res.json();
      assert.deepEqual(data.polls, [poll1]);
    });

    await st.test("POST returns 400 for invalid body or missing id/question/options", async () => {
      const req1 = new NextRequest("http://localhost/api/polls", {
        method: "POST",
        body: "invalid-json",
      });
      assert.equal((await pollsPOST(req1)).status, 400);

      const req2 = new NextRequest("http://localhost/api/polls", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: "p1", question: "Q?" }), // options missing
      });
      assert.equal((await pollsPOST(req2)).status, 400);
    });

    await st.test("POST creates poll with defaults", async () => {
      _setKv(null);
      const req = new NextRequest("http://localhost/api/polls", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: "p_created",
          question: "Should AI answer?",
          options: ["Yes", "No"],
          contact: "+1234567890",
        }),
      });

      const res = await pollsPOST(req);
      assert.equal(res.status, 201);
      const data = await res.json();
      assert.equal(data.poll.id, "p_created");
      assert.equal(data.poll.status, "pending");
      assert.equal(data.poll.selectableCount, 1);
    });
  });

  // ==========================================
  // 11. /api/polls/[id]
  // ==========================================
  await t.test("GET and POST /api/polls/[id] tests", async (st) => {
    await st.test("GET returns 404 when poll is not found", async () => {
      _setKv(null);
      const res = await pollIdGET(new NextRequest("http://localhost/api/polls/p_missing?hash=T1"), {
        params: Promise.resolve({ id: "p_missing" }),
      });
      assert.equal(res.status, 404);
    });

    await st.test("GET returns poll when found", async () => {
      const poll = { id: "p_found", question: "Ready?" };
      _setKv({
        hget: async () => JSON.stringify(poll),
      });

      const res = await pollIdGET(new NextRequest("http://localhost/api/polls/p_found?hash=T1"), {
        params: Promise.resolve({ id: "p_found" }),
      });
      const data = await res.json();
      assert.deepEqual(data.poll, poll);
    });

    await st.test("POST returns 404 when poll not found", async () => {
      _setKv(null);
      const req = new NextRequest("http://localhost/api/polls/p_miss", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ option: "Yes" }),
      });
      const res = await pollIdPOST(req, { params: Promise.resolve({ id: "p_miss" }) });
      assert.equal(res.status, 404);
    });

    await st.test("POST returns poll immediately if already answered", async () => {
      const answeredPoll = { id: "p_ans", status: "answered", selectedOption: "Yes" };
      _setKv({
        hget: async () => JSON.stringify(answeredPoll),
      });

      const req = new NextRequest("http://localhost/api/polls/p_ans", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ option: "No" }),
      });
      const res = await pollIdPOST(req, { params: Promise.resolve({ id: "p_ans" }) });
      const data = await res.json();
      assert.equal(data.poll.status, "answered");
      assert.equal(data.poll.selectedOption, "Yes");
    });

    await st.test("POST returns 400 when option is missing", async () => {
      const pendingPoll = { id: "p_pend", status: "pending" };
      _setKv({
        hget: async () => JSON.stringify(pendingPoll),
      });

      const req = new NextRequest("http://localhost/api/polls/p_pend", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      });
      const res = await pollIdPOST(req, { params: Promise.resolve({ id: "p_pend" }) });
      assert.equal(res.status, 400);
    });

    await st.test("POST votes on poll with JSON body and triggers bridge grant", async () => {
      process.env.BRIDGE_URL = "http://mockbridge:8080";
      const poll = { id: "p_vote", hash: "T_GRANT", status: "pending", contact: "+1234567890" };

      let grantNotified = false;
      const restore = mockFetch(async (url) => {
        if (url.includes("/grant")) {
          grantNotified = true;
          return { ok: true };
        }
        return { ok: false };
      });

      _setKv({
        hget: async () => JSON.stringify(poll),
        hset: async () => {},
        srem: async () => {},
      });

      const req = new NextRequest("http://localhost/api/polls/p_vote?hash=T_GRANT", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ option: "Take Over (10 min)", source: "web-ui" }),
      });

      const res = await pollIdPOST(req, { params: Promise.resolve({ id: "p_vote" }) });
      restore();

      const data = await res.json();
      assert.equal(data.poll.status, "answered");
      assert.equal(data.poll.selectedOption, "Take Over (10 min)");
      assert.equal(grantNotified, true);
    });

    await st.test("POST handles bridge grant failure gracefully", async () => {
      process.env.BRIDGE_URL = "http://mockbridge:8080";
      const poll = { id: "p_grant_err", hash: "T_GRANT_ERR", status: "pending" };

      const restore = mockFetch(async () => {
        throw new Error("Grant failure");
      });

      _setKv({
        hget: async () => JSON.stringify(poll),
        hset: async () => {},
        srem: async () => {},
      });

      const req = new NextRequest("http://localhost/api/polls/p_grant_err?hash=T_GRANT_ERR", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ option: "Ignore" }),
      });

      const res = await pollIdPOST(req, { params: Promise.resolve({ id: "p_grant_err" }) });
      restore();

      const data = await res.json();
      assert.equal(data.poll.status, "answered");
    });

    await st.test("POST votes on poll with FormData body", async () => {
      const poll = { id: "p_form", hash: "default", status: "pending" };
      _setKv({
        hget: async () => JSON.stringify(poll),
        hset: async () => {},
        srem: async () => {},
      });

      const formData = new FormData();
      formData.append("option", "Yes");
      formData.append("contact", "+1999999999");

      const req = new NextRequest(
        new Request("http://localhost/api/polls/p_form", {
          method: "POST",
          body: formData,
        })
      );

      const res = await pollIdPOST(req, { params: Promise.resolve({ id: "p_form" }) });
      const data = await res.json();
      assert.equal(data.poll.status, "answered");
      assert.equal(data.poll.source, "panel");
    });
  });

  // ==========================================
  // 12. /api/polls/[id]/expire
  // ==========================================
  await t.test("POST /api/polls/[id]/expire tests", async (st) => {
    await st.test("returns 404 when poll not found", async () => {
      _setKv(null);
      const res = await pollExpirePOST(new NextRequest("http://localhost/api/polls/p_exp/expire?hash=T1"), {
        params: Promise.resolve({ id: "p_exp" }),
      });
      assert.equal(res.status, 404);
    });

    await st.test("expires poll successfully", async () => {
      const poll = { id: "p_exp", status: "pending" };
      _setKv({
        hget: async () => JSON.stringify(poll),
        hset: async () => {},
        srem: async () => {},
      });

      const res = await pollExpirePOST(new NextRequest("http://localhost/api/polls/p_exp/expire?hash=T1"), {
        params: Promise.resolve({ id: "p_exp" }),
      });
      const data = await res.json();
      assert.equal(data.poll.status, "expired");
    });
  });

  // ==========================================
  // 13. /api/polls/pending
  // ==========================================
  await t.test("GET /api/polls/pending tests", async (st) => {
    await st.test("returns poll: null when no pending poll found", async () => {
      _setKv(null);
      const res = await pollPendingGET(new NextRequest("http://localhost/api/polls/pending?hash=T1"));
      const data = await res.json();
      assert.equal(data.poll, null);
    });

    await st.test("returns pending poll when found", async () => {
      const poll = { id: "p_pend_active", hash: "T_PEND", status: "pending" };
      _setKv({
        smembers: async () => ["poll:T_PEND:p_pend_active"],
        hget: async () => JSON.stringify(poll),
      });

      const res = await pollPendingGET(new NextRequest("http://localhost/api/polls/pending?hash=T_PEND"));
      const data = await res.json();
      assert.deepEqual(data.poll, poll);
    });
  });
});
