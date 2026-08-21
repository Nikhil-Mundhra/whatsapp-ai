import { NextResponse } from "next/server.js";
import { getLocalChats } from "../../../lib/sqlite.js";
import { getBridgeHeaders, getBridgeUrl } from "../../../lib/connections.js";

export async function GET(req) {
  const BRIDGE_URL = getBridgeUrl();
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

        // Group messages into distinct chat threads (merging LID and phone threads)
        const chatMap = new Map();
        for (const m of msgs) {
          const isFromMe = Boolean(m.isFromMe || m.is_from_me);
          const jid = m.chatJid || m.chat_jid || (isFromMe ? (m.recipient || "") : (m.sender || ""));
          if (!jid || jid === "status@broadcast") continue;

          const num = jid.split("@")[0];
          const clean = num.replace(/\D/g, "");
          const name = m.chatName || (!isFromMe ? m.senderName : "") || num;
          const isGroup = jid.endsWith("@g.us");

          let key = jid;
          if (!isGroup) {
            for (const [k, v] of chatMap.entries()) {
              if (!v.isGroup) {
                if (clean && v.phone === clean) {
                  key = k;
                  break;
                }
              }
            }
          }

          if (!chatMap.has(key)) {
            chatMap.set(key, {
              jid: key.endsWith("@lid") && !jid.endsWith("@lid") ? jid : key,
              name,
              phone: clean || num,
              lastMessage: m.content || m.body || "",
              lastMessageTime: m.timestamp || null,
              lastIsFromMe: Boolean(m.isFromMe || m.is_from_me),
              isGroup,
            });
          } else {
            const existing = chatMap.get(key);
            const existingTime = existing.lastMessageTime ? new Date(existing.lastMessageTime).getTime() : 0;
            const msgTime = m.timestamp ? new Date(m.timestamp).getTime() : 0;
            if (msgTime > existingTime) {
              existing.lastMessage = m.content || m.body || "";
              existing.lastMessageTime = m.timestamp;
              existing.lastIsFromMe = Boolean(m.isFromMe || m.is_from_me);
            }
            if (name && !name.match(/^\+?\d+$/)) {
              existing.name = name;
            }
            if (jid.endsWith("@s.whatsapp.net")) {
              existing.jid = jid;
            }
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
