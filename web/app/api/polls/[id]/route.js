import { NextResponse } from "next/server.js";
import { getPoll, voteOnPoll } from "../../../../lib/polls.js";
import { getBridgeHeaders, getBridgeUrl } from "../../../../lib/connections.js";

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
  let contact = "";

  if (contentType.includes("application/json")) {
    const body = await req.json().catch(() => null);
    option = body?.option;
    source = body?.source || "api";
    contact = body?.contact || "";
  } else {
    const form = await req.formData().catch(() => null);
    option = form?.get("option");
    contact = form?.get("contact") || "";
    source = "panel";
  }

  const poll = await getPoll(hash, id);
  if (!poll) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (poll.status === "answered") return NextResponse.json({ poll });
  if (!option) {
    return NextResponse.json({ error: "option is required" }, { status: 400 });
  }

  const targetContact = contact || poll.contact || "";

  // 1. Update poll in KV store
  const updated = await voteOnPoll(hash, id, option, source);

  // 2. Notify WhatsApp Bridge to activate grant & trigger immediate reply
  const BRIDGE_URL = getBridgeUrl();
  if (BRIDGE_URL && hash && hash !== "default") {
    try {
      await fetch(`${BRIDGE_URL}/api/connections/${hash}/grant`, {
        method: "POST",
        headers: getBridgeHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          option,
          contact: targetContact,
        }),
        signal: AbortSignal.timeout(6000),
      });
    } catch (err) {
      console.warn("Failed to notify bridge of poll grant:", err.message);
    }
  }

  return NextResponse.json({ poll: updated || poll });
}
