import { NextResponse } from "next/server.js";
import { getBridgeHeaders, getBridgeUrl } from "../../../../../lib/connections.js";
import { getLocalMessages } from "../../../../../lib/sqlite.js";

export async function GET(req, props) {
  const { hash } = await props.params;
  if (!hash) return NextResponse.json({ error: "missing hash" }, { status: 400 });

  const BRIDGE_URL = getBridgeUrl();
  const { searchParams } = new URL(req.url);
  const limit = parseInt(searchParams.get("limit") || "200", 10);
  const chatJid = searchParams.get("chatJid") || "";

  // 1. Fetch from VM Bridge API first
  if (BRIDGE_URL) {
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
  }

  // 2. Fallback to local SQLite if running locally
  const localMsgs = getLocalMessages(chatJid, limit);
  if (localMsgs && localMsgs.length > 0) {
    return NextResponse.json({ messages: localMsgs });
  }

  return NextResponse.json({ messages: [] });
}

export async function POST(req, props) {
  const { hash } = await props.params;
  if (!hash) return NextResponse.json({ error: "missing hash" }, { status: 400 });

  const BRIDGE_URL = getBridgeUrl();

  const body = await req.json().catch(() => ({}));
  const { recipient, message } = body;

  if (!recipient || !message) {
    return NextResponse.json({ error: "recipient and message are required" }, { status: 400 });
  }

  // Send real WhatsApp message via Go Bridge
  try {
    const res = await fetch(`${BRIDGE_URL}/api/connections/${hash}/send`, {
      method: "POST",
      headers: getBridgeHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ recipient, message }),
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      return NextResponse.json(
        { error: errData.error || `Bridge responded with status ${res.status}` },
        { status: res.status }
      );
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json(
      { error: `Failed to reach bridge: ${err.message}` },
      { status: 502 }
    );
  }
}
