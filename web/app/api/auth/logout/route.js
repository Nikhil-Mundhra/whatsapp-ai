import { NextResponse } from "next/server.js";
import { revokeSession } from "../../../../lib/connections.js";
import { extractAuthToken, clearAuthCookies } from "../../../../lib/jwt.js";

export async function POST(req) {
  const body = await req.json().catch(() => ({}));
  const token = String(body?.token || "").trim() || extractAuthToken(req) || "";

  if (token) {
    await revokeSession(token);
  }

  const response = NextResponse.json({ success: true }, { status: 200 });
  clearAuthCookies(response);
  return response;
}
