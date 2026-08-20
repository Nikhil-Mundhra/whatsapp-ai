import { NextResponse } from "next/server.js";
import { verifyConnectionOtp } from "../../../../../../lib/connections.js";
import { setAuthCookies } from "../../../../../../lib/jwt.js";

export async function POST(req, props) {
  const { hash } = await props.params;
  const cleanHash = String(hash || "").trim().toUpperCase();

  if (!cleanHash) {
    return NextResponse.json({ error: "missing hash" }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const otp = String(body.otp || "").trim();

  if (!otp) {
    return NextResponse.json({ error: "otp is required" }, { status: 400 });
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
