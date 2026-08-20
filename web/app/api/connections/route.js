import { NextResponse } from "next/server.js";
import { createConnection, createSessionForConnection } from "../../../lib/connections.js";
import { setAuthCookies } from "../../../lib/jwt.js";
import { getActiveCoupon } from "../../../lib/config.js";

export async function POST(req) {
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "invalid body" }, { status: 400 });

  const activeCoupon = (await getActiveCoupon()).trim().toLowerCase();
  const providedCoupon = String(body.coupon || "").trim().toLowerCase();

  if (providedCoupon !== activeCoupon) {
    return NextResponse.json(
      { error: "invalid coupon. Contact wa.me/+917060410033 to get one." },
      { status: 403 }
    );
  }

  const ownerPhone = String(body.ownerPhone || "").trim();
  const allowedRecipients = Array.isArray(body.allowedRecipients)
    ? body.allowedRecipients.map((s) => String(s).trim()).filter(Boolean)
    : String(body.allowedRecipients || "").split(",").map((s) => s.trim()).filter(Boolean);
  const aiApiKey = String(body.aiApiKey || "").trim();
  const aiModel = String(body.aiModel || "").trim();

  if (!ownerPhone || !allowedRecipients.length || !aiApiKey) {
    return NextResponse.json(
      { error: "ownerPhone, allowedRecipients and aiApiKey are required" },
      { status: 400 }
    );
  }

  const conn = await createConnection({
    ownerPhone,
    allowedRecipients,
    aiApiKey,
    aiModel,
  });

  const session = await createSessionForConnection(conn.hash);

  const response = NextResponse.json(
    { hash: conn.hash, connection: conn, token: session.token },
    { status: 201 }
  );

  if (session.token) {
    setAuthCookies(response, session.token, conn.hash);
  }

  return response;
}
