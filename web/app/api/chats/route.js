import { NextResponse } from "next/server";
import { getLocalChats } from "../../../lib/sqlite";
import { getBridgeHeaders } from "../../../lib/connections";

const BRIDGE_URL = (process.env.BRIDGE_URL || "http://localhost:8080").replace(/\/$/, "");

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const limit = parseInt(searchParams.get("limit") || "50", 10);

  // 1. Try local SQLite first (instant & rich)
  const localChats = getLocalChats(limit);
  if (localChats && localChats.length > 0) {
    return NextResponse.json({ chats: localChats });
  }

  // 2. Try Bridge API if local SQLite not available
  try {
    const res = await fetch(`${BRIDGE_URL}/api/chats?limit=${limit}`, {
      headers: getBridgeHeaders({ "Content-Type": "application/json" }),
      cache: "no-store",
      signal: AbortSignal.timeout(4000),
    });

    if (res.ok) {
      const data = await res.json();
      return NextResponse.json(data);
    }
  } catch (err) {
    // Bridge fallback
  }

  return NextResponse.json({ chats: [] });
}
