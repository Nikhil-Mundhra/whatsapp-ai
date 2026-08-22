import { NextResponse } from "next/server.js";
import { getConfig, saveConfig } from "../../../lib/config.js";
import { maskApiKey } from "../../../lib/connections.js";
import { hasSuperadminGroqKey } from "../../../lib/superadmin.js";

export async function GET() {
  const config = await getConfig();
  if (!config) return NextResponse.json({ config: null });
  const superadminHasGroq = await hasSuperadminGroqKey();
  const { aiApiKey, groqApiKey, visionApiKey, ...rest } = config;
  return NextResponse.json({
    config: {
      ...rest,
      aiApiKeySet: Boolean(aiApiKey),
      aiApiKeyMasked: aiApiKey ? maskApiKey(aiApiKey) : "",
      voiceNoteTranscriptionEnabled: config.voiceNoteTranscriptionEnabled !== undefined ? Boolean(config.voiceNoteTranscriptionEnabled) : true,
      groqApiKeySet: Boolean(groqApiKey),
      groqApiKeyMasked: groqApiKey ? maskApiKey(groqApiKey) : "",
      hasSuperadminGroqFallback: superadminHasGroq,
      visionEnabled: config.visionEnabled !== undefined ? Boolean(config.visionEnabled) : true,
      visionApiKeySet: Boolean(visionApiKey),
      visionApiKeyMasked: visionApiKey ? maskApiKey(visionApiKey) : "",
      visionModel: config.visionModel || "gemini-2.0-flash",
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
        voiceNoteTranscriptionEnabled: form.get("voiceNoteTranscriptionEnabled"),
        groqApiKey: form.get("groqApiKey"),
        visionEnabled: form.get("visionEnabled"),
        visionApiKey: form.get("visionApiKey"),
        visionModel: form.get("visionModel"),
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
  if (body.aiModel !== undefined) {
    const m = String(body.aiModel).trim();
    if (m) next.aiModel = m;
  }
  if (body.voiceNoteTranscriptionEnabled !== undefined) {
    next.voiceNoteTranscriptionEnabled = Boolean(body.voiceNoteTranscriptionEnabled);
  }
  if (body.groqApiKey !== undefined) {
    const key = String(body.groqApiKey).trim();
    if (key) next.groqApiKey = key;
  }
  if (body.visionEnabled !== undefined) {
    next.visionEnabled = Boolean(body.visionEnabled);
  }
  if (body.visionApiKey !== undefined) {
    const key = String(body.visionApiKey).trim();
    if (key) next.visionApiKey = key;
  }
  if (body.visionModel !== undefined) {
    const m = String(body.visionModel).trim();
    if (m) next.visionModel = m;
  }

  await saveConfig(next);
  const superadminHasGroq = await hasSuperadminGroqKey();
  return NextResponse.json({
    config: {
      ownerPhone: next.ownerPhone,
      allowedRecipients: next.allowedRecipients,
      aiModel: next.aiModel || "qwen/qwen3.8-27b",
      aiApiKeySet: Boolean(next.aiApiKey),
      aiApiKeyMasked: next.aiApiKey ? maskApiKey(next.aiApiKey) : "",
      voiceNoteTranscriptionEnabled: next.voiceNoteTranscriptionEnabled !== undefined ? Boolean(next.voiceNoteTranscriptionEnabled) : true,
      groqApiKeySet: Boolean(next.groqApiKey),
      groqApiKeyMasked: next.groqApiKey ? maskApiKey(next.groqApiKey) : "",
      hasSuperadminGroqFallback: superadminHasGroq,
      visionEnabled: next.visionEnabled !== undefined ? Boolean(next.visionEnabled) : true,
      visionApiKeySet: Boolean(next.visionApiKey),
      visionApiKeyMasked: next.visionApiKey ? maskApiKey(next.visionApiKey) : "",
      visionModel: next.visionModel || "gemini-2.0-flash",
    },
  });
}
