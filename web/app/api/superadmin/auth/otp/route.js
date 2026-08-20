import { NextResponse } from "next/server.js";
import {
  verifySuperadminOtp,
  createSuperadminSessionToken,
  setSuperadminCookies,
} from "../../../../../lib/superadmin.js";

export async function POST(req) {
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid request body" }, { status: 400 });

  const otp = String(body.otp || "").trim();
  if (!otp) {
    return NextResponse.json({ error: "Verification code is required" }, { status: 400 });
  }

  const result = await verifySuperadminOtp(otp);
  if (!result.valid) {
    return NextResponse.json({ error: result.error || "Invalid verification code" }, { status: 401 });
  }

  const token = createSuperadminSessionToken();
  const response = NextResponse.json({
    success: true,
    token,
    message: "Superadmin 2FA verification successful",
  });

  setSuperadminCookies(response, token);
  return response;
}
