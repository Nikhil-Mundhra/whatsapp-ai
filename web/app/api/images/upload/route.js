import { put } from "@vercel/blob";
import { NextResponse } from "next/server.js";

export async function POST(request) {
  const { searchParams } = new URL(request.url);
  const filename = searchParams.get("filename");

  if (!filename) {
    return NextResponse.json({ error: "filename query param required" }, { status: 400 });
  }

  // Sanitize: keep only the basename, strip path traversal attempts
  const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, "_");

  // Stream directly to Vercel Blob — no temp file on disk
  const blob = await put(`chat-images/${safeName}`, request.body, {
    access: "public",
  });

  return NextResponse.json(blob);
}
