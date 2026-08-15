import { randomBytes } from "crypto";
import { kv } from "./polls";

const PREFIX = "conn:";
const INDEX = "connections";

const HASH_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const HASH_LEN = 6;

export function generateHash() {
  const bytes = randomBytes(HASH_LEN);
  let hash = "";
  for (let i = 0; i < HASH_LEN; i++) {
    hash += HASH_ALPHABET[bytes[i] % HASH_ALPHABET.length];
  }
  return hash;
}

export async function createConnection(config) {
  let hash = generateHash();
  while (await kv.exists(PREFIX + hash)) {
    hash = generateHash();
  }
  const conn = {
    hash,
    ...config,
    status: "configuring",
    createdAt: Date.now(),
  };
  await kv.hset(PREFIX + hash, { data: JSON.stringify(conn) });
  await kv.zadd(INDEX, { score: conn.createdAt, member: hash });
  return conn;
}

export async function getConnection(hash) {
  const raw = await kv.hget(PREFIX + hash, "data");
  return raw ? JSON.parse(raw) : null;
}

export async function updateConnection(hash, patch) {
  const conn = await getConnection(hash);
  if (!conn) return null;
  const next = { ...conn, ...patch };
  await kv.hset(PREFIX + hash, { data: JSON.stringify(next) });
  return next;
}

export async function deleteConnection(hash) {
  await kv.del(PREFIX + hash);
  await kv.zrem(INDEX, hash);
}
