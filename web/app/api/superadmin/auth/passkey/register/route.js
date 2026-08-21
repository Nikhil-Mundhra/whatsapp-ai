import { NextResponse } from "next/server.js";
import { verifySuperadminSession } from "../../../../../../lib/superadmin.js";
import {
  generateChallenge,
  saveChallenge,
  verifyAndConsumeChallenge,
  parseCosePublicKey,
  savePasskey,
  spkiToPem,
} from "../../../../../../lib/passkeys.js";

/**
 * GET /api/superadmin/auth/passkey/register
 * Generates a registration challenge and WebAuthn options.
 * Requires active superadmin session.
 */
export async function GET(req) {
  const isAuthed = await verifySuperadminSession(req);
  if (!isAuthed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const rpId = url.hostname;

  const challenge = generateChallenge();
  await saveChallenge("registration", challenge, { rpId });

  return NextResponse.json({
    challenge,
    rp: {
      name: "WhatsApp AI Take-Over Superadmin",
      id: rpId,
    },
    user: {
      id: Buffer.from("superadmin").toString("base64url"),
      name: "superadmin",
      displayName: "Superadmin Owner",
    },
    pubKeyCredParams: [
      { type: "public-key", alg: -7 }, // ES256 (P-256)
      { type: "public-key", alg: -257 }, // RS256
    ],
    authenticatorSelection: {
      residentKey: "preferred",
      userVerification: "preferred",
    },
    timeout: 60000,
    attestation: "none",
  });
}

/**
 * POST /api/superadmin/auth/passkey/register
 * Verifies attestation and saves the registered device.
 * Requires active superadmin session.
 */
export async function POST(req) {
  const isAuthed = await verifySuperadminSession(req);
  if (!isAuthed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  if (!body || !body.id || !body.rawId || !body.response) {
    return NextResponse.json({ error: "Invalid registration payload" }, { status: 400 });
  }

  const { id, response: credResponse, name, transports } = body;
  const { clientDataJSON, attestationObject, publicKey: directPublicKeySpki } = credResponse;

  if (!clientDataJSON) {
    return NextResponse.json({ error: "Missing clientDataJSON" }, { status: 400 });
  }

  // 1. Decode clientDataJSON
  let clientData;
  try {
    const raw = Buffer.from(clientDataJSON, "base64url").toString("utf8");
    clientData = JSON.parse(raw);
  } catch (err) {
    return NextResponse.json({ error: "Malformed clientDataJSON" }, { status: 400 });
  }

  if (clientData.type !== "webauthn.create") {
    return NextResponse.json({ error: `Invalid clientData type: ${clientData.type}` }, { status: 400 });
  }

  // 2. Verify challenge
  const challengeCheck = await verifyAndConsumeChallenge("registration", clientData.challenge);
  if (!challengeCheck.valid) {
    return NextResponse.json({ error: challengeCheck.error }, { status: 400 });
  }

  // 3. Extract public key in PEM format
  let publicKeyPem = null;

  // Direct SPKI format if provided by browser getPublicKey()
  if (directPublicKeySpki) {
    publicKeyPem = spkiToPem(Buffer.from(directPublicKeySpki, "base64url"));
  }

  // Parse attestationObject authData if PEM not yet resolved
  if (!publicKeyPem && attestationObject) {
    try {
      const attBuffer = Buffer.from(attestationObject, "base64url");
      const parsed = parseCosePublicKey(attBuffer);
      if (parsed.publicKeyPem) {
        publicKeyPem = parsed.publicKeyPem;
      }
    } catch (err) {
      console.warn("Could not parse COSE from attestation:", err.message);
    }
  }

  if (!publicKeyPem) {
    return NextResponse.json(
      { error: "Could not extract valid public key from authenticator response" },
      { status: 400 }
    );
  }

  // 4. Save enrolled passkey
  const deviceName = name || "Apple Device (Touch ID / Face ID)";
  const saved = await savePasskey({
    id,
    publicKeyPem,
    name: deviceName,
    createdAt: Date.now(),
    transports: Array.isArray(transports) ? transports : ["internal"],
  });

  return NextResponse.json({
    success: true,
    message: `Passkey '${deviceName}' registered successfully`,
    passkey: {
      id,
      name: deviceName,
      createdAt: Date.now(),
    },
  });
}
