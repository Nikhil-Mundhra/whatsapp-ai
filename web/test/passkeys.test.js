import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, createSign, createHash } from "crypto";
import { NextRequest } from "next/server.js";

import {
  generateChallenge,
  saveChallenge,
  verifyAndConsumeChallenge,
  ecPointToPem,
  spkiToPem,
  getPasskeys,
  savePasskey,
  deletePasskey,
  verifyPasskeyAssertion,
} from "../lib/passkeys.js";

import {
  createSuperadminSessionToken,
  SUPERADMIN_COOKIE_NAME,
} from "../lib/superadmin.js";

import { GET as passkeyRegisterGET, POST as passkeyRegisterPOST } from "../app/api/superadmin/auth/passkey/register/route.js";
import { GET as passkeyLoginGET, POST as passkeyLoginPOST } from "../app/api/superadmin/auth/passkey/login/route.js";
import { GET as passkeyListGET, DELETE as passkeyDELETE } from "../app/api/superadmin/auth/passkey/route.js";

test("Apple Passkeys & WebAuthn Unit Tests", async (t) => {
  // Generate EC P-256 test keypair simulating an Apple Secure Enclave Passkey
  const { publicKey: testPublicKey, privateKey: testPrivateKey } = generateKeyPairSync("ec", {
    namedCurve: "prime256v1",
  });
  const testPublicKeyPem = testPublicKey.export({ type: "spki", format: "pem" });
  const testCredentialId = "apple_passkey_cred_test_123456";

  await t.test("Challenge generation, storage, and single-use consumption", async () => {
    const challenge = generateChallenge();
    assert.ok(challenge);
    assert.ok(typeof challenge === "string");
    assert.ok(challenge.length >= 32);

    await saveChallenge("registration", challenge, { testMeta: 123 });

    // 1. First verification should succeed
    const verify1 = await verifyAndConsumeChallenge("registration", challenge);
    assert.equal(verify1.valid, true);
    assert.equal(verify1.meta.testMeta, 123);

    // 2. Second verification with same challenge should fail (single-use)
    const verify2 = await verifyAndConsumeChallenge("registration", challenge);
    assert.equal(verify2.valid, false);
  });

  await t.test("Public key PEM conversion helpers", async () => {
    const spkiDer = testPublicKey.export({ type: "spki", format: "der" });
    const pemFromSpki = spkiToPem(spkiDer);
    assert.ok(pemFromSpki.includes("BEGIN PUBLIC KEY"));
    assert.ok(pemFromSpki.includes("END PUBLIC KEY"));
  });

  await t.test("Passkey CRUD operations in storage", async () => {
    // Save passkey
    await savePasskey({
      id: testCredentialId,
      publicKeyPem: testPublicKeyPem,
      name: "MacBook Pro Touch ID",
      createdAt: Date.now(),
    });

    const passkeys = await getPasskeys();
    const found = passkeys.find((p) => p.id === testCredentialId);
    assert.ok(found);
    assert.equal(found.name, "MacBook Pro Touch ID");

    // Delete passkey
    await deletePasskey(testCredentialId);
    const passkeysAfter = await getPasskeys();
    assert.equal(passkeysAfter.some((p) => p.id === testCredentialId), false);
  });

  await t.test("verifyPasskeyAssertion validates authentic WebAuthn biometric signatures", async () => {
    // 1. Setup challenge & register passkey
    const challenge = generateChallenge();
    await saveChallenge("login", challenge);

    await savePasskey({
      id: testCredentialId,
      publicKeyPem: testPublicKeyPem,
      name: "Apple Silicon Touch ID",
    });

    // 2. Create clientDataJSON containing the challenge
    const clientDataJSON = Buffer.from(
      JSON.stringify({
        type: "webauthn.get",
        challenge: challenge,
        origin: "http://localhost:3000",
      })
    ).toString("base64url");

    // 3. Create authenticatorData (32 bytes rpIdHash + 1 byte flags with User Present = 1 + 4 bytes counter)
    const rpIdHash = createHash("sha256").update("localhost").digest();
    const flags = Buffer.from([0x01]); // UP flag
    const counter = Buffer.from([0x00, 0x00, 0x00, 0x05]); // counter 5
    const authenticatorData = Buffer.concat([rpIdHash, flags, counter]).toString("base64url");

    // 4. Sign (authenticatorData || SHA256(clientDataJSON)) with private key
    const clientDataHash = createHash("sha256").update(Buffer.from(clientDataJSON, "base64url")).digest();
    const dataToSign = Buffer.concat([Buffer.from(authenticatorData, "base64url"), clientDataHash]);

    const signer = createSign("SHA256");
    signer.update(dataToSign);
    const signature = signer.sign(testPrivateKey).toString("base64url");

    // 5. Verify valid assertion
    const result = await verifyPasskeyAssertion({
      id: testCredentialId,
      clientDataJSON,
      authenticatorData,
      signature,
    });

    assert.equal(result.valid, true);
    assert.equal(result.passkey.name, "Apple Silicon Touch ID");
    assert.equal(result.passkey.counter, 5);
  });

  await t.test("API Routes: Registration, Login, and Device Listing", async () => {
    const token = createSuperadminSessionToken();
    const authHeader = { cookie: `${SUPERADMIN_COOKIE_NAME}=${token}` };

    // 1. Unauthenticated Registration -> 401
    const unauthRegReq = new NextRequest("http://localhost/api/superadmin/auth/passkey/register");
    const unauthRegRes = await passkeyRegisterGET(unauthRegReq);
    assert.equal(unauthRegRes.status, 401);

    // 2. Authenticated Registration Challenge GET -> 200
    const regReq = new NextRequest("http://localhost/api/superadmin/auth/passkey/register", { headers: authHeader });
    const regRes = await passkeyRegisterGET(regReq);
    assert.equal(regRes.status, 200);
    const regOptions = await regRes.json();
    assert.ok(regOptions.challenge);
    assert.ok(regOptions.rp);

    // 3. Register Passkey POST -> 200
    const spkiDer = testPublicKey.export({ type: "spki", format: "der" });
    const regPostReq = new NextRequest("http://localhost/api/superadmin/auth/passkey/register", {
      method: "POST",
      headers: authHeader,
      body: JSON.stringify({
        id: "new_registered_passkey_1",
        rawId: Buffer.from("new_registered_passkey_1").toString("base64url"),
        name: "iPhone 16 Pro (Face ID)",
        response: {
          clientDataJSON: Buffer.from(
            JSON.stringify({
              type: "webauthn.create",
              challenge: regOptions.challenge,
              origin: "http://localhost:3000",
            })
          ).toString("base64url"),
          publicKey: Buffer.from(spkiDer).toString("base64url"),
        },
      }),
    });
    const regPostRes = await passkeyRegisterPOST(regPostReq);
    assert.equal(regPostRes.status, 200);
    const regPostJson = await regPostRes.json();
    assert.equal(regPostJson.success, true);

    // 4. List Passkeys GET -> 200
    const listReq = new NextRequest("http://localhost/api/superadmin/auth/passkey", { headers: authHeader });
    const listRes = await passkeyListGET(listReq);
    assert.equal(listRes.status, 200);
    const listJson = await listRes.json();
    assert.ok(listJson.passkeys.some((p) => p.id === "new_registered_passkey_1"));

    // 5. Public Passkey Login Challenge GET -> 200
    const loginChallengeReq = new NextRequest("http://localhost/api/superadmin/auth/passkey/login");
    const loginChallengeRes = await passkeyLoginGET(loginChallengeReq);
    assert.equal(loginChallengeRes.status, 200);
    const loginOptions = await loginChallengeRes.json();
    assert.ok(loginOptions.challenge);

    // 6. Sign and POST Login Assertion -> 200
    const clientDataJSON = Buffer.from(
      JSON.stringify({
        type: "webauthn.get",
        challenge: loginOptions.challenge,
        origin: "http://localhost:3000",
      })
    ).toString("base64url");

    const rpIdHash = createHash("sha256").update("localhost").digest();
    const flags = Buffer.from([0x01]);
    const counter = Buffer.from([0x00, 0x00, 0x00, 0x01]);
    const authenticatorData = Buffer.concat([rpIdHash, flags, counter]).toString("base64url");

    const clientDataHash = createHash("sha256").update(Buffer.from(clientDataJSON, "base64url")).digest();
    const dataToSign = Buffer.concat([Buffer.from(authenticatorData, "base64url"), clientDataHash]);

    const signer = createSign("SHA256");
    signer.update(dataToSign);
    const signature = signer.sign(testPrivateKey).toString("base64url");

    const loginPostReq = new NextRequest("http://localhost/api/superadmin/auth/passkey/login", {
      method: "POST",
      body: JSON.stringify({
        id: "new_registered_passkey_1",
        response: {
          clientDataJSON,
          authenticatorData,
          signature,
        },
      }),
    });
    const loginPostRes = await passkeyLoginPOST(loginPostReq);
    assert.equal(loginPostRes.status, 200);
    const loginPostJson = await loginPostRes.json();
    assert.equal(loginPostJson.success, true);
    assert.ok(loginPostJson.token);

    // 7. Delete Passkey DELETE -> 200
    const deleteReq = new NextRequest("http://localhost/api/superadmin/auth/passkey", {
      method: "DELETE",
      headers: authHeader,
      body: JSON.stringify({ id: "new_registered_passkey_1" }),
    });
    const deleteRes = await passkeyDELETE(deleteReq);
    assert.equal(deleteRes.status, 200);
  });
});
