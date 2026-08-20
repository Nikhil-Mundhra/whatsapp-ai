import { NextResponse } from "next/server.js";
import { verifySession } from "../../../../../lib/connections.js";
import { extractAuthToken, extractHash, verifyJwt, setAuthCookies } from "../../../../../lib/jwt.js";

async function handleVerify(req) {
  let body = {};
  if (req.method === "POST") {
    body = await req.json().catch(() => ({}));
  }

  const { searchParams } = new URL(req.url);
  const queryHash = searchParams.get("hash");

  // 1. Resolve token from body, cookies, or Authorization header
  let token = String(body?.token || "").trim() || extractAuthToken(req) || "";

  // 2. Resolve hash from body, query param, cookie, or JWT claims
  let cleanHash = String(body?.hash || queryHash || "").trim().toUpperCase() || extractHash(req) || "";

  if (!cleanHash && token) {
    const payload = verifyJwt(token);
    if (payload?.hash) {
      cleanHash = String(payload.hash).trim().toUpperCase();
    }
  }

  if (!cleanHash || !token) {
    return NextResponse.json(
      { valid: false, error: "hash and token are required" },
      { status: 400 }
    );
  }

  const isValid = await verifySession(cleanHash, token);
  if (!isValid) {
    return NextResponse.json(
      { valid: false, hash: cleanHash, error: "Invalid or expired session" },
      { status: 401 }
    );
  }

  const response = NextResponse.json({ valid: true, hash: cleanHash, token }, { status: 200 });
  setAuthCookies(response, token, cleanHash);
  return response;
}

export async function GET(req) {
  return handleVerify(req);
}

export async function POST(req) {
  return handleVerify(req);
}
