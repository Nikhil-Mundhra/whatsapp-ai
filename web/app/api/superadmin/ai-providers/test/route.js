import { NextResponse } from "next/server.js";
import {
  verifySuperadminSession,
  getGlobalAiConfig,
} from "../../../../../lib/superadmin.js";

/**
 * POST /api/superadmin/ai-providers/test
 * Tests connectivity and key validity with Groq or OpenRouter APIs.
 */
export async function POST(request) {
  const isAuth = await verifySuperadminSession(request);
  if (!isAuth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const provider = body.provider || "groq";
    let testKey = body.apiKey;

    // If key not provided in body, load active key from config/env
    if (!testKey) {
      const config = await getGlobalAiConfig();
      if (provider === "groq") {
        testKey = globalThis.__superadminAiConfigFallback?.groqApiKey || process.env.GROQ_API_KEY || "";
      } else if (provider === "openrouter") {
        testKey = globalThis.__superadminAiConfigFallback?.openrouterApiKey || process.env.OPENROUTER_API_KEY || process.env.AI_API_KEY || "";
      }
    }

    if (!testKey) {
      return NextResponse.json(
        { success: false, error: `No API key configured for ${provider}` },
        { status: 400 }
      );
    }

    const start = Date.now();

    if (provider === "groq") {
      // Test Groq models endpoint
      const res = await fetch("https://api.groq.com/openai/v1/models", {
        headers: { Authorization: `Bearer ${testKey}` },
        signal: AbortSignal.timeout(6000),
      });

      const latencyMs = Date.now() - start;

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        return NextResponse.json({
          success: false,
          error: errJson.error?.message || `Groq API responded with status ${res.status}`,
          latencyMs,
        }, { status: 400 });
      }

      const json = await res.json();
      const whisperModelAvailable = Array.isArray(json.data) && json.data.some((m) => m.id?.includes("whisper"));

      return NextResponse.json({
        success: true,
        provider: "groq",
        latencyMs,
        message: "Successfully connected to Groq Cloud API",
        whisperAvailable: whisperModelAvailable,
      }, { status: 200 });
    } else if (provider === "openrouter") {
      // Test OpenRouter auth
      const res = await fetch("https://openrouter.ai/api/v1/auth/key", {
        headers: { Authorization: `Bearer ${testKey}` },
        signal: AbortSignal.timeout(6000),
      });

      const latencyMs = Date.now() - start;

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        return NextResponse.json({
          success: false,
          error: errJson.error?.message || `OpenRouter API responded with status ${res.status}`,
          latencyMs,
        }, { status: 400 });
      }

      const json = await res.json();
      return NextResponse.json({
        success: true,
        provider: "openrouter",
        latencyMs,
        message: "Successfully connected to OpenRouter API",
        data: json.data,
      }, { status: 200 });
    }

    return NextResponse.json(
      { success: false, error: `Unsupported provider '${provider}'` },
      { status: 400 }
    );
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err.message || "Connection test timed out" },
      { status: 500 }
    );
  }
}
