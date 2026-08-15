import { kv } from "./polls";

const CONFIG_KEY = "config";

export async function getConfig() {
  const raw = await kv.get(CONFIG_KEY);
  return raw ? JSON.parse(raw) : null;
}

export async function saveConfig(config) {
  await kv.set(CONFIG_KEY, JSON.stringify(config));
  return config;
}
