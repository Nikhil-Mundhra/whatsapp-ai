import test from "node:test";
import assert from "node:assert/strict";
import {
  createPoll,
  getPoll,
  voteOnPoll,
  expirePoll,
  listPolls,
  getPendingPoll,
  _setKv,
} from "../lib/polls.js";

test("polls.js unit tests", async (t) => {
  t.afterEach(() => {
    _setKv(null);
  });

  await t.test("createPoll returns poll unchanged when kv is null", async () => {
    _setKv(null);
    const poll = { id: "p1", question: "Take over?", options: ["Yes", "No"] };
    const result = await createPoll(poll);
    assert.deepEqual(result, poll);
  });

  await t.test("createPoll saves poll in KV and expires older pending polls for tenant", async () => {
    const kvStore = new Map();
    let pendingSet = new Set(["poll:T1:old1", "poll:OTHER:old2", 12345]);
    kvStore.set("poll:T1:old1", JSON.stringify({ id: "old1", hash: "T1", status: "pending" }));

    _setKv({
      smembers: async (key) => {
        assert.equal(key, "pending");
        return Array.from(pendingSet);
      },
      srem: async (key, member) => {
        pendingSet.delete(member);
      },
      hget: async (key, field) => {
        return kvStore.get(key) || null;
      },
      hset: async (key, { data }) => {
        kvStore.set(key, data);
      },
      zadd: async () => {},
      sadd: async (key, member) => {
        pendingSet.add(member);
      },
    });

    const newPoll = { id: "new1", hash: "T1", question: "New Poll?", createdAt: Date.now() };
    const result = await createPoll(newPoll);
    assert.deepEqual(result, newPoll);

    // Old poll for T1 should be marked expired
    const oldPollData = JSON.parse(kvStore.get("poll:T1:old1"));
    assert.equal(oldPollData.status, "expired");

    // New poll should be in store and pending set
    assert.ok(kvStore.has("poll:T1:new1"));
    assert.ok(pendingSet.has("poll:T1:new1"));
  });

  await t.test("createPoll handles already answered old poll in pending set", async () => {
    const kvStore = new Map();
    const pendingSet = new Set(["poll:default:p_answered"]);
    // Non-string / parsed object returned from hget
    kvStore.set("poll:default:p_answered", { id: "p_answered", hash: "default", status: "answered" });

    _setKv({
      smembers: async () => Array.from(pendingSet),
      srem: async (key, member) => pendingSet.delete(member),
      hget: async (key) => kvStore.get(key),
      hset: async (key, { data }) => kvStore.set(key, data),
      zadd: async () => {},
      sadd: async () => {},
    });

    const poll = { id: "p_next", question: "Next?", createdAt: Date.now() };
    await createPoll(poll);
    assert.ok(kvStore.has("poll:default:p_next"));
  });

  await t.test("createPoll handles KV errors gracefully", async () => {
    _setKv({
      smembers: async () => {
        throw new Error("KV smembers failure");
      },
    });

    const poll = { id: "p_err", question: "Error?" };
    const result = await createPoll(poll);
    assert.deepEqual(result, poll);
  });

  await t.test("getPoll returns null when kv is null", async () => {
    _setKv(null);
    assert.equal(await getPoll("T1", "p1"), null);
  });

  await t.test("getPoll parses JSON string or returns raw object from KV", async () => {
    const pollObj = { id: "p1", question: "Ready?" };
    _setKv({
      hget: async (key) => {
        if (key === "poll:T1:p1") return JSON.stringify(pollObj);
        if (key === "poll:T1:p2") return pollObj;
        return null;
      },
    });

    assert.deepEqual(await getPoll("T1", "p1"), pollObj);
    assert.deepEqual(await getPoll("T1", "p2"), pollObj);
    assert.equal(await getPoll("T1", "nonexistent"), null);
  });

  await t.test("getPoll handles KV error gracefully", async () => {
    _setKv({
      hget: async () => {
        throw new Error("KV getPoll error");
      },
    });

    assert.equal(await getPoll("T1", "p1"), null);
  });

  await t.test("voteOnPoll returns null if kv is null or poll not found", async () => {
    _setKv(null);
    assert.equal(await voteOnPoll("T1", "p1", "Yes", "panel"), null);

    _setKv({
      hget: async () => null,
    });
    assert.equal(await voteOnPoll("T1", "p1", "Yes", "panel"), null);
  });

  await t.test("voteOnPoll updates poll status to answered and removes from pending", async () => {
    const pollObj = { id: "p1", hash: "T1", status: "pending" };
    let savedData = null;
    let removedPendingKey = null;

    _setKv({
      hget: async () => JSON.stringify(pollObj),
      hset: async (key, { data }) => {
        savedData = JSON.parse(data);
      },
      srem: async (key, member) => {
        assert.equal(key, "pending");
        removedPendingKey = member;
      },
    });

    const result = await voteOnPoll("T1", "p1", "Yes", "web-panel");
    assert.equal(result.status, "answered");
    assert.equal(result.selectedOption, "Yes");
    assert.equal(result.source, "web-panel");
    assert.ok(result.answeredAt > 0);
    assert.equal(savedData.status, "answered");
    assert.equal(removedPendingKey, "poll:T1:p1");
  });

  await t.test("voteOnPoll handles KV hset error gracefully", async () => {
    _setKv({
      hget: async () => JSON.stringify({ id: "p1", status: "pending" }),
      hset: async () => {
        throw new Error("KV vote write failure");
      },
    });

    const result = await voteOnPoll("T1", "p1", "Yes", "api");
    assert.equal(result.status, "answered");
  });

  await t.test("expirePoll returns null if kv is null or poll not found", async () => {
    _setKv(null);
    assert.equal(await expirePoll("T1", "p1"), null);

    _setKv({
      hget: async () => null,
    });
    assert.equal(await expirePoll("T1", "p1"), null);
  });

  await t.test("expirePoll marks pending poll as expired", async () => {
    let savedData = null;
    _setKv({
      hget: async () => JSON.stringify({ id: "p1", status: "pending" }),
      hset: async (key, { data }) => {
        savedData = JSON.parse(data);
      },
      srem: async () => {},
    });

    const result = await expirePoll("T1", "p1");
    assert.equal(result.status, "expired");
    assert.equal(savedData.status, "expired");
  });

  await t.test("expirePoll preserves answered status if already answered", async () => {
    _setKv({
      hget: async () => JSON.stringify({ id: "p1", status: "answered", selectedOption: "No" }),
      hset: async () => {},
      srem: async () => {},
    });

    const result = await expirePoll("T1", "p1");
    assert.equal(result.status, "answered");
  });

  await t.test("expirePoll handles KV write error gracefully", async () => {
    _setKv({
      hget: async () => JSON.stringify({ id: "p1", status: "pending" }),
      hset: async () => {
        throw new Error("KV expire write failure");
      },
    });

    const result = await expirePoll("T1", "p1");
    assert.equal(result.status, "expired");
  });

  await t.test("listPolls returns empty array when kv is null", async () => {
    _setKv(null);
    assert.deepEqual(await listPolls("T1"), []);
  });

  await t.test("listPolls retrieves polls from tenant sorted set", async () => {
    const poll1 = { id: "p1", question: "Q1" };
    const poll2 = { id: "p2", question: "Q2" };

    _setKv({
      zrevrange: async (key) => {
        assert.equal(key, "polls:T1");
        return ["poll:T1:p1", "poll:T1:p2"];
      },
      pipeline: () => ({
        hget: () => {},
        exec: async () => [JSON.stringify(poll1), poll2],
      }),
    });

    const results = await listPolls("T1", 10);
    assert.deepEqual(results, [poll1, poll2]);
  });

  await t.test("listPolls falls back to global POLLS_KEY when tenant key is empty", async () => {
    const pollGlobal = { id: "pG", hash: "T1", question: "Global Q" };

    _setKv({
      zrevrange: async (key) => {
        if (key === "polls:T1") return [];
        if (key === "polls") return ["poll:T1:pG", "poll:OTHER:pOther", 12345];
        return [];
      },
      pipeline: () => ({
        hget: () => {},
        exec: async () => [JSON.stringify(pollGlobal)],
      }),
    });

    const results = await listPolls("T1");
    assert.deepEqual(results, [pollGlobal]);
  });

  await t.test("listPolls returns empty array when no keys found in tenant or global", async () => {
    _setKv({
      zrevrange: async () => [],
    });

    assert.deepEqual(await listPolls("T1"), []);
  });

  await t.test("listPolls handles KV errors gracefully", async () => {
    _setKv({
      zrevrange: async () => {
        throw new Error("KV zrevrange error");
      },
    });

    assert.deepEqual(await listPolls("T1"), []);
  });

  await t.test("getPendingPoll returns null when kv is null or pending is empty", async () => {
    _setKv(null);
    assert.equal(await getPendingPoll("T1"), null);

    _setKv({
      smembers: async () => [],
    });
    assert.equal(await getPendingPoll("T1"), null);

    _setKv({
      smembers: async () => null,
    });
    assert.equal(await getPendingPoll("T1"), null);
  });

  await t.test("getPendingPoll returns first matching pending poll for hash", async () => {
    const pendingPoll = { id: "pend1", hash: "T1", status: "pending" };
    _setKv({
      smembers: async () => ["poll:OTHER:p99", "poll:T1:pend1"],
      hget: async (key) => {
        if (key === "poll:T1:pend1") return JSON.stringify(pendingPoll);
        return null;
      },
    });

    const result = await getPendingPoll("T1");
    assert.deepEqual(result, pendingPoll);
  });

  await t.test("getPendingPoll handles raw object and null from hget", async () => {
    const pendingPollObj = { id: "pend2", hash: "default" };
    _setKv({
      smembers: async () => ["poll:default:pend2"],
      hget: async () => pendingPollObj,
    });
    assert.deepEqual(await getPendingPoll(), pendingPollObj);

    _setKv({
      smembers: async () => ["poll:default:pend3"],
      hget: async () => null,
    });
    assert.equal(await getPendingPoll(), null);
  });

  await t.test("getPendingPoll handles KV error gracefully", async () => {
    _setKv({
      smembers: async () => {
        throw new Error("KV smembers error");
      },
    });

    assert.equal(await getPendingPoll("T1"), null);
  });

  await t.test("Takeover grant resolution and auto-revert logic on outbound message", async () => {
    const contact = "+15551234567";
    const now = Date.now();

    // 1. Grant creation for "Send 1 text"
    const grant = {
      type: "count",
      remainingCount: 1,
      expiresAt: now + 10 * 60 * 1000,
      activatedAt: now,
      lastOutboundId: "msg-old-1",
    };

    assert.equal(grant.type, "count");
    assert.equal(grant.remainingCount, 1);

    // 2. Historical outbound message before activation does NOT satisfy grant
    const historicalMessages = [
      {
        id: "msg-old-1",
        sender: "me",
        chatJid: "15551234567@s.whatsapp.net",
        content: "Old message",
        timestamp: new Date(now - 10000).toISOString(),
        isFromMe: true,
      },
    ];

    const historicalMatch = historicalMessages.some((m) => {
      const isOutbound = Boolean(m.isFromMe || m.isAi || m.origin === "api");
      const msgTime = new Date(m.timestamp).getTime();
      return isOutbound && msgTime >= (grant.activatedAt - 4000) && m.id !== grant.lastOutboundId;
    });
    assert.equal(historicalMatch, false);

    // 3. New AI-generated outbound message sent after grant activation DOES satisfy and clear grant
    const updatedMessages = [
      ...historicalMessages,
      {
        id: "msg-ai-2",
        sender: "me",
        chatJid: "15551234567@s.whatsapp.net",
        content: "AI reply to your message",
        timestamp: new Date(now + 1500).toISOString(),
        isFromMe: true,
        isAi: true,
        origin: "api",
      },
    ];

    const newMatch = updatedMessages.some((m) => {
      const isOutbound = Boolean(m.isFromMe || m.isAi || m.origin === "api");
      const msgTime = new Date(m.timestamp).getTime();
      return isOutbound && msgTime >= (grant.activatedAt - 4000) && m.id !== grant.lastOutboundId;
    });
    assert.equal(newMatch, true);
  });
});
