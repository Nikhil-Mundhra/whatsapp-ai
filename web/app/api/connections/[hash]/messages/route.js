import { NextResponse } from "next/server";
import { getBridgeHeaders } from "../../../../../lib/connections";
import { getLocalMessages } from "../../../../../lib/sqlite";

const BRIDGE_URL = (process.env.BRIDGE_URL || "http://35.255.130.255:8080").replace(/\/$/, "");

export async function GET(req, props) {
  const { hash } = await props.params;
  if (!hash) return NextResponse.json({ error: "missing hash" }, { status: 400 });

  const { searchParams } = new URL(req.url);
  const limit = parseInt(searchParams.get("limit") || "200", 10);
  const chatJid = searchParams.get("chatJid") || "";

  // 1. Fetch from VM Bridge API first
  try {
    const res = await fetch(`${BRIDGE_URL}/api/connections/${hash}/messages?limit=${limit}`, {
      headers: getBridgeHeaders({ "Content-Type": "application/json" }),
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });

    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.messages) && data.messages.length > 0) {
        return NextResponse.json(data);
      }
    }
  } catch (err) {
    // Fallback to local SQLite
  }

  // 2. Fallback to local SQLite if running locally
  const localMsgs = getLocalMessages(chatJid, limit);
  if (localMsgs && localMsgs.length > 0) {
    return NextResponse.json({ messages: localMsgs });
  }

  return NextResponse.json({ messages: [] });
}
