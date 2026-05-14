import { NextResponse } from "next/server";
import OpenAI from "openai";

export const runtime = "nodejs";

export async function GET() {
  const gatewayUrl = process.env.AI_GATEWAY_URL ?? "(not set)";
  const gatewayToken = process.env.AI_GATEWAY_TOKEN ?? "";
  const model = process.env.AI_TEXT_MODEL ?? "gemini-2.0-flash";

  const tokenPresent = gatewayToken.length > 0;
  const tokenPrefix = tokenPresent ? gatewayToken.slice(0, 8) + "..." : "(empty)";

  // Try a minimal chat completion to get the real error
  let testResult: unknown = null;
  if (tokenPresent) {
    try {
      const client = new OpenAI({ baseURL: gatewayUrl, apiKey: gatewayToken });
      const resp = await client.chat.completions.create({
        model,
        messages: [{ role: "user", content: "Say: OK" }],
        max_tokens: 10,
      });
      testResult = { ok: true, content: resp.choices[0]?.message?.content };
    } catch (err) {
      const e = err as { status?: number; message?: string; error?: unknown; headers?: unknown };
      testResult = {
        ok: false,
        status: e.status,
        message: e.message,
        error: e.error,
      };
    }
  }

  return NextResponse.json({
    gateway_url: gatewayUrl,
    token_present: tokenPresent,
    token_prefix: tokenPrefix,
    model,
    test_result: testResult,
  });
}
