import { NextResponse } from "next/server";
import QRCode from "qrcode";
import { getConnection, updateConnection } from "../../../../../lib/connections";

const BRIDGE_URL = process.env.BRIDGE_URL || "";

async function toQrImage(code) {
  return code ? QRCode.toDataURL(code, { width: 280, margin: 1 }) : null;
}

export async function POST(_req, props) {
  const { hash } = await props.params;
  const conn = await getConnection(hash);
  if (!conn) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (!BRIDGE_URL) {
    return NextResponse.json({ error: "bridge not configured" }, { status: 503 });
  }

  const res = await fetch(`${BRIDGE_URL}/api/connections/${hash}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ownerPhone: conn.ownerPhone,
      allowedRecipients: conn.allowedRecipients,
    }),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) {
    return NextResponse.json({ error: "bridge failed to provision" }, { status: 502 });
  }

  await updateConnection(hash, { status: "pairing" });
  const data = await res.json();
  const qrImage = await toQrImage(data.qr);
  return NextResponse.json({ qr: qrImage, linked: Boolean(data.linked), whatsapp: data.whatsapp || "pairing" });
}

export async function GET(_req, props) {
  const { hash } = await props.params;
  const conn = await getConnection(hash);
  if (!conn) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (!BRIDGE_URL) return NextResponse.json({ qr: null }, { status: 503 });

  const res = await fetch(`${BRIDGE_URL}/api/connections/${hash}/qr`, {
    cache: "no-store",
    signal: AbortSignal.timeout(5000),
  });
  const data = await res.json();
  const qrImage = await toQrImage(data.qr);
  return NextResponse.json({ qr: qrImage });
}
