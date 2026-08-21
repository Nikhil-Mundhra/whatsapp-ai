import { NextResponse } from "next/server.js";
import { verifySuperadminSession } from "../../../../../lib/superadmin.js";
import { getPasskeys, deletePasskey } from "../../../../../lib/passkeys.js";

/**
 * GET /api/superadmin/auth/passkey
 * Lists all registered Passkeys/Touch ID credentials.
 * Requires active superadmin session.
 */
export async function GET(req) {
  const isAuthed = await verifySuperadminSession(req);
  if (!isAuthed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const passkeys = await getPasskeys();
  const safeList = passkeys.map((p) => ({
    id: p.id,
    idMasked: p.id.length > 12 ? `${p.id.slice(0, 6)}••••${p.id.slice(-4)}` : "••••••••",
    name: p.name || "Apple Device (Touch ID / Face ID)",
    createdAt: p.createdAt,
    lastUsedAt: p.lastUsedAt,
    counter: p.counter || 0,
    transports: p.transports || ["internal"],
  }));

  return NextResponse.json({
    passkeys: safeList,
    total: safeList.length,
  });
}

/**
 * DELETE /api/superadmin/auth/passkey
 * Removes a registered passkey by ID.
 * Requires active superadmin session.
 */
export async function DELETE(req) {
  const isAuthed = await verifySuperadminSession(req);
  if (!isAuthed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  if (!body || !body.id) {
    return NextResponse.json({ error: "Passkey ID is required" }, { status: 400 });
  }

  const updated = await deletePasskey(body.id);
  return NextResponse.json({
    success: true,
    message: "Passkey deleted successfully",
    remaining: updated.length,
  });
}
