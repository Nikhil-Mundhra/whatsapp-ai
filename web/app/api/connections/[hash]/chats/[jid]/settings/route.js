import { NextResponse } from "next/server.js";
import { getBridgeHeaders } from "../../../../../../../lib/connections.js";

const BRIDGE_URL = (process.env.BRIDGE_URL || "http://35.255.130.255:8080").replace(/\/$/, "");

export async function GET(req, props) {
  const { hash, jid } = await props.params;
  const cleanHash = String(hash || "").trim().toUpperCase();
  const cleanJid = decodeURIComponent(String(jid || "").trim());

  if (!cleanHash || !cleanJid) {
    return NextResponse.json({ error: "hash and jid are required" }, { status: 400 });
  }

  try {
    const res = await fetch(`${BRIDGE_URL}/api/connections/${cleanHash}/chats/${encodeURIComponent(cleanJid)}/settings`, {
      headers: getBridgeHeaders(),
      signal: AbortSignal.timeout(5000),
    });
    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req, props) {
  const { hash, jid } = await props.params;
  const cleanHash = String(hash || "").trim().toUpperCase();
  const cleanJid = decodeURIComponent(String(jid || "").trim());

  if (!cleanHash || !cleanJid) {
    return NextResponse.json({ error: "hash and jid are required" }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));

  try {
    const res = await fetch(`${BRIDGE_URL}/api/connections/${cleanHash}/chats/${encodeURIComponent(cleanJid)}/settings`, {
      method: "POST",
      headers: getBridgeHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(5000),
    });
    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
