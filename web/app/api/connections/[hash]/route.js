import { NextResponse } from "next/server";
import { getConnection } from "../../../../lib/connections";

const BRIDGE_URL = process.env.BRIDGE_URL || "";

export async function GET(_req, props) {
  const { hash } = await props.params;
  if (!hash) return NextResponse.json({ error: "missing hash" }, { status: 400 });

  const conn = (await getConnection(hash)) || { hash, status: "configuring" };

  let whatsapp = conn.status === "linked" ? "linked" : "configuring";
  let error = null;
  if (BRIDGE_URL) {
    try {
      const res = await fetch(`${BRIDGE_URL}/api/connections/${hash}/status`, {
        cache: "no-store",
        signal: AbortSignal.timeout(5000),
      });
      if (res.ok) {
        const data = await res.json();
        whatsapp = data.linked ? "linked" : "configuring";
      }
    } catch (e) {
      error = "bridge unreachable";
    }
  }

  const { aiApiKey, ...rest } = conn;
  return NextResponse.json({
    connection: {
      ...rest,
      aiApiKeySet: Boolean(aiApiKey),
    },
    whatsapp,
    bridgeError: error,
  });
}
