import { NextResponse } from "next/server.js";
import { getPendingPoll } from "../../../../lib/polls.js";

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const hash = searchParams.get("hash") || "default";
  const poll = await getPendingPoll(hash);
  if (!poll) return NextResponse.json({ poll: null });
  return NextResponse.json({ poll });
}
