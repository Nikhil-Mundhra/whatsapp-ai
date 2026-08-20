import { NextResponse } from "next/server.js";
import { verifySession } from "../../../../../lib/connections.js";

export async function POST(req) {
  const body = await req.json().catch(() => ({}));
  const cleanHash = String(body.hash || "").trim().toUpperCase();
  const token = String(body.token || "").trim();

  if (!cleanHash || !token) {
    return NextResponse.json({ valid: false, error: "hash and token are required" }, { status: 400 });
  }

  const isValid = await verifySession(cleanHash, token);
  return NextResponse.json({ valid: isValid, hash: cleanHash }, { status: isValid ? 200 : 401 });
}
