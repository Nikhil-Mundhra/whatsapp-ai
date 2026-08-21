import { randomBytes, createHash, createVerify, createPublicKey } from "crypto";
import { kv } from "./polls.js";

const PASSKEYS_KV_KEY = "superadmin:passkeys";
const PASSKEY_CHALLENGE_PREFIX = "superadmin:passkey_challenge:";
const CHALLENGE_TTL_SECONDS = 300; // 5 minutes

// In-memory fallbacks for development / non-KV environments
globalThis.__superadminPasskeyChallenges = globalThis.__superadminPasskeyChallenges || new Map();
globalThis.__superadminPasskeysFallback = globalThis.__superadminPasskeysFallback || [];

/**
 * Standard ASN.1 SPKI DER prefix for ECDSA P-256 (prime256v1 / secp256r1)
 * Hex: 30 59 30 13 06 07 2a 86 48 ce 3d 02 01 06 08 2a 86 48 ce 3d 03 01 07 03 42 00
 */
const ECDSA_P256_SPKI_PREFIX = Buffer.from(
  "3059301306072a8648ce3d020106082a8648ce3d030107034200",
  "hex"
);

/**
 * Converts uncompressed P-256 coordinates (x, y) into PEM public key format.
 */
export function ecPointToPem(xBuffer, yBuffer) {
  const uncompressedPoint = Buffer.concat([Buffer.from([0x04]), xBuffer, yBuffer]);
  const spkiDer = Buffer.concat([ECDSA_P256_SPKI_PREFIX, uncompressedPoint]);
  const base64 = spkiDer.toString("base64");
  const formatted = base64.match(/.{1,64}/g)?.join("\n") || base64;
  return `-----BEGIN PUBLIC KEY-----\n${formatted}\n-----END PUBLIC KEY-----`;
}

/**
 * Converts SPKI DER buffer to standard PEM public key.
 */
export function spkiToPem(spkiBuffer) {
  const base64 = Buffer.isBuffer(spkiBuffer)
    ? spkiBuffer.toString("base64")
    : Buffer.from(spkiBuffer).toString("base64");
  const formatted = base64.match(/.{1,64}/g)?.join("\n") || base64;
  return `-----BEGIN PUBLIC KEY-----\n${formatted}\n-----END PUBLIC KEY-----`;
}

/**
 * Parses basic CBOR to extract COSE ECDSA P-256 or RSA key parameters from authData.
 */
export function parseCosePublicKey(authDataBuffer) {
  if (!Buffer.isBuffer(authDataBuffer) || authDataBuffer.length < 37) {
    throw new Error("Invalid authenticatorData buffer");
  }

  // 32 bytes rpIdHash + 1 byte flags + 4 bytes signCount
  const flags = authDataBuffer[32];
  const hasAttestedCredentialData = Boolean(flags & 0x40);

  if (!hasAttestedCredentialData) {
    throw new Error("authenticatorData does not contain attested credential data");
  }

  // attestedCredentialData layout:
  // 16 bytes aaguid
  // 2 bytes credentialIdLength (big endian)
  // L bytes credentialId
  // Remaining bytes: COSE public key
  let offset = 37; // 32 + 1 + 4
  offset += 16; // skip aaguid

  if (authDataBuffer.length < offset + 2) {
    throw new Error("Malformed credential data length");
  }

  const credentialIdLength = authDataBuffer.readUInt16BE(offset);
  offset += 2;

  const credentialIdBuffer = authDataBuffer.subarray(offset, offset + credentialIdLength);
  offset += credentialIdLength;

  const coseBuffer = authDataBuffer.subarray(offset);

  // Parse COSE Map for ECDSA P-256:
  // Key 1: kty (2 = EC2)
  // Key 3: alg (-7 = ES256)
  // Key -1: crv (1 = P-256)
  // Key -2: x coordinate (32 bytes)
  // Key -3: y coordinate (32 bytes)
  // We locate x (32 bytes after 0x20 / 0x58 0x20) and y (32 bytes after 0x21 / 0x58 0x20)
  let xBuffer = null;
  let yBuffer = null;

  for (let i = 0; i < coseBuffer.length - 34; i++) {
    // Look for -2 (0x21) followed by byte string of length 32 (0x58 0x20)
    if (coseBuffer[i] === 0x21 && coseBuffer[i + 1] === 0x58 && coseBuffer[i + 2] === 0x20) {
      xBuffer = coseBuffer.subarray(i + 3, i + 3 + 32);
    }
    // Look for -3 (0x22) followed by byte string of length 32 (0x58 0x20)
    if (coseBuffer[i] === 0x22 && coseBuffer[i + 1] === 0x58 && coseBuffer[i + 2] === 0x20) {
      yBuffer = coseBuffer.subarray(i + 3, i + 3 + 32);
    }
  }

  let pem = null;
  if (xBuffer && yBuffer && xBuffer.length === 32 && yBuffer.length === 32) {
    pem = ecPointToPem(xBuffer, yBuffer);
  }

  return {
    credentialId: credentialIdBuffer.toString("base64url"),
    publicKeyPem: pem,
    rawCose: coseBuffer.toString("base64url"),
  };
}

