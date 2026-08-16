import { createClient } from "@vercel/kv";

const hasKv = Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);

export const kv = hasKv
  ? createClient({
      url: process.env.KV_REST_API_URL,
      token: process.env.KV_REST_API_TOKEN,
    })
  : null;

const POLLS_KEY = "polls";          // sorted set: score = createdAt, member = pollKey
const PREFIX = "poll:";             // hash: poll:HASH:ID -> JSON
const PENDING = "pending";          // set of pending poll keys

function pollKey(hash, id) {
  return `${PREFIX}${hash || "default"}:${id}`;
}

export async function createPoll(poll) {
  if (!kv) return poll;
  try {
    const key = pollKey(poll.hash, poll.id);
    await kv.hset(key, { data: JSON.stringify(poll) });
    await kv.zadd(POLLS_KEY, { score: poll.createdAt, member: key });
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
    const keys = await kv.zrevrange(POLLS_KEY, 0, limit - 1);
    if (!keys || keys.length === 0) return [];
    const prefix = `${PREFIX}${hash || "default"}:`;
    const filtered = keys.filter((k) => typeof k === "string" && k.startsWith(prefix));
    if (filtered.length === 0) return [];
    const pipeline = kv.pipeline();
    for (const key of filtered) {
      pipeline.hget(key, "data");
    }
    const data = await pipeline.exec();
    return filtered
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
