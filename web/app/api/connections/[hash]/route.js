import { NextResponse } from "next/server.js";
import { getConnection, updateConnection, getBridgeHeaders, maskApiKey, maskCalendarUrl, getBridgeUrl } from "../../../../lib/connections.js";
import { hasSuperadminGroqKey } from "../../../../lib/superadmin.js";

export async function GET(_req, props) {
  const BRIDGE_URL = getBridgeUrl();
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
        if (conn.voiceNoteTranscriptionEnabled === undefined && bridgeStatus.voiceNoteTranscriptionEnabled !== undefined) {
          patch.voiceNoteTranscriptionEnabled = bridgeStatus.voiceNoteTranscriptionEnabled;
        }
        if (conn.visionEnabled === undefined && bridgeStatus.visionEnabled !== undefined) {
          patch.visionEnabled = bridgeStatus.visionEnabled;
        }
        if (conn.visionModel === undefined && bridgeStatus.visionModel) {
          patch.visionModel = bridgeStatus.visionModel;
        }
        if (conn.calendarFeedUrl === undefined && bridgeStatus.calendarFeedUrl) {
          patch.calendarFeedUrl = bridgeStatus.calendarFeedUrl;
        }
        if (conn.timezone === undefined && bridgeStatus.timezone) {
          patch.timezone = bridgeStatus.timezone;
        }
        if (conn.searchEnabled === undefined && bridgeStatus.searchEnabled !== undefined) {
          patch.searchEnabled = bridgeStatus.searchEnabled;
        }
        if (Object.keys(patch).length > 0) {
          conn = await updateConnection(hash, patch);
        }
      }
    } catch (e) {
      error = "bridge unreachable";
    }
  }

  const superadminHasGroq = await hasSuperadminGroqKey();
  const { aiApiKey, groqApiKey, visionApiKey, ...rest } = conn || {};
  const calUrl = conn?.calendarFeedUrl || bridgeStatus?.calendarFeedUrl || "";
  return NextResponse.json({
    connection: {
      ...rest,
      ownerPhone: conn?.ownerPhone || bridgeStatus?.ownerPhone || "",
      allowedRecipients: conn?.allowedRecipients || bridgeStatus?.allowedRecipients || [],
      aiModel: conn?.aiModel || bridgeStatus?.aiModel || "qwen/qwen3.8-27b",
      aiApiKeySet: Boolean(aiApiKey || bridgeStatus?.aiApiKeySet),
      aiApiKeyMasked: aiApiKey ? maskApiKey(aiApiKey) : (bridgeStatus?.aiApiKeySet ? "••••••••••••" : ""),

      // Voice Note Transcription (Phase 4.1)
      voiceNoteTranscriptionEnabled: conn?.voiceNoteTranscriptionEnabled !== undefined
        ? Boolean(conn.voiceNoteTranscriptionEnabled)
        : (bridgeStatus?.voiceNoteTranscriptionEnabled !== undefined ? Boolean(bridgeStatus.voiceNoteTranscriptionEnabled) : true),
      groqApiKeySet: Boolean(groqApiKey || bridgeStatus?.groqApiKeySet),
      groqApiKeyMasked: groqApiKey ? maskApiKey(groqApiKey) : (bridgeStatus?.groqApiKeySet ? "••••••••••••" : ""),
      hasSuperadminGroqFallback: superadminHasGroq,

      // Multimodal Vision (Phase 4.2)
      visionEnabled: conn?.visionEnabled !== undefined
        ? Boolean(conn.visionEnabled)
        : (bridgeStatus?.visionEnabled !== undefined ? Boolean(bridgeStatus.visionEnabled) : true),
      visionApiKeySet: Boolean(visionApiKey || bridgeStatus?.visionApiKeySet),
      visionApiKeyMasked: visionApiKey ? maskApiKey(visionApiKey) : (bridgeStatus?.visionApiKeySet ? "••••••••••••" : ""),
      visionModel: conn?.visionModel || bridgeStatus?.visionModel || "gemini-2.0-flash",

      // Calendar & Search Grounding (Phase 5)
      calendarFeedUrl: calUrl,
      calendarFeedUrlSet: Boolean(calUrl),
      calendarFeedUrlMasked: calUrl ? maskCalendarUrl(calUrl) : "",
      timezone: conn?.timezone || bridgeStatus?.timezone || "UTC",
      searchEnabled: conn?.searchEnabled !== undefined
        ? Boolean(conn.searchEnabled)
        : (bridgeStatus?.searchEnabled !== undefined ? Boolean(bridgeStatus.searchEnabled) : true),
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
  if (body.aiApiKey !== undefined) {
    const k = String(body.aiApiKey).trim();
    if (k) updates.aiApiKey = k;
  }
  if (body.aiModel) updates.aiModel = String(body.aiModel).trim();

  // Voice Note Transcription (Phase 4.1)
  if (body.voiceNoteTranscriptionEnabled !== undefined) {
    updates.voiceNoteTranscriptionEnabled = Boolean(body.voiceNoteTranscriptionEnabled);
  }
  if (body.groqApiKey !== undefined) {
    const k = String(body.groqApiKey).trim();
    if (k) updates.groqApiKey = k;
  }

  // Multimodal Vision (Phase 4.2)
  if (body.visionEnabled !== undefined) {
    updates.visionEnabled = Boolean(body.visionEnabled);
  }
  if (body.visionApiKey !== undefined) {
    const k = String(body.visionApiKey).trim();
    if (k) updates.visionApiKey = k;
  }
  if (body.visionModel !== undefined) {
    const m = String(body.visionModel).trim();
    if (m) updates.visionModel = m;
  }

  // Calendar & Search (Phase 5)
  if (body.calendarFeedUrl !== undefined) {
    updates.calendarFeedUrl = String(body.calendarFeedUrl).trim();
  }
  if (body.timezone !== undefined) {
    updates.timezone = String(body.timezone).trim();
  }
  if (body.searchEnabled !== undefined) {
    updates.searchEnabled = Boolean(body.searchEnabled);
  }

  const conn = (await updateConnection(hash, updates)) || { hash, ...updates };
  const BRIDGE_URL = getBridgeUrl();

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
          voiceNoteTranscriptionEnabled: conn.voiceNoteTranscriptionEnabled,
          groqApiKey: conn.groqApiKey,
          visionEnabled: conn.visionEnabled,
          visionApiKey: conn.visionApiKey,
          visionModel: conn.visionModel,
          calendarFeedUrl: conn.calendarFeedUrl,
          timezone: conn.timezone,
          searchEnabled: conn.searchEnabled,
        }),
        signal: AbortSignal.timeout(6000),
      });
    } catch (err) {
      console.warn("Failed to notify bridge of updated config", err);
    }
  }

  const superadminHasGroq = await hasSuperadminGroqKey();
  const { aiApiKey, groqApiKey, visionApiKey, ...rest } = conn;
  return NextResponse.json({
    success: true,
    connection: {
      ...rest,
      aiApiKeySet: Boolean(aiApiKey),
      aiApiKeyMasked: aiApiKey ? maskApiKey(aiApiKey) : "",
      voiceNoteTranscriptionEnabled: conn.voiceNoteTranscriptionEnabled !== undefined ? Boolean(conn.voiceNoteTranscriptionEnabled) : true,
      groqApiKeySet: Boolean(groqApiKey),
      groqApiKeyMasked: groqApiKey ? maskApiKey(groqApiKey) : "",
      calendarFeedUrl: conn.calendarFeedUrl || "",
      calendarFeedUrlSet: Boolean(conn.calendarFeedUrl),
      calendarFeedUrlMasked: conn.calendarFeedUrl ? maskCalendarUrl(conn.calendarFeedUrl) : "",
      timezone: conn.timezone || "UTC",
      searchEnabled: conn.searchEnabled !== undefined ? Boolean(conn.searchEnabled) : true,
      hasSuperadminGroqFallback: superadminHasGroq,
      visionEnabled: conn.visionEnabled !== undefined ? Boolean(conn.visionEnabled) : true,
      visionApiKeySet: Boolean(visionApiKey),
      visionApiKeyMasked: visionApiKey ? maskApiKey(visionApiKey) : "",
      visionModel: conn.visionModel || "gemini-2.0-flash",
    },
  });
}