/**
 * Generates a cryptographically random 32-byte challenge.
 */
export function generateChallenge() {
  return randomBytes(32).toString("base64url");
}

/**
 * Saves an active challenge for registration or authentication.
 */
export async function saveChallenge(type, challenge, meta = {}) {
  const payload = {
    challenge,
    createdAt: Date.now(),
    expiresAt: Date.now() + CHALLENGE_TTL_SECONDS * 1000,
    ...meta,
  };

  try {
    if (kv && typeof kv.set === "function") {
      await kv.set(`${PASSKEY_CHALLENGE_PREFIX}${type}:${challenge}`, payload, {
        ex: CHALLENGE_TTL_SECONDS,
      });
      return payload;
    }
  } catch (err) {
    console.warn("KV saveChallenge fallback:", err.message);
  }

  globalThis.__superadminPasskeyChallenges.set(`${type}:${challenge}`, payload);
  return payload;
}

/**
 * Verifies and consumes a single-use challenge.
 */
export async function verifyAndConsumeChallenge(type, challenge) {
  if (!challenge) return { valid: false, error: "Missing challenge" };

  let stored = null;
  const key = `${PASSKEY_CHALLENGE_PREFIX}${type}:${challenge}`;

  try {
    if (kv && typeof kv.get === "function") {
      stored = await kv.get(key);
      if (stored) {
        await kv.del(key);
      }
    }
  } catch (err) {
    console.warn("KV verifyChallenge fallback:", err.message);
  }

  if (!stored) {
    const memoryKey = `${type}:${challenge}`;
    stored = globalThis.__superadminPasskeyChallenges.get(memoryKey);
    if (stored) {
      globalThis.__superadminPasskeyChallenges.delete(memoryKey);
    }
  }

  if (!stored) {
    return { valid: false, error: "Challenge expired or not found. Please try again." };
  }

  if (Date.now() > stored.expiresAt) {
    return { valid: false, error: "Challenge expired. Please try again." };
  }

  return { valid: true, meta: stored };
}

/**
 * Retrieves all registered passkeys for the Superadmin.
 */
export async function getPasskeys() {
  try {
    if (kv && typeof kv.get === "function") {
      const data = await kv.get(PASSKEYS_KV_KEY);
      if (Array.isArray(data)) {
        return data;
      }
    }
  } catch (err) {
    console.warn("KV getPasskeys fallback:", err.message);
  }

  return globalThis.__superadminPasskeysFallback || [];
}

/**
 * Saves a new or updated passkey.
 */
