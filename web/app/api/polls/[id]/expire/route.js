import { NextResponse } from "next/server";
import { expirePoll } from "../../../../../lib/polls";

export async function POST(_req, { params }) {
  const poll = await expirePoll(params.id);
  if (!poll) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ poll });
}
