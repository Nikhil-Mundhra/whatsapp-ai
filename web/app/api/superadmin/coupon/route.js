import { NextResponse } from "next/server.js";
import { verifySuperadminSession } from "../../../../lib/superadmin.js";
import { getActiveCoupon, setActiveCoupon, generateCouponCode } from "../../../../lib/config.js";

export async function GET(req) {
  const isAuthed = await verifySuperadminSession(req);
  if (!isAuthed) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const coupon = await getActiveCoupon();
  return NextResponse.json({ coupon });
}

export async function POST(req) {
  const isAuthed = await verifySuperadminSession(req);
  if (!isAuthed) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  let newCoupon = body.coupon ? String(body.coupon).trim().toUpperCase() : generateCouponCode();

  if (!newCoupon) {
    newCoupon = generateCouponCode();
  }

  const saved = await setActiveCoupon(newCoupon);
  return NextResponse.json({ success: true, coupon: saved });
}
