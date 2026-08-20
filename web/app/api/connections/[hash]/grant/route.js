import { NextResponse } from "next/server.js";
import { getBridgeHeaders } from "../../../../../lib/connections.js";

const BRIDGE_URL = (process.env.BRIDGE_URL || "http://35.255.130.255:8080").replace(/\/$/, "");

export async function POST(req, props) {
  const { hash } = await props.params;
  const cleanHash = String(hash || "").trim().toUpperCase();

  if (!cleanHash) {
    return NextResponse.json({ error: "missing hash" }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const option = body?.option;
  const contact = body?.contact || "";

  if (!option) {
    return NextResponse.json({ error: "option is required" }, { status: 400 });
  }

  if (BRIDGE_URL) {
    try {
      const bridgeRes = await fetch(`${BRIDGE_URL}/api/connections/${cleanHash}/grant`, {
        method: "POST",
        headers: getBridgeHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ option, contact }),
        signal: AbortSignal.timeout(6000),
      });
      const data = await bridgeRes.json().catch(() => ({}));
      return NextResponse.json(data, { status: bridgeRes.status });
    } catch (err) {
      return NextResponse.json({ success: false, error: err.message }, { status: 500 });
    }
  }

  return NextResponse.json({ success: true, localOnly: true }, { status: 200 });
}
