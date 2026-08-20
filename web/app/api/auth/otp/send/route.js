import { NextResponse } from "next/server.js";
import { sendConnectionOtp } from "../../../../../lib/connections.js";

export async function POST(req) {
  const body = await req.json().catch(() => ({}));
  const cleanHash = String(body.hash || "").trim().toUpperCase();

  if (!cleanHash) {
    return NextResponse.json({ error: "hash is required" }, { status: 400 });
  }

  try {
    const result = await sendConnectionOtp(cleanHash);
    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    const status = err.message.includes("not found") ? 404 : 400;
    return NextResponse.json({ error: err.message }, { status });
  }
}
