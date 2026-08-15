import { NextResponse } from "next/server";
import { getPoll, voteOnPoll } from "../../../../lib/polls";

export async function GET(req, props) {
  const { id } = await props.params;
  const hash = req.nextUrl.searchParams.get("hash") || "default";
  const poll = await getPoll(hash, id);
  if (!poll) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ poll });
}

export async function POST(req, props) {
  const { id } = await props.params;
  const hash = req.nextUrl.searchParams.get("hash") || "default";
  const contentType = req.headers.get("content-type") || "";
  let option = null;
  let source = "api";
  if (contentType.includes("application/json")) {
    const body = await req.json().catch(() => null);
    option = body?.option;
    source = body?.source || "api";
  } else {
    const form = await req.formData().catch(() => null);
    option = form?.get("option");
    source = "panel";
  }

  const poll = await getPoll(hash, id);
  if (!poll) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (poll.status === "answered") return NextResponse.json({ poll });
  if (!option) {
    return NextResponse.json({ error: "option is required" }, { status: 400 });
  }

  const updated = await voteOnPoll(hash, id, option, source);
  return NextResponse.json({ poll: updated });
}
