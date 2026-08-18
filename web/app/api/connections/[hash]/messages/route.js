import { NextResponse } from "next/server";
import { getBridgeHeaders } from "../../../../../lib/connections";
import { getLocalMessages } from "../../../../../lib/sqlite";

const BRIDGE_URL = (process.env.BRIDGE_URL || "http://localhost:8080").replace(/\/$/, "");

export async function GET(req, props) {
  const { hash } = await props.params;
  if (!hash) return NextResponse.json({ error: "missing hash" }, { status: 400 });

  const { searchParams } = new URL(req.url);
  const limit = parseInt(searchParams.get("limit") || "100", 10);
  const chatJid = searchParams.get("chatJid") || "";

  // 1. Try local SQLite first (instant)
  const localMsgs = getLocalMessages(chatJid, limit);
  if (localMsgs && localMsgs.length > 0) {
    return NextResponse.json({ messages: localMsgs });
  }

  // 2. Fallback to Bridge API
  try {
    const res = await fetch(`${BRIDGE_URL}/api/connections/${hash}/messages?limit=${limit}`, {
      headers: getBridgeHeaders({ "Content-Type": "application/json" }),
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });

    if (res.ok) {
      const data = await res.json();
      return NextResponse.json(data);
    }
  } catch (err) {
    // Return empty on error
  }

  return NextResponse.json({ messages: [] });
}
