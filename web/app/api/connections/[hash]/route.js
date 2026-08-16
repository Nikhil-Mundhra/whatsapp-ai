import { NextResponse } from "next/server";
import { getConnection, updateConnection } from "../../../../lib/connections";

const BRIDGE_URL = (process.env.BRIDGE_URL || "http://35.255.130.255:8080").replace(/\/$/, "");

export async function GET(_req, props) {
  const { hash } = await props.params;
  if (!hash) return NextResponse.json({ error: "missing hash" }, { status: 400 });

  const conn = (await getConnection(hash)) || { hash, status: "configuring" };

  let whatsapp = conn.status === "linked" ? "linked" : "configuring";
  let error = null;
  if (BRIDGE_URL) {
    try {
      const res = await fetch(`${BRIDGE_URL}/api/connections/${hash}/status`, {
        cache: "no-store",
        signal: AbortSignal.timeout(5000),
      });
      if (res.ok) {
        const data = await res.json();
        whatsapp = data.linked ? "linked" : "configuring";
      }
    } catch (e) {
      error = "bridge unreachable";
    }
  }

  const { aiApiKey, ...rest } = conn;
  return NextResponse.json({
    connection: {
      ...rest,
      aiApiKeySet: Boolean(aiApiKey),
    },
    whatsapp,
    bridgeError: error,
  });
}

export async function PUT(req, props) {
  return handleUpdate(req, props);
}

export async function POST(req, props) {
  return handleUpdate(req, props);
}

async function handleUpdate(req, props) {
  const { hash } = await props.params;
  if (!hash) return NextResponse.json({ error: "missing hash" }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const updates = {};

  if (body.ownerPhone) updates.ownerPhone = String(body.ownerPhone).trim();
  if (body.allowedRecipients) {
    updates.allowedRecipients = Array.isArray(body.allowedRecipients)
      ? body.allowedRecipients.map((s) => String(s).trim()).filter(Boolean)
      : String(body.allowedRecipients).split(",").map((s) => s.trim()).filter(Boolean);
  }
  if (body.aiApiKey) updates.aiApiKey = String(body.aiApiKey).trim();
  if (body.aiModel) updates.aiModel = String(body.aiModel).trim();

  const conn = await updateConnection(hash, updates);

  // Sync with multi-tenant bridge
  if (BRIDGE_URL) {
    try {
      await fetch(`${BRIDGE_URL}/api/connections/${hash}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ownerPhone: conn.ownerPhone,
          allowedRecipients: conn.allowedRecipients,
          aiApiKey: conn.aiApiKey,
          aiModel: conn.aiModel,
        }),
        signal: AbortSignal.timeout(6000),
      });
    } catch (err) {
      console.warn("Failed to notify bridge of updated config", err);
    }
  }

  const { aiApiKey, ...rest } = conn;
  return NextResponse.json({
    success: true,
    connection: {
      ...rest,
      aiApiKeySet: Boolean(aiApiKey),
    },
  });
}
