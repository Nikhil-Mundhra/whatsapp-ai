import { NextResponse } from "next/server";
import { getConnection, updateConnection } from "../../../../../lib/connections";

const BRIDGE_URL = process.env.BRIDGE_URL || "";

export async function GET(_req, props) {
  const { hash } = await props.params;
  if (!hash) return NextResponse.json({ error: "missing hash" }, { status: 400 });

  let linked = false;
  let error = null;

  if (BRIDGE_URL) {
    try {
      const res = await fetch(`${BRIDGE_URL}/api/connections/${hash}/status`, {
        cache: "no-store",
        signal: AbortSignal.timeout(5000),
      });
      if (res.ok) {
        const data = await res.json();
        linked = Boolean(data.linked);
      } else {
        error = `bridge status error: ${res.status}`;
      }
    } catch (e) {
      error = "bridge unreachable";
    }
  }

  const conn = await getConnection(hash);
  if (conn && linked && conn.status !== "linked") {
    await updateConnection(hash, { status: "linked" });
  }

  return NextResponse.json({ hash, linked, bridgeError: error });
}
