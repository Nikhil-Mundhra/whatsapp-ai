import { put, head } from "@vercel/blob";
import { NextResponse } from "next/server.js";
import { getBridgeUrl, getBridgeHeaders } from "../../../../../lib/connections.js";

// Fast in-memory cache for avatar URLs to prevent redundant bridge/blob queries
const memoryCache = new Map();
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

export async function GET(req, { params }) {
  const { hash } = await params;
  const { searchParams } = new URL(req.url);
  const jid = searchParams.get("jid") || searchParams.get("phone") || "";

  if (!hash || !jid) {
    return NextResponse.json({ error: "hash and jid parameters required" }, { status: 400 });
  }

  const cleanJid = jid.replace(/[^a-zA-Z0-9@._-]/g, "_");
  const cacheKey = `${hash}:${cleanJid}`;
  const now = Date.now();

  // 1. Check in-memory cache
  const cached = memoryCache.get(cacheKey);
  if (cached && cached.expiresAt > now && cached.blobUrl) {
    return NextResponse.redirect(cached.blobUrl, 307);
  }

  // 2. Fetch avatar info from WhatsApp Bridge
  const BRIDGE_URL = getBridgeUrl();
  let cdnUrl = "";

  try {
    const res = await fetch(`${BRIDGE_URL}/api/connections/${hash}/avatar?jid=${encodeURIComponent(jid)}`, {
      headers: getBridgeHeaders({ "Content-Type": "application/json" }),
      cache: "no-store",
      signal: AbortSignal.timeout(4000),
    });

    if (res.ok) {
      const data = await res.json();
      if (data.success && data.url) {
        cdnUrl = data.url;
      }
    }
  } catch (err) {
    // Bridge timeout or unavailable
  }

  if (!cdnUrl) {
    return NextResponse.json({ error: "Profile picture not available" }, { status: 404 });
  }

  // 3. Download low-res thumbnail from WhatsApp CDN
  let imageBuffer = null;
  try {
    const imgRes = await fetch(cdnUrl, { signal: AbortSignal.timeout(4000) });
    if (imgRes.ok) {
      const arrayBuffer = await imgRes.arrayBuffer();
      imageBuffer = Buffer.from(arrayBuffer);
    }
  } catch {}

  if (!imageBuffer || imageBuffer.length === 0) {
    return NextResponse.redirect(cdnUrl, 307);
  }

  // 4. If Vercel Blob is configured, upload and persist to Blob storage
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    try {
      const blobPath = `avatars/${hash}/${cleanJid}.jpg`;
      const blob = await put(blobPath, imageBuffer, {
        access: "public",
        contentType: "image/jpeg",
        addRandomSuffix: false,
        allowOverwrites: true,
      });

      memoryCache.set(cacheKey, {
        blobUrl: blob.url,
        expiresAt: now + CACHE_TTL_MS,
      });

      return NextResponse.redirect(blob.url, 307);
    } catch (err) {
      console.warn("Vercel Blob avatar upload fallback:", err.message);
    }
  }

  // 5. Fallback: Stream the low-res JPEG directly with strong caching headers
  return new Response(imageBuffer, {
    status: 200,
    headers: {
      "Content-Type": "image/jpeg",
      "Cache-Control": "public, max-age=86400, s-maxage=604800, stale-while-revalidate=86400",
      "Content-Length": String(imageBuffer.length),
    },
  });
}
