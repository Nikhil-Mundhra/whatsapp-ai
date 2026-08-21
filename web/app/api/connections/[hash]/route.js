import { NextResponse } from "next/server.js";
import { getConnection, updateConnection, getBridgeHeaders, maskApiKey } from "../../../../lib/connections.js";

const BRIDGE_URL = (process.env.BRIDGE_URL || "http://35.255.130.255:8080").replace(/\/$/, "");

export async function GET(_req, props) {
  const { hash } = await props.params;
  if (!hash) return NextResponse.json({ error: "missing hash" }, { status: 400 });

  let conn = (await getConnection(hash)) || { hash, status: "configuring" };
  let whatsapp = conn.status === "linked" ? "linked" : "configuring";
  let bridgeStatus = null;
  let error = null;

  if (BRIDGE_URL) {
    try {
      const res = await fetch(`${BRIDGE_URL}/api/connections/${hash}/status`, {
        headers: getBridgeHeaders(),
        cache: "no-store",
        signal: AbortSignal.timeout(5000),
      });
      if (res.ok) {
        bridgeStatus = await res.json();
        whatsapp = bridgeStatus.linked ? "linked" : "configuring";

        // Auto-hydrate missing fields from bridge
        const patch = {};
        if (!conn.ownerPhone && bridgeStatus.ownerPhone) {
          patch.ownerPhone = bridgeStatus.ownerPhone;
        }
        if ((!conn.allowedRecipients || !conn.allowedRecipients.length) && bridgeStatus.allowedRecipients) {
          patch.allowedRecipients = bridgeStatus.allowedRecipients;
        }
        if (!conn.aiModel && bridgeStatus.aiModel) {
          patch.aiModel = bridgeStatus.aiModel;
        }
        if (Object.keys(patch).length > 0) {
          conn = await updateConnection(hash, patch);
        }
      }
    } catch (e) {
      error = "bridge unreachable";
    }
  }

  const { aiApiKey, ...rest } = conn || {};
  return NextResponse.json({
    connection: {
      ...rest,
      ownerPhone: conn?.ownerPhone || bridgeStatus?.ownerPhone || "",
      allowedRecipients: conn?.allowedRecipients || bridgeStatus?.allowedRecipients || [],
      aiModel: conn?.aiModel || bridgeStatus?.aiModel || "qwen/qwen3.8-27b",
      aiApiKeySet: Boolean(aiApiKey || bridgeStatus?.aiApiKeySet),
      aiApiKeyMasked: aiApiKey ? maskApiKey(aiApiKey) : (bridgeStatus?.aiApiKeySet ? "••••••••••••" : ""),
    },
    whatsapp,
    bridgeStatus,
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

  if (body.ownerPhone !== undefined) updates.ownerPhone = String(body.ownerPhone).trim();
  if (body.allowedRecipients !== undefined) {
    updates.allowedRecipients = Array.isArray(body.allowedRecipients)
      ? body.allowedRecipients
          .map((s) =>
            typeof s === "object" && s !== null
              ? (s.isGroup ? (s.name || s.jid) : (s.phone || s.jid || s.lid || s.name))
              : String(s).trim()
          )
          .filter(Boolean)
      : String(body.allowedRecipients).split(",").map((s) => s.trim()).filter(Boolean);
  }
  if (body.aiApiKey) updates.aiApiKey = String(body.aiApiKey).trim();
  if (body.aiModel) updates.aiModel = String(body.aiModel).trim();

  const conn = (await updateConnection(hash, updates)) || { hash, ...updates };

  // Sync with multi-tenant bridge
  if (BRIDGE_URL) {
    try {
      await fetch(`${BRIDGE_URL}/api/connections/${hash}`, {
        method: "POST",
        headers: getBridgeHeaders({ "Content-Type": "application/json" }),
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
      aiApiKeyMasked: aiApiKey ? maskApiKey(aiApiKey) : "",
    },
  });
}
