import { kv } from "./polls.js";
import { randomBytes } from "crypto";

const CONFIG_KEY = "config";
const COUPON_KEY = "active_coupon";

globalThis.__couponFallback = globalThis.__couponFallback || null;

export function generateCouponCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let suffix = "";
  const bytes = randomBytes(4);
  for (let i = 0; i < 4; i++) {
    suffix += chars[bytes[i] % chars.length];
  }
  return `VIP-${suffix}`;
}

export async function getActiveCoupon() {
  if (kv) {
    try {
      const raw = await kv.get(COUPON_KEY);
      if (raw) {
        return typeof raw === "string" ? raw.trim() : String(raw).trim();
      }
    } catch (err) {
      console.error("[kv getActiveCoupon error]", err);
    }
  }

  if (globalThis.__couponFallback) {
    return globalThis.__couponFallback;
  }

  return (process.env.COUPON || "coupon").trim();
}

export async function setActiveCoupon(couponCode) {
  const clean = String(couponCode || "").trim().toUpperCase();
  if (!clean) throw new Error("Coupon code cannot be empty");

  globalThis.__couponFallback = clean;

  if (kv) {
    try {
      await kv.set(COUPON_KEY, clean);
    } catch (err) {
      console.error("[kv setActiveCoupon error]", err);
    }
  }

  return clean;
}

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
