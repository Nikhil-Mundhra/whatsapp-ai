import { NextResponse } from "next/server.js";
import {
  verifySuperadminSession,
  getAiUsageStats,
  setGlobalAiConfig,
} from "../../../../lib/superadmin.js";

/**
 * GET /api/superadmin/ai-providers
 * Retrieves global AI provider configurations, API key masked states, and usage telemetry.
 */
export async function GET(request) {
  const isAuth = await verifySuperadminSession(request);
  if (!isAuth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const stats = await getAiUsageStats();
    return NextResponse.json(stats, { status: 200 });
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to fetch AI provider telemetry", details: err.message },
      { status: 500 }
    );
  }
}

/**
 * POST /api/superadmin/ai-providers
 * Updates global AI provider keys (GROQ_API_KEY, OPENROUTER_API_KEY, AI_MODEL, WHISPER_PROVIDER).
 */
export async function POST(request) {
  const isAuth = await verifySuperadminSession(request);
  if (!isAuth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const updated = await setGlobalAiConfig(body);
    return NextResponse.json({ success: true, config: updated }, { status: 200 });
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to update AI provider configuration", details: err.message },
      { status: 500 }
    );
  }
}
