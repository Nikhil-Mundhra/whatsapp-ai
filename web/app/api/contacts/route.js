import { NextResponse } from "next/server";
import { getLocalContacts } from "../../../lib/sqlite";

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q") || "";
  const limit = parseInt(searchParams.get("limit") || "100", 10);

  const contacts = getLocalContacts(q, limit);
  return NextResponse.json({ contacts });
}
