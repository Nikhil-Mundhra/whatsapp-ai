import { NextResponse } from "next/server";
import { expirePoll } from "../../../../../lib/polls";

export async function POST(req, props) {
  const { id } = await props.params;
  const hash = req.nextUrl.searchParams.get("hash") || "default";
  const poll = await expirePoll(hash, id);
  if (!poll) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ poll });
}
