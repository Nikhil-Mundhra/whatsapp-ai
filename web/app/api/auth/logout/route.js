import { NextResponse } from "next/server.js";
import { revokeSession } from "../../../../lib/connections.js";

export async function POST(req) {
  const body = await req.json().catch(() => ({}));
  const token = String(body.token || "").trim();

  if (token) {
    await revokeSession(token);
  }

  return NextResponse.json({ success: true }, { status: 200 });
}
