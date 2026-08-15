import { createClient } from "@vercel/kv";

export const kv = createClient({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

const POLLS_KEY = "polls";          // sorted set: score = createdAt, member = pollId
const PREFIX = "poll:";             // hash: poll:ID -> JSON

export async function createPoll(poll) {
  const key = PREFIX + poll.id;
  await kv.hset(key, { data: JSON.stringify(poll) });
  await kv.zadd(POLLS_KEY, { score: poll.createdAt, member: poll.id });
  await kv.sadd("pending", poll.id);
  return poll;
}

export async function getPoll(id) {
  const raw = await kv.hget(PREFIX + id, "data");
  return raw ? JSON.parse(raw) : null;
}

export async function voteOnPoll(id, option, source) {
  const poll = await getPoll(id);
  if (!poll) return null;
  poll.selectedOption = option;
  poll.source = source;
  poll.status = "answered";
  poll.answeredAt = Date.now();
  await kv.hset(PREFIX + id, { data: JSON.stringify(poll) });
  await kv.srem("pending", id);
  return poll;
}

export async function expirePoll(id) {
  const poll = await getPoll(id);
  if (!poll) return null;
  poll.status = poll.status === "answered" ? poll.status : "expired";
  await kv.hset(PREFIX + id, { data: JSON.stringify(poll) });
  await kv.srem("pending", id);
  return poll;
}

export async function listPolls(limit = 50) {
  const ids = await kv.zrevrange(POOLS_KEY, 0, limit - 1);
  if (ids.length === 0) return [];
  const data = await kv.hmget(...ids.map((id) => [PREFIX + id, "data"]));
  return ids
    .map((id, i) => (data[i] ? JSON.parse(data[i]) : null))
    .filter(Boolean);
}

export async function getPendingPoll() {
  const id = await kv.zrange("pending", 0, 0); // srandmember fallback
  const member = await kv.srandmember("pending");
  const pollId = member || id[0];
  if (!pollId) return null;
  return getPoll(pollId);
}