export async function savePasskey(passkey) {
  const passkeys = await getPasskeys();
  const index = passkeys.findIndex((p) => p.id === passkey.id);

  if (index >= 0) {
    passkeys[index] = { ...passkeys[index], ...passkey };
  } else {
    passkeys.push({
      id: passkey.id,
      publicKeyPem: passkey.publicKeyPem,
      name: passkey.name || "Apple Device (Touch ID / Face ID)",
      createdAt: passkey.createdAt || Date.now(),
      lastUsedAt: passkey.lastUsedAt || null,
      counter: passkey.counter || 0,
      transports: passkey.transports || ["internal"],
    });
  }

  try {
    if (kv && typeof kv.set === "function") {
      await kv.set(PASSKEYS_KV_KEY, passkeys);
    }
  } catch (err) {
    console.warn("KV savePasskey fallback:", err.message);
  }

  globalThis.__superadminPasskeysFallback = passkeys;
  return passkeys;
}

/**
 * Deletes a registered passkey by ID.
 */
export async function deletePasskey(id) {
  const passkeys = await getPasskeys();
  const filtered = passkeys.filter((p) => p.id !== id);

  try {
    if (kv && typeof kv.set === "function") {
      await kv.set(PASSKEYS_KV_KEY, filtered);
    }
  } catch (err) {
    console.warn("KV deletePasskey fallback:", err.message);
  }

  globalThis.__superadminPasskeysFallback = filtered;
  return filtered;
}

/**
 * Verifies a WebAuthn login assertion signature.
 */
export async function verifyPasskeyAssertion({
  id,
  clientDataJSON,
  authenticatorData,
  signature,
}) {
  if (!id || !clientDataJSON || !authenticatorData || !signature) {
    return { valid: false, error: "Missing required WebAuthn authentication parameters." };
  }

  // 1. Decode clientDataJSON
  let clientData;
  try {
    const rawClientData = Buffer.from(clientDataJSON, "base64url").toString("utf8");
    clientData = JSON.parse(rawClientData);
  } catch (err) {
    return { valid: false, error: "Invalid clientDataJSON encoding." };
  }

  if (clientData.type !== "webauthn.get") {
    return { valid: false, error: `Invalid clientData type: ${clientData.type}` };
  }

  // 2. Verify challenge
  const challengeCheck = await verifyAndConsumeChallenge("login", clientData.challenge);
  if (!challengeCheck.valid) {
    return { valid: false, error: challengeCheck.error };
  }

  // 3. Find registered passkey
  const passkeys = await getPasskeys();
  const passkey = passkeys.find((p) => p.id === id);

  if (!passkey) {
    return { valid: false, error: "Passkey not recognized or not registered with this account." };
  }

  // 4. Verify user presence flag in authenticatorData (bit 0 = User Present)
  const authDataBuffer = Buffer.from(authenticatorData, "base64url");
  if (authDataBuffer.length < 37) {
    return { valid: false, error: "Malformed authenticatorData." };
  }

  const flags = authDataBuffer[32];
  const userPresent = Boolean(flags & 0x01);
  if (!userPresent) {
    return { valid: false, error: "User presence verification failed on device." };
  }

  // 5. Verify cryptographic signature:
  // Signature is calculated over: authenticatorData || SHA-256(clientDataJSON)
  const clientDataHash = createHash("sha256")
    .update(Buffer.from(clientDataJSON, "base64url"))
    .digest();
  const signatureData = Buffer.concat([authDataBuffer, clientDataHash]);
  const signatureBuffer = Buffer.from(signature, "base64url");

  try {
    const verify = createVerify("SHA256");
    verify.update(signatureData);
    const isValid = verify.verify(passkey.publicKeyPem, signatureBuffer);

    if (!isValid) {
      return { valid: false, error: "Cryptographic signature verification failed." };
    }
  } catch (err) {
    return { valid: false, error: `Signature verification error: ${err.message}` };
  }

  // 6. Update lastUsedAt and counter
  passkey.lastUsedAt = Date.now();
  const signCount = authDataBuffer.readUInt32BE(33);
  if (signCount > 0) {
    passkey.counter = signCount;
  }
  await savePasskey(passkey);

  return {
    valid: true,
    passkey,
  };
}
