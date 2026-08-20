import { NextResponse } from "next/server.js";
import { sendConnectionOtp } from "../../../../../../lib/connections.js";

export async function POST(req, props) {
  const { hash } = await props.params;
  const cleanHash = String(hash || "").trim().toUpperCase();

  if (!cleanHash) {
    return NextResponse.json({ error: "missing hash" }, { status: 400 });
  }

  try {
    const result = await sendConnectionOtp(cleanHash);
    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    const status = err.message.includes("not found") ? 404 : 400;
    return NextResponse.json({ error: err.message }, { status });
  }
}
