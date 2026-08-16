import { NextResponse } from "next/server";
import QRCode from "qrcode";
import { getConnection, updateConnection, getBridgeHeaders } from "../../../../../lib/connections";

const BRIDGE_URL = process.env.BRIDGE_URL || "";

async function toQrImage(code) {
  return code ? QRCode.toDataURL(code, { width: 280, margin: 1 }) : null;
}

function parseRecipients(raw) {
  if (Array.isArray(raw)) return raw.map(String).map((s) => s.trim()).filter(Boolean);
  return String(raw || "").split(",").map((s) => s.trim()).filter(Boolean);
}

export async function POST(req, props) {
  const { hash } = await props.params;
  if (!hash) return NextResponse.json({ error: "missing hash" }, { status: 400 });
  if (!BRIDGE_URL) {
    return NextResponse.json({ error: "BRIDGE_URL is not configured in Vercel" }, { status: 503 });
  }

  const conn = (await getConnection(hash)) || {};
  const incomingBody = await req.json().catch(() => ({}));

  const ownerPhone = String(incomingBody?.ownerPhone || conn.ownerPhone || "").trim();
  const allowedRecipients = parseRecipients(incomingBody?.allowedRecipients || conn.allowedRecipients || []);
  const aiApiKey = String(incomingBody?.aiApiKey || conn.aiApiKey || "").trim();
  const aiModel = String(incomingBody?.aiModel || conn.aiModel || "qwen/qwen3.8-27b").trim();

  const bodyPayload = {
    ownerPhone,
    allowedRecipients,
    aiApiKey,
    aiModel,
  };

  try {
    const res = await fetch(`${BRIDGE_URL}/api/connections/${hash}`, {
      method: "POST",
      headers: getBridgeHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(bodyPayload),
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      return NextResponse.json(
        { error: errText || "bridge failed to provision" },
        { status: 502 }
      );
    }

    if (conn.hash) {
      await updateConnection(hash, { status: "pairing" });
    }
    const data = await res.json();
    const qrImage = await toQrImage(data.qr);
    const qrAge = typeof data.qrAge === "number" ? data.qrAge : 0;
    return NextResponse.json({
      qr: qrImage,
      rawQr: data.qr,
      qrAge,
      ttl: Math.max(1, 20 - qrAge),
      linked: Boolean(data.linked),
      whatsapp: data.whatsapp || "pairing",
    });
  } catch (err) {
    console.error("[qr provision error]", err);
    return NextResponse.json(
      { error: `Unable to reach WhatsApp bridge at ${BRIDGE_URL}. Ensure VM port 8080 is open: ${err.message}` },
      { status: 502 }
    );
  }
}

export async function GET(_req, props) {
  const { hash } = await props.params;
  if (!hash) return NextResponse.json({ error: "missing hash" }, { status: 400 });
  if (!BRIDGE_URL) return NextResponse.json({ qr: null }, { status: 503 });

  try {
    const res = await fetch(`${BRIDGE_URL}/api/connections/${hash}/qr`, {
      headers: getBridgeHeaders(),
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return NextResponse.json({ qr: null });
    const data = await res.json();
    const qrImage = await toQrImage(data.qr);
    const qrAge = typeof data.qrAge === "number" ? data.qrAge : 0;
    return NextResponse.json({
      qr: qrImage,
      rawQr: data.qr,
      qrAge,
      ttl: Math.max(1, 20 - qrAge),
    });
  } catch {
    return NextResponse.json({ qr: null });
  }
}
