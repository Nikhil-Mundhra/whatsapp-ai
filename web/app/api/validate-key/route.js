import { NextResponse } from "next/server.js";

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
        const data = await res.json();
        const models = (data.models || [])
          .filter((m) => m.supportedGenerationMethods?.includes("generateContent"))
          .map((m) => {
            const id = m.name.replace("models/", "");
            return { id, name: m.displayName || id };
          })
          .sort((a, b) => b.id.localeCompare(a.id));
        return NextResponse.json({
          valid: true,
          provider: "Google Gemini",
          models: models.length ? models : [
            { id: "gemini-2.0-flash", name: "Gemini 2.0 Flash" },
            { id: "gemini-1.5-flash", name: "Gemini 1.5 Flash" },
            { id: "gemini-1.5-pro", name: "Gemini 1.5 Pro" },
          ],
          defaultModel: "gemini-2.0-flash",
        });
      }
      return NextResponse.json({ valid: false, error: "Invalid Gemini API Key or permission denied" });
    } catch (e) {
      return NextResponse.json({ valid: false, error: "Unable to reach Gemini API" });
    }
  }

  // 2. Check Anthropic / Claude API key (format sk-ant-...)
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
        const data = await res.json();
        const models = (data.data || []).map((m) => ({
          id: m.id,
          name: m.display_name || m.id,
        }));
        return NextResponse.json({
          valid: true,
          provider: "Anthropic Claude",
          models: models.length ? models : [
            { id: "claude-3-5-sonnet-20241022", name: "Claude 3.5 Sonnet (Recommended)" },
            { id: "claude-3-5-haiku-20241022", name: "Claude 3.5 Haiku (Fast)" },
          ],
          defaultModel: "claude-3-5-sonnet-20241022",
        });
      }
      return NextResponse.json({ valid: false, error: "Invalid Anthropic API Key" });
    } catch (e) {
      return NextResponse.json({ valid: false, error: "Unable to reach Anthropic API" });
    }
  }

  // 3. Check OpenAI API key (format sk-...)
  if (apiKey.startsWith("sk-proj-") || apiKey.startsWith("sk-")) {
    // Check if OpenRouter key first (some openrouter keys start with sk-or-)
    if (apiKey.startsWith("sk-or-")) {
      return validateOpenRouter(apiKey);
    }

    try {
      const res = await fetch("https://api.openai.com/v1/models", {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(6000),
      });
      if (res.ok) {
        const data = await res.json();
        const chatIds = ["gpt-4o", "gpt-4o-mini", "o3-mini", "o1", "gpt-4-turbo", "gpt-3.5-turbo"];
        const found = (data.data || []).map((m) => m.id);
        const models = chatIds
          .filter((id) => found.includes(id))
          .map((id) => ({ id, name: id }));
        return NextResponse.json({
          valid: true,
          provider: "OpenAI",
          models: models.length ? models : [
            { id: "gpt-4o-mini", name: "GPT-4o Mini (Fast & Cheap)" },
            { id: "gpt-4o", name: "GPT-4o (Most Capable)" },
            { id: "o3-mini", name: "o3-mini (Reasoning)" },
          ],
          defaultModel: "gpt-4o-mini",
        });
      }
      // If OpenAI fails, try OpenRouter as fallback
      const orResult = await checkOpenRouter(apiKey);
      if (orResult) return NextResponse.json(orResult);

      return NextResponse.json({ valid: false, error: "Invalid OpenAI API Key" });
    } catch (e) {
      return NextResponse.json({ valid: false, error: "Unable to reach OpenAI API" });
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
        const data = await res.json();
        const models = (data.data || [])
          .filter((m) => m.active !== false)
          .map((m) => ({ id: m.id, name: m.id }))
          .sort((a, b) => a.id.localeCompare(b.id));
        return NextResponse.json({
          valid: true,
          provider: "Groq",
          models: models.length ? models : [
            { id: "llama-3.3-70b-versatile", name: "Llama 3.3 70B (Versatile)" },
            { id: "qwen-2.5-32b", name: "Qwen 2.5 32B" },
            { id: "deepseek-r1-distill-llama-70b", name: "DeepSeek R1 Distill 70B" },
          ],
          defaultModel: "llama-3.3-70b-versatile",
        });
      }
      return NextResponse.json({ valid: false, error: "Invalid Groq API Key" });
    } catch (e) {
      return NextResponse.json({ valid: false, error: "Unable to reach Groq API" });
    }
  }

  // 5. OpenRouter Check
  const orResult = await checkOpenRouter(apiKey);
  if (orResult) return NextResponse.json(orResult);

  // Fallback: If unknown format but non-empty, accept with custom models
  return NextResponse.json({
    valid: true,
    provider: "Custom Provider",
    warning: "Key format recognized (Custom provider)",
    models: [
      { id: "qwen-2.5-72b", name: "Qwen 2.5 72B" },
      { id: "qwen-2.5-32b", name: "Qwen 2.5 32B" },
      { id: "gpt-4o-mini", name: "GPT-4o Mini" },
      { id: "custom", name: "Custom / Default" },
    ],
    defaultModel: "qwen-2.5-72b",
  });
}

async function validateOpenRouter(apiKey) {
  const result = await checkOpenRouter(apiKey);
  if (result) return NextResponse.json(result);
  return NextResponse.json({ valid: false, error: "Invalid OpenRouter API Key" });
}

async function checkOpenRouter(apiKey) {
  try {
    const res = await fetch("https://openrouter.ai/api/v1/models", {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(7000),
    });
    if (res.ok) {
      const data = await res.json();
      const rawModels = data.data || [];

      // Sort highlighted/popular models to the top
      const popularPrefixes = [
        "qwen/qwen3",
        "qwen/qwen-3",
        "qwen/qwen2.5",
        "qwen/qwen-2.5",
        "qwen/",
        "anthropic/claude-3.7",
        "anthropic/claude-3.5",
        "deepseek/deepseek-r1",
        "deepseek/deepseek-chat",
        "meta-llama/llama-3.3",
        "google/gemini-2.0",
        "openai/gpt-4o",
      ];

      const models = rawModels.map((m) => ({
        id: m.id,
        name: m.name || m.id,
        context_length: m.context_length,
      }));

      models.sort((a, b) => {
        const aPop = popularPrefixes.findIndex((p) => a.id.toLowerCase().startsWith(p));
        const bPop = popularPrefixes.findIndex((p) => b.id.toLowerCase().startsWith(p));
        if (aPop !== -1 && bPop !== -1) return aPop - bPop;
        if (aPop !== -1) return -1;
        if (bPop !== -1) return 1;
        return a.name.localeCompare(b.name);
      });

      const topQwen = models.find((m) => m.id.toLowerCase().includes("qwen"));

      return {
        valid: true,
        provider: "OpenRouter",
        models: models.slice(0, 150), // Top 150 models from live OpenRouter catalog
        defaultModel: topQwen ? topQwen.id : (models[0]?.id || "qwen/qwen-2.5-72b-instruct"),
      };
    }
  } catch {}
  return null;
}
