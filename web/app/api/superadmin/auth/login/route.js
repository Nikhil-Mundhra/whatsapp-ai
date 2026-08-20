import { NextResponse } from "next/server.js";
import {
  verifySuperadminSecret,
  isSuperadmin2FARequired,
  sendSuperadminOtp,
  createSuperadminSessionToken,
  setSuperadminCookies,
} from "../../../../../lib/superadmin.js";

export async function POST(req) {
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid request body" }, { status: 400 });

  const password = String(body.password || "").trim();
  if (!password) {
    return NextResponse.json({ error: "Master password is required" }, { status: 400 });
  }

  // Get client identifier for rate limiting (x-forwarded-for or IP)
  const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "admin_client";
  const authResult = verifySuperadminSecret(password, clientIp);

  if (!authResult.valid) {
    return NextResponse.json({ error: authResult.error }, { status: 401 });
  }

  // Check if 2FA (WhatsApp OTP) is required
  if (isSuperadmin2FARequired()) {
    try {
      const otpRes = await sendSuperadminOtp();
      return NextResponse.json({
        require2fa: true,
        maskedPhone: otpRes.maskedPhone,
        expiresAt: otpRes.expiresAt,
        devOtp: otpRes.devOtp,
        message: "2FA verification code sent to your WhatsApp",
      });
    } catch (err) {
      return NextResponse.json(
        { error: `Failed to dispatch 2FA code: ${err.message}` },
        { status: 500 }
      );
    }
  }

  // Single-factor fallback: mint token directly
  const token = createSuperadminSessionToken();
  const response = NextResponse.json({
    success: true,
    token,
    message: "Superadmin authentication successful",
  });

  setSuperadminCookies(response, token);
  return response;
}
