import { NextResponse } from "next/server";
import { createConnection } from "../../../lib/connections";

export async function POST(req) {
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "invalid body" }, { status: 400 });

  const expectedCoupon = (process.env.COUPON || "coupon").trim().toLowerCase();
  const providedCoupon = String(body.coupon || "").trim().toLowerCase();
  if (providedCoupon !== expectedCoupon) {
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
  });

  return NextResponse.json({ hash: conn.hash, connection: conn }, { status: 201 });
}
