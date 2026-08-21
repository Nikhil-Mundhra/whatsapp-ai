import { NextResponse } from "next/server.js";
import { getConfig, saveConfig } from "../../../lib/config.js";
import { maskApiKey } from "../../../lib/connections.js";

export async function GET() {
  const config = await getConfig();
  if (!config) return NextResponse.json({ config: null });
  const { aiApiKey, ...rest } = config;
  return NextResponse.json({
    config: {
      ...rest,
      aiApiKeySet: Boolean(aiApiKey),
      aiApiKeyMasked: aiApiKey ? maskApiKey(aiApiKey) : "",
    },
  });
}

export async function POST(req) {
  const contentType = req.headers.get("content-type") || "";
  let body = null;
  if (contentType.includes("application/json")) {
    body = await req.json().catch(() => null);
  } else {
    const form = await req.formData().catch(() => null);
    if (form) {
      body = {
        ownerPhone: form.get("ownerPhone"),
        allowedRecipients: form.get("allowedRecipients"),
        aiApiKey: form.get("aiApiKey"),
      };
    }
  }
  if (!body) return NextResponse.json({ error: "invalid body" }, { status: 400 });

  const current = (await getConfig()) || {};
  const next = { ...current };

  if (body.ownerPhone !== undefined) next.ownerPhone = String(body.ownerPhone).trim();
  if (body.allowedRecipients !== undefined) {
    const list = Array.isArray(body.allowedRecipients)
      ? body.allowedRecipients
      : String(body.allowedRecipients).split(",").map((s) => s.trim());
    next.allowedRecipients = list.filter(Boolean);
  }
  if (body.aiApiKey !== undefined) {
    const key = String(body.aiApiKey).trim();
    if (key) next.aiApiKey = key;
  }

  await saveConfig(next);
  return NextResponse.json({
    config: {
      ownerPhone: next.ownerPhone,
      allowedRecipients: next.allowedRecipients,
      aiApiKeySet: Boolean(next.aiApiKey),
      aiApiKeyMasked: next.aiApiKey ? maskApiKey(next.aiApiKey) : "",
    },
  });
}
