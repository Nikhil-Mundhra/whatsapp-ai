import { NextResponse } from "next/server.js";
import { getLocalContacts } from "../../../lib/sqlite.js";
import { getBridgeHeaders, getBridgeUrl } from "../../../lib/connections.js";

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q") || "";
  const hash = searchParams.get("hash") || "";
  const limit = parseInt(searchParams.get("limit") || "100", 10);
  const BRIDGE_URL = getBridgeUrl();

  const localContacts = getLocalContacts(q, limit);
  if (localContacts && localContacts.length > 0) {
    return NextResponse.json({ contacts: localContacts });
  }

  // If local contacts empty and tenant hash provided, query bridge messages to derive contacts & groups
  if (hash) {
    try {
      const res = await fetch(`${BRIDGE_URL}/api/connections/${hash}/messages?limit=150`, {
        headers: getBridgeHeaders({ "Content-Type": "application/json" }),
        cache: "no-store",
        signal: AbortSignal.timeout(4000),
      });

      if (res.ok) {
        const data = await res.json();
        const msgs = data.messages || [];
        const contactMap = new Map();
        const qLower = q.toLowerCase();

        for (const m of msgs) {
          const isFromMe = Boolean(m.isFromMe || m.is_from_me);
          const jid = m.chatJid || m.chat_jid || (isFromMe ? (m.recipient || "") : (m.sender || ""));
          if (!jid || jid === "status@broadcast") continue;
          const num = jid.split("@")[0];
          const name = m.chatName || (!isFromMe ? m.senderName : "") || num;
          const isGroup = jid.endsWith("@g.us");

          const matches =
            !q ||
            name.toLowerCase().includes(qLower) ||
            num.includes(q.replace(/\D/g, ""));

          if (matches && !contactMap.has(jid)) {
            contactMap.set(jid, {
              jid,
              phone: isGroup ? "" : num.replace(/\D/g, ""),
              name,
              isGroup,
            });
          }
        }

        const contacts = Array.from(contactMap.values()).slice(0, limit);
        return NextResponse.json({ contacts });
      }
    } catch {
      // Bridge error fallback
    }
  }

  return NextResponse.json({ contacts: [] });
}

