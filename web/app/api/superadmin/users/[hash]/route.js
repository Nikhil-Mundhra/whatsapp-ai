import { NextResponse } from "next/server.js";
import { verifySuperadminSession } from "../../../../../lib/superadmin.js";
import {
  getConnection,
  updateConnection,
  deleteConnection,
  reconnectBridgeTenant,
  disconnectBridgeTenant,
  deleteBridgeTenant,
  getBridgeHeaders,
} from "../../../../../lib/connections.js";

const BRIDGE_URL = (process.env.BRIDGE_URL || "http://35.255.130.255:8080").replace(/\/$/, "");

export async function GET(req, props) {
  const isAuthed = await verifySuperadminSession(req);
  if (!isAuthed) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { hash } = await props.params;
  const cleanHash = String(hash || "").trim().toUpperCase();
  if (!cleanHash) return NextResponse.json({ error: "Missing hash" }, { status: 400 });

  const conn = await getConnection(cleanHash);
  let bridgeStatus = null;
  let messages = [];

  if (BRIDGE_URL) {
    try {
      const statusRes = await fetch(`${BRIDGE_URL}/api/connections/${cleanHash}/status`, {
        headers: getBridgeHeaders(),
        signal: AbortSignal.timeout(4000),
      });
      if (statusRes.ok) bridgeStatus = await statusRes.json();
    } catch {}

    try {
      const msgRes = await fetch(`${BRIDGE_URL}/api/connections/${cleanHash}/messages?limit=100`, {
        headers: getBridgeHeaders(),
        signal: AbortSignal.timeout(4000),
      });
      if (msgRes.ok) {
        const msgData = await msgRes.json();
        messages = msgData.messages || [];
      }
    } catch {}
  }

  return NextResponse.json({
    hash: cleanHash,
    connection: conn,
    bridgeStatus,
    messages,
  });
}

export async function POST(req, props) {
  const isAuthed = await verifySuperadminSession(req);
  if (!isAuthed) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { hash } = await props.params;
  const cleanHash = String(hash || "").trim().toUpperCase();
  if (!cleanHash) return NextResponse.json({ error: "Missing hash" }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const action = body.action;

  if (action === "reconnect") {
    const res = await reconnectBridgeTenant(cleanHash);
    return NextResponse.json(res);
  }

  if (action === "disconnect") {
    const res = await disconnectBridgeTenant(cleanHash);
    return NextResponse.json(res);
  }

  return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
}

export async function DELETE(req, props) {
  const isAuthed = await verifySuperadminSession(req);
  if (!isAuthed) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { hash } = await props.params;
  const cleanHash = String(hash || "").trim().toUpperCase();
  if (!cleanHash) return NextResponse.json({ error: "Missing hash" }, { status: 400 });

  await deleteConnection(cleanHash);
  if (BRIDGE_URL) {
    try {
      await deleteBridgeTenant(cleanHash);
    } catch {}
  }

  return NextResponse.json({ success: true, hash: cleanHash });
}
