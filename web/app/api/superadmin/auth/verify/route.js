import { NextResponse } from "next/server.js";
import { verifySuperadminSession } from "../../../../../lib/superadmin.js";

export async function GET(req) {
  const isValid = await verifySuperadminSession(req);
  if (!isValid) {
    return NextResponse.json({ authenticated: false, error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json({ authenticated: true, role: "superadmin" });
}

export async function POST(req) {
  const isValid = await verifySuperadminSession(req);
  if (!isValid) {
    return NextResponse.json({ authenticated: false, error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json({ authenticated: true, role: "superadmin" });
}
