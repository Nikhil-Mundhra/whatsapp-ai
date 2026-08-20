import { NextResponse } from "next/server.js";
import { verifyConnectionOtp } from "../../../../../lib/connections.js";
import { setAuthCookies } from "../../../../../lib/jwt.js";

export async function POST(req) {
  const body = await req.json().catch(() => ({}));
  const cleanHash = String(body.hash || "").trim().toUpperCase();
  const otp = String(body.otp || "").trim();

  if (!cleanHash || !otp) {
    return NextResponse.json({ error: "hash and otp are required" }, { status: 400 });
  }

  const result = await verifyConnectionOtp(cleanHash, otp);
  if (!result.valid) {
    return NextResponse.json(
      { error: result.error, valid: false, remainingAttempts: result.remainingAttempts },
      { status: 401 }
    );
  }

  const response = NextResponse.json(result, { status: 200 });
  if (result.token) {
    setAuthCookies(response, result.token, cleanHash);
  }
  return response;
}
