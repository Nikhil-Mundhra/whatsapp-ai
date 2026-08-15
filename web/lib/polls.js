import { createClient } from "@vercel/kv";

export const kv = createClient({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

const POLLS_KEY = "polls";          // sorted set: score = createdAt, member = pollId
const PREFIX = "poll:";             // hash: poll:ID -> JSON
const PENDING = "pending";          // set of pending poll ids (global, watch polls by hash)

function pollKey(hash, id) {
  return `${PREFIX}${hash}:${id}`;
}

export async function createPoll(poll) {
  const key = pollKey(poll.hash || "default", poll.id);
  await kv.hset(key, { data: JSON.stringify(poll) });
  await kv.zadd(POLLS_KEY, { score: poll.createdAt, member: key });
  await kv.sadd(PENDING, key);
  return poll;
}

export async function getPoll(hash, id) {
  const raw = await kv.hget(pollKey(hash, id), "data");
  return raw ? JSON.parse(raw) : null;
}

export async function voteOnPoll(hash, id, option, source) {
  const poll = await getPoll(hash, id);
  if (!poll) return null;
  poll.selectedOption = option;
  poll.source = source;
  poll.status = "answered";
  poll.answeredAt = Date.now();
  await kv.hset(pollKey(hash, id), { data: JSON.stringify(poll) });
  await kv.srem(PENDING, pollKey(hash, id));
  return poll;
}

export async function expirePoll(hash, id) {
  const poll = await getPoll(hash, id);
  if (!poll) return null;
  poll.status = poll.status === "answered" ? poll.status : "expired";
  await kv.hset(pollKey(hash, id), { data: JSON.stringify(poll) });
  await kv.srem(PENDING, pollKey(hash, id));
  return poll;
}

export async function listPolls(hash, limit = 50) {
  const keys = await kv.zrevrange(POOLS_KEY, 0, limit - 1);
  if (keys.length === 0) return [];
  const prefix = `${PREFIX}${hash || "default"}:`;
  const filtered = keys.filter((k) => k.startsWith(prefix));
  const data = await kv.hmget(...filtered.map((k) => [k, "data"]));
  return filtered
    .map((k, i) => (data[i] ? JSON.parse(data[i]) : null))
    .filter(Boolean);
}

export async function getPendingPoll(hash) {
  const prefix = `${PREFIX}${hash || "default"}:`;
  const members = await kv.smembers(PENDING);
  const candidates = members.filter((m) => m.startsWith(prefix));
  if (candidates.length === 0) return null;
  const raw = await kv.hget(candidates[0], "data");
  return raw ? JSON.parse(raw) : null;
}
