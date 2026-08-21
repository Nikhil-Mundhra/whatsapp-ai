import { NextResponse } from "next/server.js";
import {
  createSuperadminSessionToken,
  setSuperadminCookies,
} from "../../../../../../lib/superadmin.js";
import {
  generateChallenge,
  saveChallenge,
  getPasskeys,
  verifyPasskeyAssertion,
} from "../../../../../../lib/passkeys.js";

/**
 * GET /api/superadmin/auth/passkey/login
 * Generates an authentication challenge and retrieves allowed credential IDs.
 * Publicly accessible to initiate biometric login.
 */
export async function GET(req) {
  const url = new URL(req.url);
  const rpId = url.hostname;

  const challenge = generateChallenge();
  await saveChallenge("login", challenge, { rpId });

  const passkeys = await getPasskeys();
  const allowCredentials = passkeys.map((p) => ({
    id: p.id,
    type: "public-key",
    transports: p.transports || ["internal"],
  }));

  return NextResponse.json({
    challenge,
    rpId,
    timeout: 60000,
    userVerification: "preferred",
    allowCredentials,
    passkeysConfigured: passkeys.length > 0,
  });
}

/**
 * POST /api/superadmin/auth/passkey/login
 * Verifies WebAuthn assertion signature and mints authenticated session token.
 * Skips WhatsApp 2FA OTP inherently.
 */
export async function POST(req) {
  const body = await req.json().catch(() => null);
  if (!body || !body.id || !body.response) {
    return NextResponse.json({ error: "Invalid WebAuthn assertion payload" }, { status: 400 });
  }

  const { id, response: credResponse } = body;
  const { clientDataJSON, authenticatorData, signature, userHandle } = credResponse;

  // Verify cryptographic assertion
  const result = await verifyPasskeyAssertion({
    id,
    clientDataJSON,
    authenticatorData,
    signature,
    userHandle,
  });

  if (!result.valid) {
    return NextResponse.json({ error: result.error || "Passkey verification failed" }, { status: 401 });
  }

  // Issue Superadmin JWT with biometric verification flag
  const token = createSuperadminSessionToken();
  const response = NextResponse.json({
    success: true,
    token,
    message: `Authenticated via Apple Passkey (${result.passkey?.name || "Biometric Device"})`,
    passkey: {
      name: result.passkey?.name,
      lastUsedAt: result.passkey?.lastUsedAt,
    },
  });

  setSuperadminCookies(response, token);
  return response;
}
