import { randomBytes } from "crypto";
import { kv } from "./polls";

const PREFIX = "conn:";
const INDEX = "connections";

const HASH_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const HASH_LEN = 6;

// In-memory fallback in case KV is unconfigured
globalThis.__connectionsFallback = globalThis.__connectionsFallback || new Map();

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
  if (kv) {
    try {
      while (await kv.exists(PREFIX + hash)) {
        hash = generateHash();
      }
    } catch {
      /* fallback */
    }
  }
  const conn = {
    hash,
    ...config,
    status: "configuring",
    createdAt: Date.now(),
  };
  
  globalThis.__connectionsFallback.set(hash, conn);

  if (kv) {
    try {
      await kv.hset(PREFIX + hash, { data: JSON.stringify(conn) });
      await kv.zadd(INDEX, { score: conn.createdAt, member: hash });
    } catch (err) {
      console.error("[kv createConnection error]", err);
    }
  }
  return conn;
}

export async function getConnection(hash) {
  if (!hash) return null;
  if (kv) {
    try {
      const raw = await kv.hget(PREFIX + hash, "data");
      if (raw) {
        return typeof raw === "string" ? JSON.parse(raw) : raw;
      }
    } catch (err) {
      console.error("[kv getConnection error]", err);
    }
  }
  return globalThis.__connectionsFallback.get(hash) || null;
}

export async function updateConnection(hash, patch) {
  const conn = (await getConnection(hash)) || { hash, createdAt: Date.now() };
  const next = { ...conn, ...patch };
  globalThis.__connectionsFallback.set(hash, next);

  if (kv) {
    try {
      await kv.hset(PREFIX + hash, { data: JSON.stringify(next) });
      await kv.zadd(INDEX, { score: next.createdAt || Date.now(), member: hash });
    } catch (err) {
      console.error("[kv updateConnection error]", err);
    }
  }
  return next;
}

export async function deleteConnection(hash) {
  globalThis.__connectionsFallback.delete(hash);
  if (!kv) return;
  try {
    await kv.del(PREFIX + hash);
    await kv.zrem(INDEX, hash);
  } catch (err) {
    console.error("[kv deleteConnection error]", err);
  }
}
