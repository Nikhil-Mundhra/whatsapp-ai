import { NextResponse } from "next/server";

export async function POST(req) {
  const body = await req.json().catch(() => ({}));
  const apiKey = String(body.apiKey || "").trim();

  if (!apiKey) {
    return NextResponse.json({ valid: false, error: "API key is required" }, { status: 400 });
  }

  // 1. Check if Gemini / Google AI key (format AIza...)
  if (apiKey.startsWith("AIza")) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`,
        { signal: AbortSignal.timeout(6000) }
      );
      if (res.ok) {
        return NextResponse.json({ valid: true, provider: "Google Gemini" });
      }
      return NextResponse.json({ valid: false, error: "Invalid Gemini API Key or permission denied" });
    } catch (e) {
      return NextResponse.json({ valid: false, error: "Unable to reach Gemini API" });
    }
  }

  // 2. Check OpenAI API key (format sk-...)
  if (apiKey.startsWith("sk-proj-") || apiKey.startsWith("sk-")) {
    try {
      const res = await fetch("https://api.openai.com/v1/models", {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(6000),
      });
      if (res.ok) {
        return NextResponse.json({ valid: true, provider: "OpenAI" });
      }
      return NextResponse.json({ valid: false, error: "Invalid OpenAI API Key" });
    } catch (e) {
      return NextResponse.json({ valid: false, error: "Unable to reach OpenAI API" });
    }
  }

  // 3. Check Anthropic / Claude API key (format sk-ant-...)
  if (apiKey.startsWith("sk-ant-")) {
    try {
      const res = await fetch("https://api.anthropic.com/v1/models", {
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        signal: AbortSignal.timeout(6000),
      });
      if (res.ok) {
        return NextResponse.json({ valid: true, provider: "Anthropic Claude" });
      }
      return NextResponse.json({ valid: false, error: "Invalid Anthropic API Key" });
    } catch (e) {
      return NextResponse.json({ valid: false, error: "Unable to reach Anthropic API" });
    }
  }

  // 4. Check Groq API key (format gsk_...)
  if (apiKey.startsWith("gsk_")) {
    try {
      const res = await fetch("https://api.groq.com/openai/v1/models", {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(6000),
      });
      if (res.ok) {
        return NextResponse.json({ valid: true, provider: "Groq" });
      }
      return NextResponse.json({ valid: false, error: "Invalid Groq API Key" });
    } catch (e) {
      return NextResponse.json({ valid: false, error: "Unable to reach Groq API" });
    }
  }

  // 5. Generic check: Test OpenAI-compatible endpoint
  try {
    const res = await fetch("https://openrouter.ai/api/v1/models", {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(6000),
    });
    if (res.ok) {
      return NextResponse.json({ valid: true, provider: "OpenRouter" });
    }
  } catch {}

  // Fallback: If unknown format but non-empty, accept with warning
  return NextResponse.json({
    valid: true,
    provider: "Custom Provider",
    warning: "Key format recognized but provider unverified",
  });
}
