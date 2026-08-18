import { createClient } from "@vercel/kv";

const hasKv = Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);

export let kv = hasKv
  ? createClient({
      url: process.env.KV_REST_API_URL,
      token: process.env.KV_REST_API_TOKEN,
    })
  : null;

export function _setKv(client) {
  kv = client;
}

const POLLS_KEY = "polls";          // sorted set: score = createdAt, member = pollKey
const PREFIX = "poll:";             // hash: poll:HASH:ID -> JSON
const PENDING = "pending";          // set of pending poll keys

function pollKey(hash, id) {
  return `${PREFIX}${hash || "default"}:${id}`;
}

function tenantPollsKey(hash) {
  return `polls:${hash || "default"}`;
}

export async function createPoll(poll) {
  if (!kv) return poll;
  try {
    const prefix = `${PREFIX}${poll.hash || "default"}:`;
    const members = await kv.smembers(PENDING);
    if (members && members.length > 0) {
      for (const m of members) {
        if (typeof m === "string" && m.startsWith(prefix)) {
          await kv.srem(PENDING, m);
          const raw = await kv.hget(m, "data");
          if (raw) {
            const oldPoll = typeof raw === "string" ? JSON.parse(raw) : raw;
            if (oldPoll && oldPoll.status === "pending") {
              oldPoll.status = "expired";
              await kv.hset(m, { data: JSON.stringify(oldPoll) });
            }
          }
        }
      }
    }

    const key = pollKey(poll.hash, poll.id);
    await kv.hset(key, { data: JSON.stringify(poll) });
    await kv.zadd(POLLS_KEY, { score: poll.createdAt, member: key });
    await kv.zadd(tenantPollsKey(poll.hash), { score: poll.createdAt, member: key });
    await kv.sadd(PENDING, key);
  } catch (err) {
    console.error("[kv createPoll error]", err);
  }
  return poll;
}

export async function getPoll(hash, id) {
  if (!kv) return null;
  try {
    const raw = await kv.hget(pollKey(hash, id), "data");
    return raw ? (typeof raw === "string" ? JSON.parse(raw) : raw) : null;
  } catch (err) {
    console.error("[kv getPoll error]", err);
    return null;
  }
}

export async function voteOnPoll(hash, id, option, source) {
  const poll = await getPoll(hash, id);
  if (!poll || !kv) return null;
  try {
    poll.selectedOption = option;
    poll.source = source;
    poll.status = "answered";
    poll.answeredAt = Date.now();
    await kv.hset(pollKey(hash, id), { data: JSON.stringify(poll) });
    await kv.srem(PENDING, pollKey(hash, id));
  } catch (err) {
    console.error("[kv voteOnPoll error]", err);
  }
  return poll;
}

export async function expirePoll(hash, id) {
  const poll = await getPoll(hash, id);
  if (!poll || !kv) return null;
  try {
    poll.status = poll.status === "answered" ? poll.status : "expired";
    await kv.hset(pollKey(hash, id), { data: JSON.stringify(poll) });
    await kv.srem(PENDING, pollKey(hash, id));
  } catch (err) {
    console.error("[kv expirePoll error]", err);
  }
  return poll;
}

export async function listPolls(hash, limit = 50) {
  if (!kv) return [];
  try {
    let keys = await kv.zrevrange(tenantPollsKey(hash), 0, limit - 1);
    if (!keys || keys.length === 0) {
      const globalKeys = await kv.zrevrange(POLLS_KEY, 0, 500);
      const prefix = `${PREFIX}${hash || "default"}:`;
      keys = (globalKeys || []).filter((k) => typeof k === "string" && k.startsWith(prefix)).slice(0, limit);
    }
    if (!keys || keys.length === 0) return [];
    const pipeline = kv.pipeline();
    for (const key of keys) {
      pipeline.hget(key, "data");
    }
    const data = await pipeline.exec();
    return keys
      .map((k, i) => {
        if (!data || !data[i]) return null;
        return typeof data[i] === "string" ? JSON.parse(data[i]) : data[i];
      })
      .filter(Boolean);
  } catch (err) {
    console.error("[kv listPolls error]", err);
    return [];
  }
}

export async function getPendingPoll(hash) {
  if (!kv) return null;
  try {
    const prefix = `${PREFIX}${hash || "default"}:`;
    const members = await kv.smembers(PENDING);
    if (!members) return null;
    const candidates = members.filter((m) => typeof m === "string" && m.startsWith(prefix));
    if (candidates.length === 0) return null;
    const raw = await kv.hget(candidates[0], "data");
    return raw ? (typeof raw === "string" ? JSON.parse(raw) : raw) : null;
  } catch (err) {
    console.error("[kv getPendingPoll error]", err);
    return null;
  }
}
