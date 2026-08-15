import { NextResponse } from "next/server";
import { getPendingPoll } from "../../../../lib/polls";

export async function GET() {
  const poll = await getPendingPoll();
  if (!poll) return NextResponse.json({ poll: null });
  return NextResponse.json({ poll });
}
