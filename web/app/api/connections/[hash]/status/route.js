import { NextResponse } from "next/server";
import { getConnection, updateConnection } from "../../../../../lib/connections";

const BRIDGE_URL = process.env.BRIDGE_URL || "";

export async function GET(_req, { params }) {
  const conn = await getConnection(params.hash);
  if (!conn) return NextResponse.json({ error: "not found" }, { status: 404 });

  let linked = false;
  let error = null;
  if (BRIDGE_URL) {
    try {
      const res = await fetch(`${BRIDGE_URL}/api/connections/${params.hash}/status`, {
        cache: "no-store",
        signal: AbortSignal.timeout(5000),
      });
      const data = await res.json();
      linked = Boolean(data.linked);
    } catch (e) {
      error = "bridge unreachable";
    }
  }

  if (linked && conn.status !== "linked") {
    await updateConnection(params.hash, { status: "linked" });
  }

  return NextResponse.json({ hash: params.hash, linked, bridgeError: error });
}
