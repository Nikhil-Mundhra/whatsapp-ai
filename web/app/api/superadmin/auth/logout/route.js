import { NextResponse } from "next/server.js";
import { clearSuperadminCookies } from "../../../../../lib/superadmin.js";

export async function POST() {
  const response = NextResponse.json({ success: true, message: "Logged out" });
  clearSuperadminCookies(response);
  return response;
}
