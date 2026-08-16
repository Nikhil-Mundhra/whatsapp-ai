import { NextResponse } from "next/server";
import { getBridgeHeaders } from "../../../../../lib/connections";

const BRIDGE_URL = (process.env.BRIDGE_URL || "http://35.255.130.255:8080").replace(/\/$/, "");

export async function GET(req, props) {
  const { hash } = await props.params;
  if (!hash) return NextResponse.json({ error: "missing hash" }, { status: 400 });

  const { searchParams } = new URL(req.url);
  const limit = searchParams.get("limit") || "20";

  try {
    const res = await fetch(`${BRIDGE_URL}/api/connections/${hash}/messages?limit=${limit}`, {
      headers: getBridgeHeaders({ "Content-Type": "application/json" }),
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) {
      return NextResponse.json({ messages: [] });
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json({ messages: [] });
  }
}
