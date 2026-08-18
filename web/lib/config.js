import { kv } from "./polls.js";

const CONFIG_KEY = "config";

export async function getConfig() {
  if (!kv) return null;
  try {
    const raw = await kv.get(CONFIG_KEY);
    return raw ? (typeof raw === "string" ? JSON.parse(raw) : raw) : null;
  } catch (err) {
    console.error("[kv getConfig error]", err);
    return null;
  }
}

export async function saveConfig(config) {
  if (!kv) return config;
  try {
    await kv.set(CONFIG_KEY, JSON.stringify(config));
  } catch (err) {
    console.error("[kv saveConfig error]", err);
  }
  return config;
}
