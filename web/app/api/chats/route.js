import { NextResponse } from "next/server";
import { getLocalChats } from "../../../lib/sqlite";
import { getBridgeHeaders } from "../../../lib/connections";

const BRIDGE_URL = (process.env.BRIDGE_URL || "http://35.255.130.255:8080").replace(/\/$/, "");

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const hash = searchParams.get("hash") || "";
  const limit = parseInt(searchParams.get("limit") || "50", 10);

  // 1. Try local SQLite first if available
  const localChats = getLocalChats(limit);
  if (localChats && localChats.length > 0) {
    return NextResponse.json({ chats: localChats });
  }

  // 2. Aggregate from VM Bridge messages for this tenant connection
  if (hash) {
    try {
      const res = await fetch(`${BRIDGE_URL}/api/connections/${hash}/messages?limit=200`, {
        headers: getBridgeHeaders({ "Content-Type": "application/json" }),
        cache: "no-store",
        signal: AbortSignal.timeout(5000),
      });

      if (res.ok) {
        const data = await res.json();
        const msgs = data.messages || [];

        // Group messages into distinct chat threads
        const chatMap = new Map();
        for (const m of msgs) {
          const jid = m.chatJid || m.chat_jid || m.sender || "";
          if (!jid || jid === "status@broadcast") continue;

          if (!chatMap.has(jid)) {
            const num = jid.split("@")[0];
            const name = m.senderName || m.chatName || num;

            chatMap.set(jid, {
              jid,
              name,
              phone: num,
              lastMessage: m.content || m.body || "",
              lastMessageTime: m.timestamp || null,
              lastIsFromMe: Boolean(m.isFromMe || m.is_from_me),
              isGroup: jid.endsWith("@g.us"),
            });
          }
        }

        const chats = Array.from(chatMap.values()).slice(0, limit);
        if (chats.length > 0) {
          return NextResponse.json({ chats });
        }
      }
    } catch (err) {
      // Bridge error
    }
  }

  return NextResponse.json({ chats: [] });
}
