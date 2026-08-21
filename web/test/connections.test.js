import test from "node:test";
import assert from "node:assert/strict";
import {
  generateHash,
  createConnection,
  getConnection,
  updateConnection,
  deleteConnection,
  getBridgeHeaders,
  maskApiKey,
} from "../lib/connections.js";
import { _setKv } from "../lib/polls.js";

test("connections.js unit tests", async (t) => {
  t.afterEach(() => {
    _setKv(null);
    globalThis.__connectionsFallback.clear();
    delete process.env.BRIDGE_AUTH_TOKEN;
  });

  await t.test("generateHash generates valid 6-char hash", () => {
    const hash = generateHash();
    assert.equal(typeof hash, "string");
    assert.equal(hash.length, 6);
    const validChars = /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]+$/;
    assert.match(hash, validChars);
  });

  await t.test("createConnection works without KV (in-memory fallback)", async () => {
    _setKv(null);
    const config = { ownerPhone: "+1234567890", aiModel: "qwen-2.5-72b" };
    const conn = await createConnection(config);

    assert.ok(conn.hash);
    assert.equal(conn.ownerPhone, "+1234567890");
    assert.equal(conn.status, "configuring");
    assert.ok(conn.createdAt);

    // Verify stored in fallback map
    const retrieved = await getConnection(conn.hash);
    assert.deepEqual(retrieved, conn);
  });

  await t.test("createConnection handles KV storage and collision retry", async () => {
    let existsCallCount = 0;
    const kvStore = new Map();
    let zaddCalled = false;

    _setKv({
      exists: async (key) => {
        existsCallCount++;
        // Simulate one collision on first hash generated
        return existsCallCount === 1;
      },
      hset: async (key, { data }) => {
        kvStore.set(key, data);
      },
      zadd: async (key, { score, member }) => {
        assert.equal(key, "connections");
        assert.ok(score > 0);
        zaddCalled = true;
      },
    });

    const conn = await createConnection({ ownerPhone: "+1999999999" });
    assert.ok(conn.hash);
    assert.equal(existsCallCount, 2);
    assert.ok(zaddCalled);
    assert.ok(kvStore.has(`conn:${conn.hash}`));
  });

  await t.test("createConnection handles KV exists error gracefully", async () => {
    _setKv({
      exists: async () => {
        throw new Error("KV exists failure");
      },
      hset: async () => {},
      zadd: async () => {},
    });

    const conn = await createConnection({ ownerPhone: "+1888888888" });
    assert.ok(conn.hash);
    assert.equal(conn.ownerPhone, "+1888888888");
  });

  await t.test("createConnection handles KV hset/zadd error gracefully", async () => {
    _setKv({
      exists: async () => false,
      hset: async () => {
        throw new Error("KV hset error");
      },
      zadd: async () => {},
    });

    const conn = await createConnection({ ownerPhone: "+1777777777" });
    assert.ok(conn.hash);
  });

  await t.test("getConnection returns null for missing or falsy hash", async () => {
    assert.equal(await getConnection(""), null);
    assert.equal(await getConnection(null), null);
    assert.equal(await getConnection(undefined), null);
  });

  await t.test("getConnection parses JSON string from KV", async () => {
    const mockConn = { hash: "TEST01", ownerPhone: "+1111111111", status: "linked" };
    _setKv({
      hget: async (key, field) => {
        assert.equal(key, "conn:TEST01");
        assert.equal(field, "data");
        return JSON.stringify(mockConn);
      },
    });

    const result = await getConnection("TEST01");
    assert.deepEqual(result, mockConn);
  });

  await t.test("getConnection returns already parsed object from KV", async () => {
    const mockConn = { hash: "TEST02", ownerPhone: "+2222222222" };
    _setKv({
      hget: async () => mockConn,
    });

    const result = await getConnection("TEST02");
    assert.deepEqual(result, mockConn);
  });

  await t.test("getConnection falls back to in-memory map when KV fails or throws", async () => {
    const fallbackConn = { hash: "TEST03", ownerPhone: "+3333333333" };
    globalThis.__connectionsFallback.set("TEST03", fallbackConn);

    _setKv({
      hget: async () => {
        throw new Error("KV read error");
      },
    });

    const result = await getConnection("TEST03");
    assert.deepEqual(result, fallbackConn);
  });

  await t.test("getConnection returns null when not found in KV or fallback", async () => {
    _setKv({
      hget: async () => null,
    });

    const result = await getConnection("NONEXISTENT");
    assert.equal(result, null);
  });

  await t.test("updateConnection updates existing connection in fallback map and KV", async () => {
    let savedKey = null;
    let savedData = null;
    let zaddScore = null;

    _setKv({
      hget: async () => JSON.stringify({ hash: "TEST04", ownerPhone: "+4444444444", createdAt: 12345 }),
      hset: async (key, { data }) => {
        savedKey = key;
        savedData = JSON.parse(data);
      },
      zadd: async (key, { score }) => {
        zaddScore = score;
      },
    });

    const updated = await updateConnection("TEST04", { status: "linked", aiModel: "gpt-4o" });
    assert.equal(updated.hash, "TEST04");
    assert.equal(updated.ownerPhone, "+4444444444");
    assert.equal(updated.status, "linked");
    assert.equal(updated.aiModel, "gpt-4o");
    assert.equal(savedKey, "conn:TEST04");
    assert.equal(savedData.status, "linked");
    assert.equal(zaddScore, 12345);
  });

  await t.test("updateConnection creates new connection object if not found", async () => {
    _setKv(null);
    const updated = await updateConnection("TESTNEW", { ownerPhone: "+5555555555" });
    assert.equal(updated.hash, "TESTNEW");
    assert.equal(updated.ownerPhone, "+5555555555");
    assert.ok(updated.createdAt);

    const retrieved = await getConnection("TESTNEW");
    assert.deepEqual(retrieved, updated);
  });

  await t.test("updateConnection handles KV error gracefully", async () => {
    _setKv({
      hget: async () => null,
      hset: async () => {
        throw new Error("KV update failure");
      },
    });

    const updated = await updateConnection("TESTERR", { ownerPhone: "+6666666666" });
    assert.equal(updated.hash, "TESTERR");
    assert.equal(updated.ownerPhone, "+6666666666");
  });

  await t.test("updateConnection fallback score when next.createdAt is missing", async () => {
    let capturedScore = null;
    _setKv({
      hget: async () => JSON.stringify({ hash: "NO_CREATED_AT" }),
      hset: async () => {},
      zadd: async (key, { score }) => {
        capturedScore = score;
      },
    });

    const updated = await updateConnection("NO_CREATED_AT", { status: "pairing" });
    assert.ok(capturedScore > 0);
  });

  await t.test("deleteConnection deletes from fallback map and KV", async () => {
    globalThis.__connectionsFallback.set("TESTDEL", { hash: "TESTDEL" });
    let delKey = null;
    let zremMember = null;

    _setKv({
      del: async (key) => {
        delKey = key;
      },
      zrem: async (key, member) => {
        zremMember = member;
      },
    });

    await deleteConnection("TESTDEL");
    assert.equal(globalThis.__connectionsFallback.has("TESTDEL"), false);
    assert.equal(delKey, "conn:TESTDEL");
    assert.equal(zremMember, "TESTDEL");
  });

  await t.test("deleteConnection works when KV is null", async () => {
    _setKv(null);
    globalThis.__connectionsFallback.set("TESTDEL2", { hash: "TESTDEL2" });
    await deleteConnection("TESTDEL2");
    assert.equal(globalThis.__connectionsFallback.has("TESTDEL2"), false);
  });

  await t.test("deleteConnection handles KV error gracefully", async () => {
    _setKv({
      del: async () => {
        throw new Error("KV del failure");
      },
      zrem: async () => {},
    });

    await deleteConnection("TESTDEL3");
  });

  await t.test("getBridgeHeaders returns headers with and without auth token", () => {
    // 1. Without auth token
    delete process.env.BRIDGE_AUTH_TOKEN;
    const headers1 = getBridgeHeaders({ "Content-Type": "application/json" });
    assert.deepEqual(headers1, { "Content-Type": "application/json" });

    // 2. With auth token
    process.env.BRIDGE_AUTH_TOKEN = "secret-bridge-token-xyz";
    const headers2 = getBridgeHeaders({ "Custom-Header": "abc" });
    assert.deepEqual(headers2, {
      "Custom-Header": "abc",
      Authorization: "Bearer secret-bridge-token-xyz",
    });

    // 3. Default empty object argument
    const headers3 = getBridgeHeaders();
    assert.deepEqual(headers3, {
      Authorization: "Bearer secret-bridge-token-xyz",
    });
  });

  await t.test("maskApiKey masks sensitive API keys safely", () => {
    assert.equal(maskApiKey(""), "");
    assert.equal(maskApiKey(null), "");
    assert.equal(maskApiKey(undefined), "");
    assert.equal(maskApiKey("123"), "12••••••");
    assert.equal(maskApiKey("123456"), "12••••••");
    assert.equal(maskApiKey("1234567890"), "123••••••90");
    assert.equal(maskApiKey("sk-or-v1-abcdef1234567890abcdef"), "sk-or-••••••••cdef");
    assert.equal(maskApiKey("sk-ant-api03-abcdef123456"), "sk-ant••••••••3456");
    assert.equal(maskApiKey("AIzaSyDa-1234567890abcdef"), "AIzaSy••••••••cdef");
    assert.equal(maskApiKey("gsk_1234567890abcdef"), "gsk_1••••••••cdef");
  });
});
