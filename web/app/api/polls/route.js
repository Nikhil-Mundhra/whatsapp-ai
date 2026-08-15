import { NextResponse } from "next/server";
import { createPoll, listPolls } from "../../../lib/polls";

export async function GET() {
  const polls = await listPolls(100);
  return NextResponse.json({ polls });
}

export async function POST(req) {
  const body = await req.json().catch(() => null);
  if (!body || !body.id || !body.question || !Array.isArray(body.options)) {
    return NextResponse.json({ error: "id, question and options are required" }, { status: 400 });
  }
  const poll = {
    id: body.id,
    contact: body.contact || "",
    contactDisplay: body.contactDisplay || body.contact || "Someone",
    question: body.question,
    options: body.options,
    selectableCount: body.selectableCount ?? 1,
    createdAt: body.createdAt ?? Date.now(),
    status: "pending",
  };
  await createPoll(poll);
  return NextResponse.json({ poll }, { status: 201 });
}
